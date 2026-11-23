# Spike decisions

Measured on 23/11/2026 against Claude Code 2.1.330 on Linux (macOS untested). Later tasks read this
table, not the write-ups. Details and evidence: `1-questions-and-permissions.md`, `3-subagents.md`,
`4-signed-in-check.md`, `5-detached-start.md`.

No spike landed on the Agent SDK fallback: button runs use `claude -p` throughout.

| Name | Value | Feeds tasks |
|---|---|---|
| `ASK_ROUTE` | `permission-tool`. Pass `--mcp-config <runwell MCP>` and `--permission-prompt-tool mcp__runwell__permission`. The tool receives `{tool_name, input, tool_use_id}`. Questions: `tool_name === "AskUserQuestion"`, `input.questions[]` (`question`, `header`, `multiSelect`, `options[{label, description}]`); answer `{"behavior":"allow","updatedInput":{...input,"answers":{"<question text>":"<label or typed text>"}}}`. Permissions: answer `{"behavior":"allow","updatedInput":input}` or `{"behavior":"deny","message":"<text the agent reads>"}`. The answer is the tool result's text content (JSON). The run waits for the answer (600 s held twice without a timeout). Read-only commands never reach the tool. | 20, 22, 23, 39 |
| `ASK_MOD_ROUTE` | Not used for button runs. A mod `tool.check` hook can hold a permission by looping `$.http.fetch` long-polls (each call under 30 s), but AskUserQuestion is not offered under `-p` without a permission tool, so the mod cannot carry questions. Kept for 0.2 chat runs. | 39 |
| `SKILL_INVOCATION` | First user message `/<name> <brief>` for personal and project skills; `/<plugin>:<name> <brief>` for plugin skills (names as listed in the `init` event's `slash_commands`). | 20 |
| `FOLDER_RULE` | `--settings '{"permissions":{"allow":["Edit(//<absolute run folder>/**)"]}}'`. The double slash is required; `Edit(/abs/**)` does not match. Without a rule, `-p` (Manual mode) denies writes even inside the working folder unless the permission tool allows them. | 20 |
| `BYPASS_FLAG` | `--permission-mode bypassPermissions` | 20, 30 |
| `STOP` | SIGINT; the tool call is rejected, a `result` line with `subtype: "error_during_execution"`, `is_error: true` follows and the process exits about 0.5 s later, children gone. Send SIGTERM if still alive after 5 s. | 20, 21 |
| `STDIN` | The process stays alive after `result` while stdin is open. Close stdin after the `result` line (or keep it open only to send a follow-up message). | 20 |
| `UNANSWERED` | With the permission tool: waits until answered (no timeout seen at 600 s). Without it: denied at once; AskUserQuestion is not offered. | 23 |
| `USER_SETUP_LOADS` | The person's own hooks, plugins and MCP servers load in every `-p` run, as in their chat. | 20, 33 |
| `STREAM_PARENT_LINK` | `parent_tool_use_id` on assistant and user lines (null for the lead); holds for interleaved parallel agents. | 17, 19 |
| `SUBAGENT_TOOL_NAMES` | `Agent`, `Task`. Agents also emit system `task_started` / `task_progress` / `task_updated` (`patch.status`, `end_time` ms) / `task_notification`, each with `tool_use_id`. | 17, 19 |
| `STREAM_TIME` | `timestamp` (ISO) on assistant and user lines; arrival time for system, result and rate-limit lines; `task_updated.end_time` for an agent's end. | 19 |
| `LOG_SUBAGENTS` | `separate-file`: `~/.claude/projects/<encoded cwd>/<sessionId>/subagents/agent-<agentId>.jsonl`, linked by `agent-<agentId>.meta.json` `toolUseId`. The main log's Agent tool result also has `toolUseResult.agentId`. | 27 |
| `LOG_SKILL_START` | A user line containing `<command-name>/NAME</command-name>` (args in `<command-args>`), followed by an `isMeta` user line `Base directory for this skill: <path>`; or an assistant `tool_use` named `Skill`. | 27 |
| `LOG_LINES_TO_READ` | Read only `user`, `assistant` and `system` lines. Never read or copy `api-request-blob` (it holds the person's email and full context), `api-request-shape`, `attachment` or other types. | 27 |
| `AUTH_CHECK` | argv `["claude","auth","status","--json"]`; signed in when exit 0 and `loggedIn === true`. Read only `loggedIn`; the output also holds email and org, never store or log it. Makes network calls but no model call. | 18, 30 |
| `AUTH_ERROR_PATTERN` | Assistant line `"error": "authentication_failed"`, or `result` with `is_error: true` and `result` starting `Not logged in`. Exit code 1. | 18, 19, 21 |
| `AUTH_CHECK_MS` | About 130 ms; cache for 60 s. | 18 |
| `MOD_SPAWN` | `await $.process.run([node, <plugin>/dist/launcher.js, ...])` in `session.start`, in try/catch; the launcher spawns the server `detached: true, stdio: "ignore"`, `unref()`, and exits. Verified to outlive the session. `$.process.spawn` is a lazy iterator; do not use it for this. | 38, 39 |
| `MOD_ROOT` | `new URL('..', import.meta.url).pathname` from `hooks/register.js`. `CLAUDE_PLUGIN_ROOT` is not visible to mods. Mods may import only their own files and `claude-code`. | 39 |
| `HOOK_SPAWN` | `SessionStart` command hook `node "${CLAUDE_PLUGIN_ROOT}/dist/launcher.js"` (same launcher). Verified on Linux. | 38, 39 |
| `NODE_DISCOVERY` | Mod: `node` on PATH, else the path in `~/.runwell/config.json`. Hook and CLI: `process.execPath` if it is Node 20+, else PATH. None found: "Runwell needs Node 20 or newer. Install it from nodejs.org, then restart Claude Code." | 38, 39 |
| `MOD_COMMANDS` | `$.command.register({name: "runwell", description, argumentHint, immediate: true})` in `session.start`; `on("command.run", {command: "runwell"}, ...)` returns `{text, isTextDisplayOnly: true}`. A plugin command file `commands/runwell.md` is listed as `/runwell:runwell` (no clash). | 39 |
| `OPEN_URL` | `$.process.run(["xdg-open", url])` on Linux, `["open", url]` on macOS (no URL helper in the mods API). | 39 |
| `MOD_START_MS` | About 150 ms for the `session.start` hook including the launcher. | 39 |

## Plugin check

23/11/2026, Claude Code 2.1.330, Linux.

- `claude plugin validate ./plugin`: passes (hooks `session.start` and `command.run{command=runwell}`, the `SessionStart` hook, the fallback command `runwell:runwell`). Warning only: no icon.
- Loaded with `--plugin-dir ./plugin` (not installed from the marketplace; that is in the release check list) against a temp `RUNWELL_HOME`, a fake `xdg-open` and the fake `claude` for the run itself:
  - `/runwell` answered "Runwell is open at http://127.0.0.1:4790" with no model turn, and opened a one-time link.
  - `/runwell run motion-ad hello there` answered "Started motion-ad #1"; the run finished with that brief.
  - `/runwell last` answered "Opened motion-ad #1".
  - All three sessions used the same server (one process, same pid), which kept running after each `claude -p` exited. Each whole `claude -p` call took about 3.7 s.
- Not checked here: install from the marketplace, a real `claude` run started from `/runwell run`, macOS, and a session with mods off (the hook path is covered by `test/plugin/hook.test.ts`).
