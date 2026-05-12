# llmvet

llmvet is a local code-review tool for LLM/agent harnesses. It shows a diff in
the browser, lets a human reviewer leave inline comments, and then prints a
prompt (with the comments) to stdout for the agent to consume.

When the reviewer approves without changes, llmvet exits with code 0 and no
output. When they submit comments, the prompt is written to stdout — the agent
can capture it from there.

## Usage

### Agent harness

An agent calls llmvet after making changes to the working tree:

```
bin/llmvet
```

This starts a local web server, opens a browser tab showing the diff, and
blocks until the reviewer either submits comments or approves. When the
reviewer submits, the review prompt (one `> `-blockquoted comment per inline
note) is printed to stdout, which the agent can capture and act on.

### Manual / CLI

You can run the review yourself from the command line. The output is the same
prompt format that an agent would see — copy it into your LLM context:

```
bin/llmvet
# opens http://127.0.0.1:<port>/ in your browser
# review the diff, leave comments, click Submit
# the prompt with comments is printed to stdout
```

Options:

- `-port <n>` — bind on a specific TCP port (default: random free port)
- `-no-open` — print the URL instead of opening the browser automatically

### Exit codes

| Code | Meaning |
|------|---------|
| 0    | Approved (no output) or submitted (prompt on stdout) |
| 130  | Review aborted (Ctrl-C, SIGTERM, browser closed without acting) |

## Build

```
make web    # build the frontend bundle (writes internal/assets/dist/)
make build  # compile bin/llmvet with the bundle embedded
make test   # run Go tests
make clean  # remove build artifacts
```

`make build` runs `make web` first because `//go:embed` requires the vite
output to exist at compile time.
