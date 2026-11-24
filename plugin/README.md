# Workflows

Run your skills from a button, watch them work as a live graph, and keep every run. Works with Claude Code.

Install: `/plugin marketplace add StarlightSearch/workflows`, then `/plugin install workflows@workflows`.

After installing, type `/workflows` in Claude Code to open the dashboard in your browser, `/workflows run <skill> [brief]` to start a run, or `/workflows last` to open the newest run for this folder. Workflows runs your own `claude` with your own login, keeps its data in `~/.pulsar-workflows`, and listens only on 127.0.0.1. It needs Node 20 or newer. See the repository README for details.
