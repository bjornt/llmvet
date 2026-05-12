# AGENTS.md

## Overview

llmvet is a local code-review tool for LLM/agent harnesses. An agent invokes it after making changes; a human reviews the diff in a browser, leaves inline comments, and either submits the review (returning comments as a prompt for the agent) or approves without changes.

- **Backend**: Go, standard library `net/http`, no web framework. Frontend assets embedded via `//go:embed`. Diffs from `git` CLI.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, `react-diff-view` for diff rendering.
- **Entry point**: `cmd/llmvet/`
- **Internal packages**: `internal/diff` (diff parsing), `internal/server` (HTTP API), `internal/assets` (embedded frontend)

## Build

```sh
make web    # build frontend bundle (writes internal/assets/dist/)
make build  # compile bin/llmvet (runs make web first; //go:embed requires dist/)
make clean  # remove build artifacts
```

Node.js is required for `make web`. The Go binary is fully self-contained once built.

## Test

```sh
make test   # runs go test ./...
```
