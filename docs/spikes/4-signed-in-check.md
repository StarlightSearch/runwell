# Spike 4: the signed-in check

## Question

What is the cheapest reliable way to tell whether the person's `claude` is signed in, without touching
a credential? What does a signed-out run look like in the stream?

## Setup

- Claude Code 2.1.330, Linux. `claude auth --help` lists `login`, `logout`, `status`.
- Signed-out reading without logging the owner out: `CLAUDE_CONFIG_DIR` pointed at an empty temp folder.
- Network: `strace -f -e trace=connect`.
- Capture: `captures/s4-signed-out.jsonl`.

## What happened

- `claude auth status --json`, signed in, 5 runs: exit 0 every time, 123 to 160 ms. The JSON has the keys
  `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType`, `planTier`, `loginExpiresAt`,
  `configDirectory`, `projectsDirectory`, `analyticsDisabled`, `consoleProfileSignInOffered`,
  `storedClaudeAiLogin`, and also **`email`, `orgId` and `orgName`**. No token appears.
- Signed out (empty config dir): exit **1**, `{"loggedIn": false, "authMethod": "none", ...}`.
- The check does make network connections (two TCP connects to an Anthropic address, plus DNS), but no
  model call.
- A signed-out `claude -p` writes an `assistant` line with `"error": "authentication_failed"` and a
  `result` line with `is_error: true` and `result: "Not logged in · Please run /login"`, exit code 1.

## Result

`claude auth status --json` is a usable pre-check. Its output carries personal fields, so Runwell must
read `loggedIn` and discard the rest without logging it.

## Decision for the plan

- `AUTH_CHECK: argv ["claude","auth","status","--json"]; signed in when exit code is 0 and the parsed JSON has loggedIn === true; read only loggedIn, never store or log the output`.
- `AUTH_ERROR_PATTERN: an assistant line with error "authentication_failed", or a result line with is_error true whose result starts with "Not logged in"`.
- `AUTH_CHECK_MS: about 130 ms (cache the answer for 60 s)`.
