# Spike 5: detached server start, and the mod surface

## Question

Can a mod or a settings hook start the Runwell server so that it outlives the session, without delaying
session start? What does a mod need for commands, paths, Node and opening a URL?

## Setup

- Claude Code 2.1.330, Linux only (macOS untested). Plugins loaded for one run with `--plugin-dir`,
  never installed.
- Scratch: `scratch/s5/stub.mjs` (listens on a free port, writes `{pid, port}`, heartbeats every second,
  exits after 120 s), `scratch/s5/launcher.mjs` (spawns the stub with `detached: true, stdio: "ignore"`,
  `unref()`, exits), `scratch/s5/mod/` (the test mod).

## What happened

- **Imports.** A hooks module may import only files inside the plugin (relative paths) and the bare
  module `claude-code` (docs, `create.md`). So a mod cannot import `node:child_process`; starting a
  process goes through `$.process.run` or `$.process.spawn`.
- **Plugin path in a mod.** `CLAUDE_PLUGIN_ROOT` is **not** visible to a mod (`$.env.get` returned
  nothing). `new URL('..', import.meta.url).pathname` from `hooks/register.js` gave the plugin folder.
- **`$.process.spawn`** returned an async iterator (`next`, `return`, `throw`, `result`); left
  un-iterated, the command never started.
- **`$.process.run(['node', <plugin>/launcher.mjs, ...])`** from `session.start`: exit 0, and the stub
  it detached kept running after `claude -p` exited (its parent became the user's init process, its own
  session id). The whole `session.start` hook, including that call, took **146 ms**.
- **Settings hook.** A plugin `hooks/hooks.json` `SessionStart` command hook
  `node "${CLAUDE_PLUGIN_ROOT}/../launcher.mjs" ...` worked the same way: the stub outlived the session.
  `${CLAUDE_PLUGIN_ROOT}` is expanded in settings hooks.
- **Node.** The mod runs inside Claude Code's own runtime, not Node; `node` must be found on PATH (or a
  configured path). `$.process.run` rejects when the program cannot start.
- **Commands.** `$.command.register({ name, description, argumentHint, immediate: true })` in
  `session.start`, plus a `command.run` hook with `{ command: name }` returning
  `{ text, isTextDisplayOnly: true }`, answered `/runwell-spike hello` under `-p` with no model turn.
  A plugin command file `commands/<name>.md` in the same plugin is listed as `<plugin-name>:<name>`, so it
  does not clash with the mod's bare `/<name>`.
- **Opening a URL.** The mods API has no URL opener (`$.ui.open` opens a pane). Use
  `$.process.run(['xdg-open', url])` on Linux, `['open', url]` on macOS.
- **Session info.** `await $.session.cwd()` and `await $.session.id()` work.
- Session-start cost without the mod was not measured separately; the mod hook's own 146 ms includes
  starting `node` for the launcher.

## Result

Both a mod and a settings hook can start a server that outlives the session, through a small Node
launcher that detaches and exits. Mods need `node` on PATH and get their own path from
`import.meta.url`.

## Decision for the plan

- `MOD_SPAWN: await $.process.run([node, new URL('..', import.meta.url).pathname + '/dist/launcher.js', ...args]) from session.start, wrapped in try/catch; the launcher spawns the server with detached:true, stdio:'ignore', unref() and exits`.
- `HOOK_SPAWN: SessionStart command hook: node "${CLAUDE_PLUGIN_ROOT}/dist/launcher.js" (same launcher); Linux verified, macOS untested`.
- `NODE_DISCOVERY: mod: "node" on PATH, else the path in ~/.runwell/config.json; hook and CLI: process.execPath when it is Node 20+, else PATH; when none is found: "Runwell needs Node 20 or newer. Install it from nodejs.org, then restart Claude Code."`.
- `MOD_COMMANDS: $.command.register({name: "runwell", description, argumentHint: "[run|last|open]", immediate: true}) in session.start + on("command.run", {command: "runwell"}, ...) returning {text, isTextDisplayOnly: true}; fallback command file commands/runwell.md appears as /runwell:runwell`.
- `OPEN_URL: $.process.run(["xdg-open", url]) on Linux, ["open", url] on macOS`.
- `MOD_ROOT: new URL('..', import.meta.url).pathname (CLAUDE_PLUGIN_ROOT is not visible to mods)`.
- `MOD_START_MS: about 150 ms for the session.start hook including the launcher`.
