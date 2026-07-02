#!/usr/bin/env python3
"""Collect release artifacts for llmvet from the Snap Store.

The snap is built on Launchpad and published to the store for every
architecture. Each build is stamped with a version string that is a
deterministic function of the source commit:

    <base>-<commit-count>-g<short-hash>

(see snap/snapcraft.yaml override-build). This script recomputes nothing;
it is handed the exact version string to look for, finds the matching
per-architecture builds in the store's public channel-map, downloads each
`.snap`, verifies its sha3-384 against the store metadata, and extracts the
`bin/llmvet` executable from the squashfs.

Output written to <out-dir>:
    llmvet_<version>_<arch>.snap   the published snap, per architecture
    llmvet_<version>_<arch>        the executable extracted from that snap
    SHA256SUMS                     sha256 over everything above

Because Launchpad builds are asynchronous, the target version may not be in
the store yet (or only some architectures may be ready). The script polls
until every discovered architecture is present at the target version, or the
timeout elapses; on timeout it still succeeds as long as every *required*
architecture is present.

No third-party dependencies: standard library + the `unsquashfs` binary.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

INFO_URL = "https://api.snapcraft.io/v2/snaps/info/{name}"
# core24 snaps live on the "16" device series.
INFO_HEADERS = {"Snap-Device-Series": "16"}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def fetch_channel_map(name: str) -> list[dict]:
    """Return the store channel-map for `name` (may be empty)."""
    req = urllib.request.Request(INFO_URL.format(name=name), headers=INFO_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    return data.get("channel-map", [])


def version_matches(candidate: str, target: str) -> bool:
    """True if a store `candidate` version is the release `target`.

    snapcraft builds `<base>-<count>-g<short-hash>`. The hash is
    `git rev-parse --short`, whose length can differ between the release
    runner and Launchpad, so compare base + commit-count exactly and the
    git hash by common prefix rather than requiring a byte-identical string.
    """
    if candidate == target:
        return True

    def split(v: str):
        # base may itself contain '-'; the git suffix is the last two fields.
        parts = v.rsplit("-", 2)
        if len(parts) != 3 or not parts[2].startswith("g"):
            return None
        base, count, ghash = parts[0], parts[1], parts[2][1:]
        return base, count, ghash

    c, t = split(candidate), split(target)
    if not c or not t:
        return False
    if c[0] != t[0] or c[1] != t[1]:
        return False
    a, b = c[2], t[2]
    n = min(len(a), len(b))
    return n > 0 and a[:n] == b[:n]


def builds_for_version(channel_map: list[dict], version: str) -> dict[str, dict]:
    """Map architecture -> channel-map entry matching `version`.

    The same revision is often published to several channels (e.g. stable and
    edge); we key by architecture and keep the highest revision seen.
    """
    out: dict[str, dict] = {}
    for entry in channel_map:
        if not version_matches(entry.get("version", ""), version):
            continue
        arch = entry.get("channel", {}).get("architecture")
        if not arch:
            continue
        prev = out.get(arch)
        if prev is None or entry.get("revision", 0) > prev.get("revision", 0):
            out[arch] = entry
    return out


def wait_for_builds(
    name: str, version: str, arches: set[str], timeout: int, interval: int
) -> dict[str, dict]:
    """Poll the store until every requested arch is at `version`, or fail.

    `arches` is an explicit allowlist: only these architectures are gated and
    returned; any others the snap publishes are ignored. On timeout with any
    requested arch still missing, raises SystemExit — a release must contain
    every architecture it targets.
    """
    deadline = time.monotonic() + timeout
    last: dict[str, dict] = {}
    while True:
        try:
            channel_map = fetch_channel_map(name)
        except urllib.error.URLError as exc:
            log(f"store query failed ({exc}); retrying")
            channel_map = []

        found = {
            arch: entry
            for arch, entry in builds_for_version(channel_map, version).items()
            if arch in arches
        }
        last = found

        missing = sorted(arches - set(found))
        if not missing:
            log(
                f"all {len(found)} architectures ready at {version}: "
                f"{', '.join(sorted(found))}"
            )
            return found

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        log(
            f"waiting for {version}: have [{', '.join(sorted(found)) or '-'}], "
            f"missing [{', '.join(missing)}] "
            f"({int(remaining)}s left)"
        )
        time.sleep(min(interval, max(1, int(remaining))))

    have = set(last)
    still_missing = sorted(arches - have)
    raise SystemExit(
        f"timed out after {timeout}s: not all requested architectures published "
        f"at {version}: missing [{', '.join(still_missing)}] "
        f"(have: {', '.join(sorted(have)) or 'none'})"
    )


def sha3_384(path: str) -> str:
    h = hashlib.sha3_384()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: str) -> int:
    """Download `url` to `dest`, returning bytes written.

    Fails loudly on a short read: a truncated body (mid-stream reset) would
    otherwise pass silently and only surface as a checksum mismatch.
    """
    with urllib.request.urlopen(url, timeout=120) as resp:
        expected = resp.headers.get("Content-Length")
        expected = int(expected) if expected is not None else None
        written = 0
        with open(dest, "wb") as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                written += len(chunk)
    if expected is not None and written != expected:
        raise IOError(f"short read: got {written} of {expected} bytes")
    return written


def extract_binary(snap_path: str, member: str, dest: str) -> None:
    """Extract a single file from a snap (squashfs) to `dest`."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [
                "unsquashfs",
                "-no-progress",
                "-d",
                os.path.join(tmp, "sq"),
                snap_path,
                member,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        extracted = os.path.join(tmp, "sq", member)
        if not os.path.isfile(extracted):
            raise SystemExit(f"{member} not found in {snap_path}")
        shutil.move(extracted, dest)
        os.chmod(dest, 0o755)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snap-name", default="llmvet")
    ap.add_argument(
        "--version", required=True, help="exact snap version string to release"
    )
    ap.add_argument("--out-dir", default="dist")
    ap.add_argument(
        "--binary", default="bin/llmvet", help="path of the executable inside the snap"
    )
    ap.add_argument(
        "--arches",
        default="amd64,arm64",
        help="comma-separated architectures to release; every one must be "
        "published at the target version or the release fails on timeout",
    )
    ap.add_argument(
        "--timeout", type=int, default=1800, help="seconds to wait for builds to appear"
    )
    ap.add_argument(
        "--interval", type=int, default=30, help="seconds between store polls"
    )
    args = ap.parse_args()

    if not shutil.which("unsquashfs"):
        raise SystemExit("unsquashfs not found (install squashfs-tools)")

    arches = {a.strip() for a in args.arches.split(",") if a.strip()}
    os.makedirs(args.out_dir, exist_ok=True)

    builds = wait_for_builds(
        args.snap_name, args.version, arches, args.timeout, args.interval
    )
    if not builds:
        raise SystemExit(f"no builds found for version {args.version}")

    binary_name = os.path.basename(args.binary)
    produced: list[str] = []
    for arch in sorted(builds):
        entry = builds[arch]
        dl = entry["download"]
        snap_name = f"{args.snap_name}_{args.version}_{arch}.snap"
        snap_path = os.path.join(args.out_dir, snap_name)

        want = dl["sha3-384"]
        attempts = 3
        for attempt in range(1, attempts + 1):
            log(
                f"[{arch}] downloading revision {entry['revision']} "
                f"(attempt {attempt}/{attempts}) ..."
            )
            try:
                download(dl["url"], snap_path)
                got = sha3_384(snap_path)
            except (urllib.error.URLError, IOError) as exc:
                log(f"[{arch}] download failed: {exc}")
                got = None
            if got == want:
                break
            if got is not None:
                log(f"[{arch}] sha3-384 mismatch: got {got}, want {want}")
            if attempt == attempts:
                raise SystemExit(
                    f"[{arch}] failed to fetch a valid snap after {attempts} attempts"
                )
            time.sleep(2 * attempt)
        log(f"[{arch}] sha3-384 verified")

        bin_out = os.path.join(args.out_dir, f"{args.snap_name}_{args.version}_{arch}")
        extract_binary(snap_path, args.binary, bin_out)
        log(f"[{arch}] extracted {binary_name} -> {os.path.basename(bin_out)}")

        produced.append(snap_path)
        produced.append(bin_out)

    sums_path = os.path.join(args.out_dir, "SHA256SUMS")
    with open(sums_path, "w") as f:
        for path in produced:
            f.write(f"{sha256(path)}  {os.path.basename(path)}\n")
    log(f"wrote {sums_path} ({len(produced)} files)")

    # Emit the arch list for the workflow (via GITHUB_OUTPUT if present).
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"arches={','.join(sorted(builds))}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
