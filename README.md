<p align="center">
  <img alt="Pulsar" src="docs/assets/brand/pulsar-logo.svg" width="72">
</p>
<h1 align="center">Workflows</h1>

The open-source, local version of [Pulsar Workflows](https://pulsarbot.cloud). Run your skills from a button, watch them work, keep every run. Works with Claude Code.

![A Workflows run: two agents working side by side under the step that started them](docs/assets/workflows.webp)

## Install

In Claude Code:

```
/plugin marketplace add StarlightSearch/workflows
/plugin install workflows@workflows
/workflows
```

Needs Node 20 or newer and Claude Code. macOS and Linux.

## What you get

**Every skill on your machine, with a Run button.** Personal skills, plugin skills and the skills in your projects, each with its recent runs and how they were rated.

![The Skills page](docs/assets/skills.png)

**A live graph of the run.** Each step of the skill down the page, the agents it starts side by side under the step that started them, and what each one is doing. Questions and permission requests from Claude show up as cards you answer in the page.

![A run in progress](docs/assets/run-live.png)

**Every run kept.** The files it made (videos, images, PDFs, HTML and markdown preview in the page), the full transcript, a timeline, a replay of the graph, and a Good or Not good rating with a note. Workflows also finds the skills you used in past Claude Code chats and lists those runs too.

![A finished run](docs/assets/run-past.png)

## Commands

| Command | What it does |
| --- | --- |
| `/workflows` | Opens Workflows in your browser |
| `/workflows run <skill> [brief]` | Starts a run of that skill and opens it |
| `/workflows last` | Opens the newest run for the folder you are in |

In the page: `⌘K` or `Ctrl K` searches skills and runs, `R` runs the selected skill, `G` then `S`, `R` or `O` goes to Skills, Runs or Outputs, and `?` lists the keys.

## How a run works

- Workflows runs your own `claude` command with your own login. It never asks for an API key and never reads or stores your credentials.
- Every run uses Claude Code's auto mode: Claude Code decides which actions need your OK, and those questions, like any question Claude asks, come to the run's page as cards you answer there.
- By default a run works in a new folder of its own, so it does not touch your projects. Edits are allowed inside that folder. You can pick one of your projects instead, and the run works there the way a chat in that folder would.
- Stop ends a run at once. A run never keeps going after Workflows stops.

## What it reads and what it never touches

**Reads:** your skill folders; `~/.claude.json`, only for project paths and whether you have trusted them; and the session logs under `~/.claude/projects`, to find the skills you used in past chats.

**Writes:** only `~/.pulsar-workflows` (or `~/.runwell`, if you used Workflows before it was renamed), and a project folder only when you choose to run in it.

**Never:** your credentials, tokens or the keychain, git, your skill files, or the network. The server listens on 127.0.0.1 only and every request needs a token. There is no telemetry.

## Check the plugin yourself

```
claude plugin validate ./plugin
```

The part that runs inside Claude Code is one short file, [`plugin/hooks/register.js`](plugin/hooks/register.js) (built from [`src/plugin/mod.ts`](src/plugin/mod.ts)). At the start of a session it starts the Workflows server in the background if it is not running, and it adds `/workflows`. It makes no network calls.

## Limits

- Runs started from the Run button (or `/workflows run`) are shown live. Skills used in a chat are read from the session logs afterwards, not live.
- Tested on Linux. macOS is checked by hand before each release. Windows is not tested.
- Built-in skills that have no files on disk are not listed.

## Coming next

Live tracking of skills used in a chat, improving a skill from the runs you choose, and exporting a run as one HTML file.

## License

MIT

Made by Starlight
