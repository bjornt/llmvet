/**
 * llmvet Extension for pi
 *
 * Registers /llmvet command and llmvet tool. Runs the llmvet binary,
 * shows the review URL from stderr, waits for the human reviewer, and
 * sends the output as a prompt to the agent.
 *
 * - Reviewer submits comments → comments are sent as a user message
 * - Reviewer approves → approval message sent
 * - Reviewer aborts → abort message sent
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn, type ChildProcess } from "node:child_process";

interface LlmvetResult {
	stdout: string;
	exitCode: number;
}

function startLlmvet(
	onUrl: (url: string) => void,
	onStatus: (text: string | undefined) => void,
): Promise<LlmvetResult> & { cancel: () => void } {
	let cancelled = false;
	let resolveFn!: (result: LlmvetResult) => void;
	let rejectFn!: (err: Error) => void;

	const promise = new Promise<LlmvetResult>((resolve, reject) => {
		resolveFn = resolve;
		rejectFn = reject;
	});

	const proc: ChildProcess = spawn("llmvet", [], {
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderrBuf = "";
	let urlShown = false;

	proc.stdout!.on("data", (data: Buffer) => {
		stdout += data.toString();
	});

	proc.stderr!.on("data", (data: Buffer) => {
		stderrBuf += data.toString();

		// Look for the URL line (may span chunks)
		if (!urlShown) {
			const urlMatch = stderrBuf.match(/Open (http:\/\/[^\s]+) to review/);
			if (urlMatch) {
				urlShown = true;
				onUrl(urlMatch[1]);
				onStatus(`⏳ Review: ${urlMatch[1]}`);
			}
		}
	});

	proc.on("close", (code) => {
		onStatus(undefined);
		if (cancelled) {
			resolveFn({ stdout: "", exitCode: 130 });
		} else {
			resolveFn({ stdout, exitCode: code ?? 0 });
		}
	});

	proc.on("error", (err) => {
		onStatus(undefined);
		rejectFn(err);
	});

	return Object.assign(promise, {
		cancel() {
			cancelled = true;
			proc.kill("SIGTERM");
		},
	});
}

type LlmvetOutcome =
	| { kind: "aborted" }
	| { kind: "error"; message: string }
	| { kind: "comments"; text: string }
	| { kind: "approved" };

async function runReview(ctx: ExtensionContext): Promise<LlmvetOutcome> {
	try {
		const proc = startLlmvet(
			(url) => ctx.ui.notify(`Review URL: ${url}`, "info"),
			(text) => ctx.ui.setStatus("llmvet", text),
		);

		const result = await proc;

		if (result.exitCode === 130) return { kind: "aborted" };
		if (result.exitCode !== 0) return { kind: "error", message: `llmvet exited with code ${result.exitCode}` };

		const output = result.stdout.trim();
		if (output) return { kind: "comments", text: output };
		return { kind: "approved" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("ENOENT")) {
			return { kind: "error", message: "llmvet binary not found on PATH" };
		}
		return { kind: "error", message: `Failed to run llmvet: ${message}` };
	}
}

export default function (pi: ExtensionAPI) {
	// /llmvet command — user-triggered review
	pi.registerCommand("llmvet", {
		description: "Start a code review with llmvet",
		handler: async (_args, ctx) => {
			const outcome = await runReview(ctx);
			switch (outcome.kind) {
				case "aborted":
					pi.sendUserMessage("The code review was aborted by the reviewer. No action needed.");
					break;
				case "error":
					ctx.ui.notify(outcome.message, "error");
					break;
				case "comments":
					pi.sendUserMessage(outcome.text);
					break;
				case "approved":
					pi.sendUserMessage("The code review was approved with no comments. No changes needed.");
					break;
			}
		},
	});

	// llmvet tool — agent-triggered review
	pi.registerTool({
		name: "llmvet",
		label: "Code Review",
		description:
			"Start a local web-based code review with llmvet. " +
			"The tool blocks until the human reviewer submits comments or approves the diff. " +
			"Use this when the user asks to review changes or run llmvet.",
		promptSnippet: "Run a human-in-the-loop code review via llmvet",
		promptGuidelines: [
			"Use llmvet when the user asks to review changes, run a code review, or requests human-in-the-loop review.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const outcome = await runReview(ctx);
			switch (outcome.kind) {
				case "aborted":
					return {
						content: [{ type: "text", text: "The code review was aborted by the reviewer." }],
						details: { action: "aborted" },
					};
				case "error":
					throw new Error(outcome.message);
				case "comments":
					return {
						content: [{ type: "text", text: outcome.text }],
						details: { action: "submit" },
						terminate: true,
					};
				case "approved":
					return {
						content: [{ type: "text", text: "The code review was approved with no comments." }],
						details: { action: "approve" },
						terminate: true,
					};
			}
		},
	});
}
