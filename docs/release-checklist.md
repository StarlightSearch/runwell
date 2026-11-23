# Release check list

Run this against a real Claude Code before each release. Record each pass at the bottom with the Claude Code version, the system and the date (dd/mm/yyyy).

## Before

- `npm run test:all` passes.
- `node scripts/check-package.mjs` prints "package ok".
- A marketplace install clones the repository, and `plugin/dist` is in `.gitignore`. The release commit must include the built plugin: `npm run build`, then `git add -f plugin/dist plugin/hooks/register.js` (this includes `plugin/dist/node_modules/node-sqlite3-wasm`).
- `plugin/.claude-plugin/plugin.json` has the version from `package.json`.

## Checks (each with what should happen)

1. **Fresh install from the marketplace** (macOS and Linux): `/plugin marketplace add StarlightSearch/runwell`, `/plugin install runwell@runwell`, start a new session. The session starts with no visible delay; `/runwell` opens the dashboard.
2. **First start**: past runs found in your chats show within a minute (the Settings page says how many logs were read).
3. **Button run in a new run folder**: the graph moves live, the run finishes, its files show under Outputs.
4. **Button run in a trusted project**: runs there; files it wrote are labelled "written by this run".
5. **Button run in an untrusted folder**: the dialog asks first and names what may run (hooks, MCP servers).
6. **A question card**: Claude's question shows on the run page; the answer reaches Claude and the run goes on.
7. **A permission card**: allow once, then deny with a reason in another run; Claude reads the reason.
8. **Allow everything**: the run is labelled "everything allowed" and nothing asks.
9. **Parallel subagents**: the agents show side by side under their step.
10. **Stop**: the run ends as Stopped within a few seconds, and no `claude` process is left.
11. **Signed out**: after `claude auth logout`, the Run dialog says so and nothing starts.
12. **No Node on PATH**: the one-line hint shows once; Claude Code works normally.
13. **Mods off**: the SessionStart hook still starts the server, and `/runwell:runwell` works through a turn.
14. **Two sessions**: both use the same server (one `server.json`, one process).
15. **Upgrade**: after installing a newer version, the old server is replaced once it has no run in progress.
16. **Spike decisions still hold**: re-run the Step 1 captures of spikes 1 and 3 (docs/spikes) on this Claude Code version and compare the line shapes with `test/fixtures/stream`.

## Passes

- 23/11/2026, Claude Code 2.1.330, Linux, partial (pre-release, before the repository exists): `npm run test:all` and the package check pass; the plugin validates; loaded with `--plugin-dir`, `/runwell`, `/runwell run` and `/runwell last` work and two sessions share one server (see docs/spikes/DECISIONS.md, "Plugin check"). Not yet run: checks 1, 2 and 5 to 16 against a real `claude` and a marketplace install, and macOS. To do by the owner before the public release.
