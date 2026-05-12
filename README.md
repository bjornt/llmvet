# llmreview

Local code-review tool for LLM/agent harnesses. See [SPEC.md](SPEC.md) for the
design and [PLAN.md](PLAN.md) for the implementation plan.

## Build

```
make web    # build the frontend bundle (writes internal/assets/dist/)
make build  # compile bin/llmreview with the bundle embedded
make test   # run Go tests
make clean  # remove build artifacts
```

`make build` works without first running `make web` — a placeholder
`index.html` is embedded so the binary always compiles.
