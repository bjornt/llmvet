---
name: llmvet
description: Start a local web-based code review server that lets a human review the current diff and either submit comments or approve
---

## What I do

llmvet is a local code-review tool. After changes are made, it serves the diff as a web UI so a human can leave inline comments. The human submits (returning comments) or approves (no comments).

## Workflow

1. Run `llmvet` directly — assume it is already on the PATH. If the command fails, print the error and stop. Do not search for the binary.
2. This starts a local web server, opens the browser, and **blocks** until the human reviewer either submits comments or approves the diff.
3. After the review:
   - **Stdout non-empty**: the reviewer left comments. Each block has the format:
     ```
     The reviewer left the following comments on your changes. Address each one, then re-run the review.

     <file>:<line> (<side>)
     > <comment body>
     ```
     Address every comment.
   - **Stdout empty**: the diff was approved. No further action needed.

## When to use me

  * When the user explicitly triggers this skill (e.g., via /llmvet).
  * When the user asks to "review changes," "run llmvet," or requests a human-in-the-loop review. Do not use this skill for non-review tasks.
