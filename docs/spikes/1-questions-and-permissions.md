# Spike 1: questions and permissions under `claude -p`

## Question

How do the agent's questions (AskUserQuestion) and permission requests reach a page and get answered
when Runwell runs `claude -p` in stream-json mode? How is a skill invoked, how is one folder made
writable, and how is a run stopped?

## Setup

- Claude Code 2.1.330, Linux 7.2 (macOS untested), Node 22.22, model `haiku` (Claude Haiku 5.5) for every run.
- `P` = `claude -p --output-format stream-json --input-format stream-json --verbose --model haiku`.
  The first user message is one stream-json line on stdin, stdin kept open.
- Throwaway folders under the session scratch directory. Scratch code: `scratch/s1/`
  (`permission-stub.mjs`, `relay-mod/`, `relay-server.mjs`, `summarise.py`).
- Captures (sanitised): `captures/s1-*.jsonl`.

## What happened

1. **Baseline (no permission flags).** AskUserQuestion is not offered at all: the `init` tool list has no
   AskUserQuestion, the agent's ToolSearch for it found nothing, and the turn ended without asking or
   writing (`s1-baseline.jsonl`). Since 2.1.302 `-p` starts in Manual mode: a call needing approval is
   denied unless something approves it. Writes inside the working folder were also denied with no rule
   (`s1-folder-rule.jsonl`, first run). The person's own user-level hooks, plugins and MCP servers load in
   the run (a SessionStart hook and their MCP servers appeared).
2. **Skill invocation.** A personal test skill (`~/.claude/skills/runwell-spike`, removed afterwards)
   invoked as the first message `/runwell-spike make it say hi` loaded and ran: `spike.txt` contained
   `hi`. The stream shows no Skill tool call; the session log shows a user line
   `<command-name>/runwell-spike</command-name>` with `<command-args>`, then an `isMeta` user line
   starting `Base directory for this skill: <path>`. The `init` event's `slash_commands` lists personal
   skills by bare name and plugin skills as `plugin:skill` (for example `superpowers:brainstorming`);
   a plugin skill was not run (listing taken as sufficient).
3. **Route B, `--permission-prompt-tool` (an MCP stub holding 90 s).** Both kinds arrived at the tool:
   - AskUserQuestion arrived as `{tool_name: "AskUserQuestion", input: {questions: [...]}, tool_use_id}`.
     Answering `{"behavior":"allow","updatedInput":{...input, "answers": {"<question text>": "<label>"}}}`
     delivered the answer: the tool result read `"Should the file be named a.txt or b.txt?"="b.txt"`
     and the agent wrote `b.txt`.
   - Write arrived as `{tool_name: "Write", input: {file_path, content}, tool_use_id}`; `allow` with
     `updatedInput` let it run.
   - A read-only command (`echo done`) never reached the tool.
   - A 90 s hold on each call worked. A **600 s hold** on a Bash call worked too: the answer came back
     after exactly 600 s and the run carried on.
   - Answering `{"behavior":"deny","message":"no"}` reached the agent as a refused tool call and it
     moved to an alternative (the Write tool), which again waited on the tool.
4. **Question answers on stdin.** Not needed: questions already reach the permission tool.
5. **Route A, a mod relay (`--plugin-dir`, one run only).** Mod hooks run under `-p`. A `tool.check`
   hook that awaited Claude Code's own decision (`ask`) and then long-polled a local server with
   `$.http.fetch` (25 s per call; each call is capped at 30 s, and time inside mods API calls does not
   count against the hook's 10 s budget) held a Write for 70 s and returned `{decision: "allow"}`; the
   write happened. Returning `{decision: "deny", reason}` refused a Bash call with a
   `permission_denied` system event naming the plugin. But the mod cannot help with questions:
   AskUserQuestion is not offered under `-p` unless a permission host exists (route B).
   `$.env.get`, `$.session.cwd()` and `$.session.id()` are async (await them). `CLAUDE_PLUGIN_ROOT`
   is not visible to a mod (see spike 5).
6. **Folder rule.** `--settings <file>` with `{"permissions":{"allow":["Edit(/<abs>/**)"]}}` (one slash)
   did **not** match: both writes were denied. With the double-slash absolute form
   `Edit(//<abs folder>/**)` a write inside the folder passed with no prompt and a write to a sibling
   folder was denied (`decision_reason_type: "workingDir"`). Bypass: `--permission-mode
   bypassPermissions` (or `--dangerously-skip-permissions`).
7. **Stop.** SIGINT during a long foreground command: the tool call ended as rejected, a `result` line
   with `subtype: "error_during_execution"` and `is_error: true` followed, the process exited 0 about
   0.5 s after the signal, and the child command was gone. When a turn finishes, the process stays alive
   while stdin is open (it waits for the next message); it exits on stdin EOF.

## Result

Route B handles both questions and permissions, with holds of at least 10 minutes. Route A handles
permissions only. No Agent SDK fallback is needed.

## Decision for the plan

- `ASK_ROUTE: permission-tool` (one MCP tool on the Runwell MCP server, passed as `--permission-prompt-tool mcp__runwell__permission`; questions answer through `updatedInput.answers` keyed by question text, permissions through `behavior` allow/deny).
- `SKILL_INVOCATION: first message "/<name> <brief>" for personal and project skills, "/<plugin>:<name> <brief>" for plugin skills (the names in init.slash_commands)`.
- `FOLDER_RULE: --settings '{"permissions":{"allow":["Edit(//<absolute run folder>/**)"]}}'` (double slash; a single slash does not match).
- `BYPASS_FLAG: --permission-mode bypassPermissions`.
- `STOP: SIGINT, then SIGTERM after 5 s; expect a result line with subtype error_during_execution within about 1 s`.
- `UNANSWERED: with a permission tool the run waits for the answer (600 s held fine; no timeout seen); without one, Manual mode denies at once and AskUserQuestion is not offered`.
- `STDIN: close stdin after the result line to end the process; keep it open only to send a follow-up message`.
- `USER_SETUP_LOADS: the person's own hooks, plugins and MCP servers load in every run` (expected: it behaves as their chat would).
