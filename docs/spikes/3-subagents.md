# Spike 3: subagents in stream-json and in session logs

## Question

Can every event produced inside a subagent be tied to the call that started it, in the stream and in
the session log? Where does event time come from? How does a skill use appear in a log?

## Setup

- Claude Code 2.1.330, Linux, model `haiku`, `--permission-mode bypassPermissions`, three small text
  files in a throwaway folder.
- Prompt: start two subagents in parallel (word count with Bash, summary of a file) plus a third that
  runs `exit 1`, then write `summary.md`.
- Capture: `captures/s3-stream.jsonl` (sanitised). Session log read in place under
  `~/.claude/projects/<encoded folder>/`.

## What happened

**Stream.**
- The subagent call is the tool **`Agent`** with input `{description, prompt}` (the `init` tool list also
  contains `Task`). Three Agent calls were issued, two started before the first finished.
- Every assistant and user line produced inside a subagent carries **`parent_tool_use_id`** set to the
  Agent call's id. It held for interleaved lines of two agents running at once (lines 16 to 25 alternate
  between them).
- Each agent also gets system events: `task_started` (`task_id`, `tool_use_id`, `description`),
  `task_progress`, `task_updated` (`patch.status: "completed"`, `end_time` in ms) and
  `task_notification` (`status`, `output_file`).
- The subagent's final answer is the `tool_result` of the Agent call on a lead-level user line.
- The agent whose command failed shows an inner Bash result with `is_error: true`
  (`Exit code 1`); the agent itself still completed.
- **Time:** `assistant` and `user` lines carry `timestamp` (ISO); system, result and rate-limit lines do
  not. `task_updated` carries `end_time` (epoch ms).
- Nesting was not exercised; the subagent's own tool list includes `Agent`, so nesting is possible.

**Session log.**
- Main log: `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl`. Lines have `type`, `uuid`,
  `parentUuid`, `isSidechain`, `sessionId`, `timestamp`, `cwd`. Many line types are not conversation:
  `attachment`, `queue-operation`, `file-history-*`, `api-request-shape`, **`api-request-blob`**,
  `cost-state` and others.
- **`api-request-blob` lines contain the full request context, including the person's email address
  and their CLAUDE.md and hook text.** Backfill must never copy these line types, and captures must
  drop them.
- Subagents live in a **separate folder**: `<sessionId>/subagents/agent-<agentId>.jsonl` (lines have
  `isSidechain: true` and `agentId`), with `agent-<agentId>.meta.json` holding
  `{agentType, description, toolUseId, spawnDepth, model, finished}`. `toolUseId` is the parent Agent
  call. The main log's tool result for that call also carries `toolUseResult.agentId`.
- **Skill use, typed as a command:** a user line whose content is
  `<command-message>NAME</command-message>\n<command-name>/NAME</command-name>\n<command-args>ARGS</command-args>`,
  followed by an `isMeta: true` user line starting `Base directory for this skill: <path>`
  (seen in spike 1). A skill loaded by the model uses the `Skill` tool (`tool_use` with name `Skill`);
  that form was not captured in this spike.

## Result

Subagents are tied reliably in both places. No Agent SDK fallback is needed.

## Decision for the plan

- `STREAM_PARENT_LINK: parent_tool_use_id` (on assistant and user lines; null for the lead).
- `SUBAGENT_TOOL_NAMES: Agent, Task`.
- `STREAM_TIME: the timestamp field on assistant and user lines; arrival time for lines without one; task_updated.end_time for agent end`.
- `LOG_SUBAGENTS: separate-file` (`<sessionId>/subagents/agent-<agentId>.jsonl`, linked by `agent-<agentId>.meta.json` `toolUseId`).
- `LOG_SKILL_START: a user line containing <command-name>/NAME</command-name> (args in <command-args>), or an assistant tool_use named Skill (input key holding the skill name, to confirm in Task 27 against a real log)`.
- `LOG_LINES_TO_READ: only user, assistant and system conversation lines; never copy api-request-blob, api-request-shape, attachment or any other line type`.
