/**
 * llmvet Extension for oh-my-pi
 *
 * Registers /llmvet command and llmvet tool. Runs the llmvet binary,
 * shows the review URL from stderr, waits for the human reviewer, and
 * sends the output as a prompt to the agent.
 *
 * - Reviewer submits comments → comments are sent as a user message
 * - Reviewer approves → approval message sent
 * - Reviewer aborts → abort message sent
 *
 * The process/spawn and outcome-mapping logic is shared with the pi
 * extension via ../llmvet-core.ts. This wrapper only supplies the
 * oh-my-pi-specific bits: the @oh-my-pi import scope, the canonical zod
 * parameter schema (via pi.zod), and omits the pi-only tool-result
 * `terminate` flag (oh-my-pi's AgentToolResult has no such field — the
 * agent continues the turn and acts on the returned review comments).
 */

import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
	LLMVET_TOOL_DESCRIPTION,
	llmvetCommandAction,
	llmvetToolResult,
	runReview,
} from "../llmvet-core";

export default function (pi: ExtensionAPI) {
	const { z } = pi.zod;

	// /llmvet command — user-triggered review
	pi.registerCommand("llmvet", {
		description: "Start a code review with llmvet",
		handler: async (_args, ctx: ExtensionContext) => {
			const action = llmvetCommandAction(await runReview(ctx));
			if (action.kind === "notify") {
				ctx.ui.notify(action.message, "error");
			} else {
				pi.sendUserMessage(action.message);
			}
		},
	});

	// llmvet tool — agent-triggered review
	pi.registerTool({
		name: "llmvet",
		label: "Code Review",
		description: LLMVET_TOOL_DESCRIPTION,
		parameters: z.object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const outcome = await runReview(ctx);
			if (outcome.kind === "error") throw new Error(outcome.message);
			return llmvetToolResult(outcome, { terminate: false });
		},
	});
}
