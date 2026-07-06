import type {
    ChangeData,
    HunkData,
    DiffType,
    TokenNode,
} from "react-diff-view";
import type { File } from "./types";

import { refractor } from "refractor";
import ts from "refractor/lang/typescript";
import tsx from "refractor/lang/tsx";
import js from "refractor/lang/javascript";
import jsx from "refractor/lang/jsx";
import python from "refractor/lang/python";
import go from "refractor/lang/go";
import rust from "refractor/lang/rust";
import ruby from "refractor/lang/ruby";
import java from "refractor/lang/java";
import kotlin from "refractor/lang/kotlin";
import c from "refractor/lang/c";
import cpp from "refractor/lang/cpp";
import csharp from "refractor/lang/csharp";
import css from "refractor/lang/css";
import markup from "refractor/lang/markup";
import json from "refractor/lang/json";
import yaml from "refractor/lang/yaml";
import markdown from "refractor/lang/markdown";
import sql from "refractor/lang/sql";
import bash from "refractor/lang/bash";
import php from "refractor/lang/php";
import swift from "refractor/lang/swift";
import scala from "refractor/lang/scala";
import dart from "refractor/lang/dart";
import lua from "refractor/lang/lua";
import powershell from "refractor/lang/powershell";
import graphql from "refractor/lang/graphql";
import toml from "refractor/lang/toml";
import docker from "refractor/lang/docker";
import diff from "refractor/lang/diff";
import makefile from "refractor/lang/makefile";
import ini from "refractor/lang/ini";

refractor.register(ts);
refractor.register(tsx);
refractor.register(js);
refractor.register(jsx);
refractor.register(python);
refractor.register(go);
refractor.register(rust);
refractor.register(ruby);
refractor.register(java);
refractor.register(kotlin);
refractor.register(c);
refractor.register(cpp);
refractor.register(csharp);
refractor.register(css);
refractor.register(markup);
refractor.register(json);
refractor.register(yaml);
refractor.register(markdown);
refractor.register(sql);
refractor.register(bash);
refractor.register(php);
refractor.register(swift);
refractor.register(scala);
refractor.register(dart);
refractor.register(lua);
refractor.register(powershell);
refractor.register(graphql);
refractor.register(toml);
refractor.register(docker);
refractor.register(diff);
refractor.register(makefile);
refractor.register(ini);

const EXT_LANG: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    go: "go",
    py: "python",
    rs: "rust",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    scala: "scala",
    dart: "dart",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    cs: "csharp",
    css: "css",
    html: "markup",
    htm: "markup",
    xml: "markup",
    svg: "markup",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    mdx: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    dockerfile: "docker",
    Dockerfile: "docker",
    php: "php",
    swift: "swift",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    graphql: "graphql",
    gql: "graphql",
    ps1: "powershell",
    psd1: "powershell",
    psm1: "powershell",
    lua: "lua",
    makefile: "makefile",
    Makefile: "makefile",
    mk: "makefile",
    patch: "diff",
    diff: "diff",
};

export function detectLanguage(path: string): string | undefined {
    const basename = path.split("/").pop() ?? path;
    const ext = basename.includes(".")
        ? basename.split(".").pop()!.toLowerCase()
        : basename;
    const lang = EXT_LANG[ext] ?? EXT_LANG[basename];
    if (
        lang &&
        typeof refractor.registered === "function" &&
        refractor.registered(lang)
    ) {
        return lang;
    }
    if (lang) {
        try {
            refractor.highlight("", lang);
            return lang;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function mapDiffType(status: string): DiffType {
    switch (status) {
        case "added":
            return "add";
        case "deleted":
            return "delete";
        case "modified":
            return "modify";
        case "renamed":
            return "rename";
        case "copied":
            return "copy";
        default:
            return "modify";
    }
}

function generateHunkContent(hunk: {
    old_start: number;
    old_lines: number;
    new_start: number;
    new_lines: number;
    section?: string;
}): string {
    const oldLen = hunk.old_lines;
    const newLen = hunk.new_lines;
    const header = `@@ -${hunk.old_start},${oldLen} +${hunk.new_start},${newLen} @@`;
    return hunk.section ? `${header} ${hunk.section}` : header;
}

function mapLineToChange(line: {
    type: string;
    old: number | null;
    new: number | null;
    content: string;
}): ChangeData {
    if (line.type === "context") {
        return {
            type: "normal",
            content: line.content,
            oldLineNumber: line.old!,
            newLineNumber: line.new!,
            isNormal: true,
        } as ChangeData;
    }
    if (line.type === "delete") {
        return {
            type: "delete",
            content: line.content,
            lineNumber: line.old!,
            isDelete: true,
        } as ChangeData;
    }
    if (line.type === "insert") {
        return {
            type: "insert",
            content: line.content,
            lineNumber: line.new!,
            isInsert: true,
        } as ChangeData;
    }
    throw new Error(`Unknown line type: ${line.type}`);
}

export function mapHunk(hunk: {
    old_start: number;
    old_lines: number;
    new_start: number;
    new_lines: number;
    section?: string;
    lines: {
        type: string;
        old: number | null;
        new: number | null;
        content: string;
    }[];
}): HunkData {
    return {
        content: generateHunkContent(hunk),
        oldStart: hunk.old_start,
        oldLines: hunk.old_lines,
        newStart: hunk.new_start,
        newLines: hunk.new_lines,
        changes: hunk.lines.map(mapLineToChange),
    };
}

export function tokenizeHunks(
    hunks: HunkData[],
    language: string,
): { old: TokenNode[][]; new: TokenNode[][] } {
    const oldMax = Math.max(
        0,
        ...hunks.flatMap((h) =>
            h.changes
                .map((c) =>
                    c.type === "normal"
                        ? c.oldLineNumber
                        : c.type === "delete"
                          ? c.lineNumber
                          : -1,
                )
                .filter((n) => n > 0),
        ),
    );
    const newMax = Math.max(
        0,
        ...hunks.flatMap((h) =>
            h.changes
                .map((c) =>
                    c.type === "normal"
                        ? c.newLineNumber
                        : c.type === "insert"
                          ? c.lineNumber
                          : -1,
                )
                .filter((n) => n > 0),
        ),
    );

    const oldLines: TokenNode[][] = new Array(oldMax);
    const newLines: TokenNode[][] = new Array(newMax);

    for (const hunk of hunks) {
        for (const change of hunk.changes) {
            let tokens: TokenNode[];
            try {
                tokens = refractor.highlight(change.content, language).children;
            } catch {
                tokens = [{ type: "text", value: change.content }];
            }

            if (change.type === "normal") {
                if (change.oldLineNumber! > 0)
                    oldLines[change.oldLineNumber! - 1] = tokens;
                if (change.newLineNumber! > 0)
                    newLines[change.newLineNumber! - 1] = tokens;
            } else if (change.type === "delete") {
                if (change.lineNumber! > 0)
                    oldLines[change.lineNumber! - 1] = tokens;
            } else if (change.type === "insert") {
                if (change.lineNumber! > 0)
                    newLines[change.lineNumber! - 1] = tokens;
            }
        }
    }

    return { old: oldLines, new: newLines };
}

export function addDelCounts(file: File): { adds: number; dels: number } {
    let adds = 0;
    let dels = 0;
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.type === "insert") adds++;
            else if (line.type === "delete") dels++;
        }
    }
    return { adds, dels };
}
