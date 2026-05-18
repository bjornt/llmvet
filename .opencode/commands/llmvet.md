---
description: Start a local web review of the current diff
---

Execute `llmvet` directly — assume it is already on the PATH. If the command fails, print the error and stop. Do not search for the binary.

This starts a local web server, opens the browser, and **blocks** until the human reviewer either submits comments or approves the diff.

Capture its stdout. If there is output, it contains review comments in this format:

```
The reviewer left the following comments on your changes. Address each one, then re-run the review.

<file>:<line> (<side>)
> <comment body>
```

Address every comment. If stdout is empty the diff was approved — no further action needed.
