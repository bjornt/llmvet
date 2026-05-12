# llmvet

Local code-review tool for LLM/agent harnesses. See [SPEC.md](SPEC.md) for the
design and [PLAN.md](PLAN.md) for the implementation plan.

## Build

```
make web    # build the frontend bundle (writes internal/assets/dist/)
make build  # compile bin/llmvet with the bundle embedded
make test   # run Go tests
make clean  # remove build artifacts
```

`make build` runs `make web` first because `//go:embed` requires the vite
output to exist at compile time.
