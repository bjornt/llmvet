import { tool, type Plugin } from "@opencode-ai/plugin"
import { spawn, type ChildProcess } from "node:child_process"

type LlmvetResult = {
  stdout: string
  exitCode: number
}

function startLlmvet(
  port: number,
  onUrl: (url: string) => void,
  signal: AbortSignal,
): Promise<LlmvetResult> {
  return new Promise<LlmvetResult>((resolve, reject) => {
    const args = ["-port", String(port || 3847)]
    const proc: ChildProcess = spawn("llmvet", args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderrBuf = ""
    let urlShown = false

    proc.stdout!.on("data", (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr!.on("data", (data: Buffer) => {
      stderrBuf += data.toString()
      if (!urlShown) {
        const urlMatch = stderrBuf.match(/Open (http:\/\/[^\s]+) to review/)
        if (urlMatch) {
          urlShown = true
          onUrl(urlMatch[1])
        }
      }
    })

    const onAbort = () => {
      proc.kill("SIGTERM")
      reject(new Error("llmvet review was aborted"))
    }

    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener("abort", onAbort, { once: true })

    proc.on("close", (code) => {
      signal.removeEventListener("abort", onAbort)
      resolve({ stdout, exitCode: code ?? 0 })
    })

    proc.on("error", (err) => {
      signal.removeEventListener("abort", onAbort)
      reject(err)
    })
  })
}

export const LlmvetPlugin: Plugin = async ({ client }) => {
  return {
    tool: {
      llmvet: tool({
        description:
          "Start a local web-based code review with llmvet. " +
          "The tool blocks until the human reviewer submits comments or approves the diff. " +
          "Use this when the user asks to review changes, run a code review, or requests human-in-the-loop review. " +
          "Before calling this tool, tell the user to open http://localhost:<port>/ in their browser to review the diff.",
        args: {
          port: tool.schema
            .number()
            .default(3847)
            .describe(
              "TCP port to bind the review server on localhost. Defaults to 3847.",
            ),
        },
        async execute(args, ctx) {
          ctx.metadata({ title: "⏳ Waiting for review…" })

          try {
            const result = await startLlmvet(
              args.port,
              (url) => {
                // Show the review URL as a toast so the user can open it
                client.tui.showToast({
                  body: {
                    message: `Review URL: ${url}`,
                    variant: "info",
                    duration: 30000,
                  },
                })
                ctx.metadata({ title: `⏳ Review: ${url}` })
              },
              ctx.abort,
            )

            if (result.exitCode === 130) {
              ctx.metadata({ title: "Review aborted" })
              return "The code review was aborted by the reviewer."
            }

            if (result.exitCode !== 0) {
              ctx.metadata({ title: "Review failed" })
              return `llmvet exited with code ${result.exitCode}`
            }

            const output = result.stdout.trim()
            if (output) {
              ctx.metadata({ title: "Review: comments received" })
              return output
            }

            ctx.metadata({ title: "Review approved" })
            return "The code review was approved with no comments."
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes("ENOENT")) {
              ctx.metadata({ title: "llmvet not found" })
              return "llmvet binary not found on PATH. Make sure it is installed."
            }
            if (message.includes("aborted")) {
              ctx.metadata({ title: "Review aborted" })
              return "The code review was aborted."
            }
            ctx.metadata({ title: "Review error" })
            return `Failed to run llmvet: ${message}`
          }
        },
      }),
    },
  }
}
