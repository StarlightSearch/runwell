# Spikes

Short experiments against a real, signed-in Claude Code that decide parts of the design
(`docs/superpowers/specs/2026-11-23-workflows-design.md`, section 20). They run in throwaway folders
under the system temp directory, never in a real project.

Every write-up uses these headings:

1. **Question**
2. **Setup** (exact commands and versions)
3. **What happened** (pasted output, trimmed)
4. **Result**
5. **Decision for the plan** (one line per decision, `NAME: value`)

## Sanitising captures

Raw captures go to `captures/`. Before committing one:

- replace any path under the home folder with `~` (or `/home/user` in test fixtures);
- remove any email address;
- replace the text of the person's own prompts;
- never keep a token, key or credential of any kind.

`DECISIONS.md` collects every decision line in one table; later tasks read it, not the write-ups.
