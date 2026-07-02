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

## Releases

Releases are cut from a version tag and published automatically by the
`release` GitHub Actions workflow (`.github/workflows/release.yml`).

To release:

1. Bump `var Version` in `cmd/llmvet/main.go` and merge to `main`.
2. Tag the commit and push the tag:

   ```
   git tag v0.2.0        # must match var Version
   git push origin v0.2.0
   ```

Pushing the tag mirrors the repo to Launchpad, which builds the snap and
publishes it to the Snap Store for every architecture. The `release` workflow
then waits for that store build, downloads each architecture's snap, verifies
its `sha3-384`, extracts `bin/llmvet` from the squashfs, and creates the
GitHub Release with:

- `llmvet_<version>_<arch>.snap` — the published snap, per architecture
- `llmvet_<version>_<arch>` — the executable extracted from that snap
- `SHA256SUMS` — checksums over every attached file

The release targets `amd64` and `arm64`; both must be published at the target
version or the release fails rather than shipping a partial set. (The snap also
builds `ppc64el` and `s390x`, but those are not currently included — adjust
`--arches` in `.github/workflows/release.yml` to change the set.) Because the
store build is asynchronous, the workflow polls for up to ~40 minutes for both
architectures to appear. If a tag is pushed before the snap is ready — or a
build lags past the timeout — re-run the workflow manually (Actions → release →
Run workflow) once the builds have landed; it will attach the assets to the
existing release.

The released executables are byte-identical to what Snap Store users get —
they are extracted from the published snaps, not rebuilt.
