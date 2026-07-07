/**
 * Shared llmvet core for the pi and oh-my-pi extensions.
 *
 * Owns the host-agnostic pieces: spawning the llmvet binary, surfacing the
 * review URL, waiting for the reviewer, and mapping the outcome to the
 * user-message / tool-result shapes each runtime expects.
 *
 * Host-specific concerns live in the thin per-runtime wrappers under
 * share/pi-extensions/ and share/oh-my-pi-extensions/:
 *   - package import scope (@earendil-works vs @oh-my-pi)
 *   - parameter schema library (typebox Type vs pi.zod)
 *   - the pi-only tool-result `terminate` flag and promptSnippet/guidelines
 *     fields (oh-my-pi's AgentToolResult/ToolDefinition have neither)
 *
 * Uses node:child_process (not Bun.spawn) deliberately: this module is shared
 * with pi, whose runtime may not expose Bun globals. child_process works
 * identically under both Bun and Node.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface LlmvetResult {
	stdout: string;
	exitCode: number;
}

export type LlmvetOutcome =
	| { kind: "aborted" }
	| { kind: "error"; message: string }
	| { kind: "comments"; text: string }
	| { kind: "approved" };

/**
 * Minimal structural slice of the host ExtensionContext used by runReview.
 * Both pi and oh-my-pi expose `ui.notify` and `ui.setStatus` with these
 * shapes, so the real context is structurally assignable.
 */
export interface LlmvetContext {
	ui: {
		notify(message: string, level: "info" | "error"): void;
		setStatus(key: string, text: string | undefined): void;
	};
}

export function startLlmvet(
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

export async function runReview(ctx: LlmvetContext): Promise<LlmvetOutcome> {
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

// --- Shared copy -----------------------------------------------------------

export const LLMVET_TOOL_DESCRIPTION =
	"Start a local web-based code review with llmvet. " +
	"The tool blocks until the human reviewer submits comments or approves the diff. " +
	"Use this when the user asks to review changes or run llmvet.";

export const LLMVET_ABORTED_USER_MESSAGE =
	"The code review was aborted by the reviewer. No action needed.";
export const LLMVET_APPROVED_USER_MESSAGE =
	"The code review was approved with no comments. No changes needed.";

export const LLMVET_ABORTED_TOOL_TEXT = "The code review was aborted by the reviewer.";
export const LLMVET_APPROVED_TOOL_TEXT = "The code review was approved with no comments.";

// --- Outcome mapping -------------------------------------------------------

export type LlmvetCommandAction =
	| { kind: "notify"; message: string }
	| { kind: "send"; message: string };

/** Map a review outcome to the action a /llmvet command handler should take. */
export function llmvetCommandAction(outcome: LlmvetOutcome): LlmvetCommandAction {
	switch (outcome.kind) {
		case "aborted":
			return { kind: "send", message: LLMVET_ABORTED_USER_MESSAGE };
		case "error":
			return { kind: "notify", message: outcome.message };
		case "comments":
			return { kind: "send", message: outcome.text };
		case "approved":
			return { kind: "send", message: LLMVET_APPROVED_USER_MESSAGE };
	}
}

export interface LlmvetToolResult {
	content: { type: "text"; text: string }[];
	details: { action: "aborted" | "submit" | "approve" };
	/**
	 * End the agent turn after this tool result. pi supports this on
	 * AgentToolResult; oh-my-pi does not, so its wrapper passes terminate:false
	 * and the field is omitted. Only set for submit/approve outcomes.
	 */
	terminate?: boolean;
}

/**
 * Build a tool result for a non-error review outcome.
 *
 * Callers must handle the `error` outcome themselves (by throwing), since a
 * tool result cannot represent it.
 */
export function llmvetToolResult(
	outcome: Exclude<LlmvetOutcome, { kind: "error" }>,
	options: { terminate: boolean },
): LlmvetToolResult {
	switch (outcome.kind) {
		case "aborted":
			return {
				content: [{ type: "text", text: LLMVET_ABORTED_TOOL_TEXT }],
				details: { action: "aborted" },
			};
		case "comments":
			return {
				content: [{ type: "text", text: outcome.text }],
				details: { action: "submit" },
				...(options.terminate ? { terminate: true } : {}),
			};
		case "approved":
			return {
				content: [{ type: "text", text: LLMVET_APPROVED_TOOL_TEXT }],
				details: { action: "approve" },
				...(options.terminate ? { terminate: true } : {}),
			};
	}
}
