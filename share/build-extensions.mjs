// Build self-contained, auto-discoverable llmvet extension packages.
//
// The source layout in share/ keeps llmvet-core.ts as a single shared module
// imported (relatively) by the pi and oh-my-pi wrappers. Each host's
// auto-discovery, though, wants a self-contained entry it can load on its
// own — so this script bundles each wrapper into a single index.js with the
// core inlined, marking only the host-provided packages external so they
// resolve against the running agent at load time.
//
// Output (one dir per runtime, each drops straight into the host's
// extensions/ folder for auto-discovery via its `*/index.{ts,js}` rule):
//
//   share/dist/extensions/oh-my-pi/llmvet/index.js
//   share/dist/extensions/pi/llmvet/llmvet/index.js
//
// Host package imports are kept external because the agent runtime hosts
// them: pi provides `typebox` and the `@earendil-works/pi-coding-agent`
// types; oh-my-pi provides `@oh-my-pi/pi-coding-agent`. Type-only imports
// (ExtensionAPI/ExtensionContext) are erased by esbuild, so the oh-my-pi
// bundle ends up importing only `node:child_process`.

import { build } from "esbuild";
import { rm, mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shareDir = here;
const distDir = join(shareDir, "dist", "extensions");

const targets = [
	{
		runtime: "oh-my-pi",
		entry: "oh-my-pi-extensions/llmvet.ts",
		external: ["@oh-my-pi/pi-coding-agent"],
	},
	{
		runtime: "pi",
		entry: "pi-extensions/llmvet.ts",
		// typebox is a runtime import (Type); the pi host provides it.
		external: ["@earendil-works/pi-coding-agent", "typebox"],
	},
];

await rm(join(shareDir, "dist"), { recursive: true, force: true });

for (const target of targets) {
	const entryAbs = resolve(shareDir, target.entry);
	const outDir = join(distDir, target.runtime, "llmvet");
	const outFile = join(outDir, "index.js");
	await mkdir(outDir, { recursive: true });

	const result = await build({
		entryPoints: [entryAbs],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "esnext",
		external: target.external,
		write: false,
		logLevel: "info",
	});

	// esbuild write:false returns output files; emit ourselves so we control layout.
	for (const file of result.outputFiles) {
		await writeFile(outFile, file.text, "utf8");
	}

	// Minimal manifest so the package is self-describing and auto-discovery's
	// `*/package.json` path also picks it up (redundant with index.js discovery,
	const manifest = {
		name: `llmvet-${target.runtime}-extension`,
		private: true,
		type: "module",
		omp: { extensions: ["./index.js"] },
		pi: { extensions: ["./index.js"] },
	};
	await writeFile(join(outDir, "package.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

	console.log(`built ${target.runtime}: ${outFile}`);
}
