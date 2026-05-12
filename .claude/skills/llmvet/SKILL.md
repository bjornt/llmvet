---
name: llmvet
description: Start a local web-based code review server that lets a human review the current diff and either submit comments or approve
---

## What I do

llmvet is a local code-review tool. After changes are made, it serves the diff as a web UI so a human can leave inline comments. The human submits (returning comments) or approves (no comments).

## Workflow

1. Run `llmvet` — this blocks until the review finishes. It opens a browser tab with the diff.
2. After the review:
   - **Stdout non-empty**: the reviewer left comments. Each block has the format:
     ```
     <file>:<line> (<side>)
     > <comment body>
     ```
     Address every comment.
   - **Stdout empty**: the diff was approved. No further action needed.

## When to use me

Use this when the user wants to review changes — for example when they say "review the changes", "llmvet the changes", or "run llmvet", or in any other way implies that llmvet should be run. Do not use this for non-review tasks.
