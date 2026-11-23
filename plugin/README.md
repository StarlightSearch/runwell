# Runwell

Run your skills from a button, watch them work as a live graph, and keep every run. Works with Claude Code.

Install: `/plugin marketplace add StarlightSearch/runwell`, then `/plugin install runwell@runwell`.

After installing, type `/runwell` in Claude Code to open the dashboard in your browser, `/runwell run <skill> [brief]` to start a run, or `/runwell last` to open the newest run for this folder. Runwell runs your own `claude` with your own login, keeps its data in `~/.runwell`, and listens only on 127.0.0.1. It needs Node 20 or newer. See the repository README for details.
