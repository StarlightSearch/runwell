# Test fixtures

Real captures from Claude Code 2.1.330 on Linux, recorded on 23/11/2026 during the Phase 0 spikes
(`docs/spikes/`), model Claude Haiku 5.5.

| File | What it is | From |
|---|---|---|
| `stream/happy.jsonl` | A skill run (`/workflows-fixture`) that starts one subagent and writes two files, then finishes | fixture run |
| `stream/subagents.jsonl` | Three subagents, two running at once with interleaved lines, one whose command exits 1 | spike 3 |
| `stream/question.jsonl` | AskUserQuestion answered through the permission tool, then a Write allowed through it | spike 1, route B |
| `stream/permission.jsonl` | A Bash call denied through the permission tool (message `no`), then a Write allowed; each held 600 s | spike 1, 10-minute hold |
| `stream/failure.jsonl` | A run stopped with SIGINT mid-command: `result` with `subtype: "error_during_execution"` | spike 1, stop |
| `stream/signed-out.jsonl` | A signed-out run: `authentication_failed`, then `Not logged in · Please run /login` | spike 4 |
| `permission-tool/calls.jsonl` | What the permission tool received (`kind: "call"`) and answered (`kind: "answer"`) for `question.jsonl` | spike 1, route B |
| `sessions/-home-user-project/` | The session log of the `happy` run, laid out as Claude Code writes it: `<sessionId>.jsonl` plus `<sessionId>/subagents/agent-<id>.jsonl` and `.meta.json` | fixture run |

## Sanitising rules

Applied by `docs/spikes/scratch/fixture.py` (and a final pass for the user name):

- the home folder is `/home/user`, the run folder `/home/user/project`, the encoded project folder
  `-home-user-project`;
- the operating-system user name is `user`; the temp prefix is `/tmp/claude-1000/`;
- every UUID (session ids, message ids) is `00000000-0000-4000-8000-00000000000N`, numbered in order
  of appearance per file; tool-use ids are left as recorded;
- email addresses are `<email>`;
- stream files drop `hook_started` / `hook_response` lines, and the `init` line keeps only `cwd`,
  `session_id`, `model`, `permissionMode`, `apiKeySource`, `claude_code_version`, with a fixed short
  `tools` list and no MCP servers;
- session logs keep only `user`, `assistant` and `system` lines (never `api-request-blob`, which holds
  the person's email and full context); subagent `.meta.json` keeps `agentType`, `description`,
  `toolUseId`, `spawnDepth`, `finished`.

Prompts in these runs were written for the spikes, not taken from anyone's work.

`media/lumen-spring.mp4` is the video the `subagents-slow` demo run delivers (a fake `copy` control
puts it in the run folder), so the README shows a real video ad. `media/lumen-spring.html` is the page it
was rendered from.
