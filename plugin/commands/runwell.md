---
description: Open Runwell, or run a skill in it
argument-hint: "[run <skill> [brief] | last]"
allowed-tools: Bash
---
Run exactly one command with the Bash tool, then reply with its output and nothing else.

- If the arguments are empty, run: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" open`
- If the arguments are `last`, run: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" last --cwd "$PWD"`
- If the arguments are just `run`, run: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" run` (it lists the skills you can run)
- If the arguments start with `run <skill>`, run: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" run <skill> "<the rest as the brief>" --cwd "$PWD"`

Arguments: $ARGUMENTS
