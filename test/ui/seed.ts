/**
 * A seeded Runwell home for UI tests: a fake ~/.claude (the skills fixture tree, two projects, one of them
 * untrusted), three finished runs with outputs, one failed run, ratings, and a config pointing at it all.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunEvent } from "../../src/shared/events";
import { migrate, openDb } from "../../src/server/db";
import { paths } from "../../src/server/paths";

const SKILLS = fileURLToPath(new URL("../fixtures/skills", import.meta.url));
const DAY = 86_400_000;

export interface Seeded {
  home: string;
  claudeHome: string;
  trusted: string;
  untrusted: string;
  runIds: { video: string; second: string; third: string; failed: string; loop: string; history: string };
}

const ev = (events: RunEvent[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

export async function seed(): Promise<Seeded> {
  const root = mkdtempSync(join(tmpdir(), "runwell-ui-"));
  const home = join(root, "home");
  const claudeHome = join(root, "claude-home", ".claude");
  mkdirSync(join(root, "claude-home"), { recursive: true });
  cpSync(join(SKILLS, "claude"), claudeHome, { recursive: true });
  const rec = join(claudeHome, "plugins/installed_plugins.json");
  writeFileSync(rec, readFileSync(rec, "utf8").replaceAll("__CLAUDE__", claudeHome));
  const trusted = join(root, "work", "website");
  const untrusted = join(root, "work", "client-repo");
  cpSync(join(SKILLS, "project"), trusted, { recursive: true });
  mkdirSync(join(untrusted, ".claude"), { recursive: true });
  writeFileSync(join(untrusted, ".mcp.json"), "{}");
  writeFileSync(join(untrusted, ".claude/settings.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
  writeFileSync(join(root, "claude-home", ".claude.json"), JSON.stringify({ projects: { [trusted]: { hasTrustDialogAccepted: true }, [untrusted]: { hasTrustDialogAccepted: false } } }));

  const p = paths(home);
  writeFileSync(p.configJson, JSON.stringify({ claudeHome, port: 4790 }));
  const db = await openDb(p.db);
  migrate(db);
  const now = Date.now();
  const mk = (id: string, n: number, status: string, ago: number, rating: number | null, events: RunEvent[], files: Record<string, string>, error: string | null = null) => {
    const created = now - ago;
    db.run(
      `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, created_at, started_at, ended_at, rating, error, skill_version)
       VALUES (?, 'personal:motion-ad', 'motion-ad', ?, 'button', ?, ?, ?, 'folder', ?, ?, ?, ?, ?, 1)`,
      id, n, status, `Ad number ${n} for pulsarbot.cloud`, p.work(id), created, created, created + 400_000, rating, error,
    );
    mkdirSync(p.work(id), { recursive: true });
    writeFileSync(p.events(id), ev(events.length ? events : [{ t: "status", at: created, status: "running", reason: null }, { t: "status", at: created + 400_000, status: status as RunEvent extends { status: infer S } ? S : never, reason: error }]));
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(p.work(id), rel, ".."), { recursive: true });
      writeFileSync(join(p.work(id), rel), body);
      db.run("INSERT INTO outputs (run_id, path, label, kind, bytes, mtime, copied) VALUES (?, ?, 'written', ?, ?, ?, 0)", id, rel, rel.endsWith(".mp4") ? "video" : rel.endsWith(".png") ? "image" : rel.endsWith(".md") ? "markdown" : "text", body.length, created);
    }
  };
  const runIds = { video: "aaaaaaaaaaa1", second: "aaaaaaaaaaa2", third: "aaaaaaaaaaa3", failed: "aaaaaaaaaaa4", loop: "aaaaaaaaaaa5", history: "aaaaaaaaaaa6" };
  mk(runIds.video, 1, "finished", 3 * DAY, 1, [], { "ad-9x16.mp4": "fake-mp4", "poster.png": "fake-png" });
  mk(runIds.second, 2, "finished", 2 * DAY, 1, [], { "notes.md": "# Notes\n\nA list." });
  mk(runIds.third, 3, "finished", DAY, -1, [], { "copy.txt": "words" });
  mk(runIds.failed, 4, "failed", 3_600_000, null, [], {}, "Claude stopped without finishing");
  // A skill with a loop in its workflow map, and a run of it on its second pass.
  mkdirSync(join(claudeHome, "skills/review-loop"), { recursive: true });
  writeFileSync(
    join(claudeHome, "skills/review-loop/SKILL.md"),
    [
      "---", "name: review-loop", "description: Drafts, reviews and revises until the reviewer accepts.", "---",
      "# Review loop", "## Steps", "### 1. Read the brief", "### 2. Draft and review", "#### 2.1 Write the draft", "#### 2.2 Review the draft", "### 3. Publish",
      "## Workflow map", "```pulsar-workflow",
      JSON.stringify({ version: 1, steps: [
        { title: "1. Read the brief", detail: "Read it.", kind: "action" },
        { title: "2. Draft and review", detail: "Up to 3 passes.", kind: "loop", maxPasses: 3, children: [
          { title: "2.1 Write the draft", detail: "Write.", kind: "action" }, { title: "2.2 Review the draft", detail: "Review.", kind: "action" }] },
        { title: "3. Publish", detail: "Publish.", kind: "action" }] }),
      "```",
    ].join("\n"),
  );
  const t0 = now - 4 * DAY;
  const step = (stepId: string, status: "started" | "done", k: number): RunEvent => ({ t: "step", at: t0 + k * 10_000, stepId, status, note: null });
  db.run(
    `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, created_at, started_at, ended_at, skill_version)
     VALUES (?, 'personal:review-loop', 'review-loop', 1, 'button', 'finished', 'Review the launch post', ?, 'folder', ?, ?, ?, 1)`,
    runIds.loop, p.work(runIds.loop), t0, t0, t0 + 90_000,
  );
  mkdirSync(p.work(runIds.loop), { recursive: true });
  writeFileSync(p.events(runIds.loop), ev([
    { t: "status", at: t0, status: "running", reason: null },
    step("s1", "started", 0), step("s1", "done", 1), step("s2.1", "started", 2), step("s2.1", "done", 3), step("s2.2", "started", 4), step("s2.2", "done", 5),
    step("s2.1", "started", 6), step("s2.1", "done", 7), step("s2.2", "started", 8), step("s2.2", "done", 8), step("s3", "started", 9), step("s3", "done", 9),
    { t: "result", at: t0 + 90_000, ok: true, error: null }, { t: "status", at: t0 + 90_000, status: "finished", reason: null },
  ]));
  // A skill used in a chat, from a skill that is no longer installed.
  const h0 = now - 5 * DAY;
  db.run(
    `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, project_path, created_at, started_at, ended_at, source_ref, skill_version)
     VALUES (?, 'unknown:old-skill', 'old-skill', 1, 'history', 'finished', 'Tidy the changelog', ?, 'chat', ?, ?, ?, ?, 'seed:1-9', 1)`,
    runIds.history, trusted, trusted, h0, h0, h0 + 60_000,
  );
  mkdirSync(p.runDir(runIds.history), { recursive: true });
  writeFileSync(p.events(runIds.history), ev([
    { t: "text", at: h0 + 1000, agentId: null, text: "Tidying the changelog." },
    { t: "tool.start", at: h0 + 2000, id: "t1", agentId: null, name: "Read", input: { file_path: join(trusted, "CHANGELOG.md") } },
    { t: "tool.end", at: h0 + 3000, id: "t1", ok: true, result: "# Changelog" },
    { t: "status", at: h0 + 60_000, status: "finished", reason: null },
  ]));
  db.close();
  return { home, claudeHome, trusted, untrusted, runIds };
}
