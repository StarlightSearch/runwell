import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "./config";
import { migrate, openDb } from "./db";
import { paths } from "./paths";
import { createSkillsService, scanSkills } from "./skills";
import { createHub } from "./sse";

const FIXTURE = join(__dirname, "../../test/fixtures/skills");

/** A private copy of the fixture tree, with the installed-plugins record pointing at it. */
function tree() {
  const dir = mkdtempSync(join(tmpdir(), "runwell-skills-"));
  cpSync(FIXTURE, dir, { recursive: true });
  const claudeHome = join(dir, "claude");
  const rec = join(claudeHome, "plugins/installed_plugins.json");
  writeFileSync(rec, readFileSync(rec, "utf8").replaceAll("__CLAUDE__", claudeHome));
  return { claudeHome, project: join(dir, "project") };
}

describe("scanSkills", () => {
  it("finds personal, plugin and project skills with their keys and refs", () => {
    const t = tree();
    const rows = scanSkills({ claudeHome: t.claudeHome, projects: [t.project] });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(Object.keys(byKey).sort()).toEqual([
      "personal:broken", "personal:motion-ad", "plugin:toolkit:format", "plugin:toolkit:lint", `project:${t.project}:deploy`,
    ].sort());
    expect(byKey["plugin:toolkit:lint"]).toMatchObject({ source: "plugin", ref: "toolkit:lint", plugin: "toolkit", marketplace: "mkt", description: "Lints code (1.2.0)." });
    expect(byKey[`project:${t.project}:deploy`]).toMatchObject({ source: "project", ref: "deploy", projectPath: t.project });
    expect(byKey["personal:motion-ad"]).toMatchObject({ ref: "motion-ad", hasWorkflow: true, workflowNote: null });
    expect(byKey["plugin:toolkit:format"]).toMatchObject({ hasWorkflow: false, workflowNote: "Workflow map ignored: the map is not valid JSON" });
  });

  it("lists an unreadable skill under its folder name with a warning", () => {
    const t = tree();
    const broken = scanSkills({ claudeHome: t.claudeHome, projects: [] }).find((r) => r.key === "personal:broken")!;
    expect(broken).toMatchObject({ name: "broken", ref: "broken", warning: "Could not read this skill's header" });
  });

  it("finds plugin skills through the cache when the installed record is missing, newest version per plugin", () => {
    const t = tree();
    rmSync(join(t.claudeHome, "plugins/installed_plugins.json"));
    const lint = scanSkills({ claudeHome: t.claudeHome, projects: [] }).find((r) => r.key === "plugin:toolkit:lint")!;
    expect(lint.description).toBe("Lints code (1.2.0).");
  });

  it("returns [] for a Claude folder that does not exist", () => {
    expect(scanSkills({ claudeHome: "/nonexistent/claude-home", projects: ["/nonexistent/project"] })).toEqual([]);
  });
});

async function service() {
  const t = tree();
  const p = paths(mkdtempSync(join(tmpdir(), "runwell-skillsvc-")));
  saveConfig(p, { claudeHome: t.claudeHome });
  const db = await openDb(p.db);
  migrate(db);
  const hub = createHub();
  let now = Date.UTC(2026, 10, 23, 12);
  const svc = createSkillsService({ paths: p, db, hub, config: () => loadConfig(p), projects: () => [t.project], now: () => now });
  return { t, p, db, hub, svc, setNow: (n: number) => (now = n) };
}

describe("SkillsService", () => {
  it("a changed SKILL.md changes the hash and bumps the version", async () => {
    const { t, svc } = await service();
    svc.rescan();
    const before = svc.get("personal:motion-ad")!;
    expect(before.version).toBe(1);
    writeFileSync(join(t.claudeHome, "skills/motion-ad/SKILL.md"), "---\nname: motion-ad\ndescription: changed\n---\n");
    svc.rescan();
    const after = svc.get("personal:motion-ad")!;
    expect(after.hash).not.toBe(before.hash);
    expect(after.version).toBe(2);
    svc.rescan();
    expect(svc.get("personal:motion-ad")!.version).toBe(2);
  });

  it("setIgnored round trips through config.json; patterns mark refs ignored", async () => {
    const { p, svc } = await service();
    svc.rescan();
    svc.setIgnored("personal:motion-ad", true);
    expect(loadConfig(p).ignored).toContain("motion-ad");
    expect(svc.list().find((s) => s.key === "personal:motion-ad")!.ignored).toBe(true);
    svc.setIgnored("personal:motion-ad", false);
    expect(loadConfig(p).ignored).not.toContain("motion-ad");
    saveConfig(p, { ignored: ["toolkit:*"] });
    expect(svc.list().find((s) => s.key === "plugin:toolkit:lint")!.ignored).toBe(true);
  });

  it("list carries run counts, ratings and a 14-day trend from runs (button and history)", async () => {
    const { db, svc, setNow } = await service();
    svc.rescan();
    const day = 86_400_000;
    const now = Date.UTC(2026, 10, 23, 12);
    setNow(now);
    const add = (id: string, kind: string, ago: number, rating: number | null, status = "finished") =>
      db.run("INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, created_at, rating) VALUES (?, 'personal:motion-ad', 'motion-ad', 1, ?, ?, ?, ?)", id, kind, status, now - ago, rating);
    add("a", "button", 0, 1);
    add("b", "history", 2 * day, -1);
    add("c", "button", 2 * day, null);
    add("d", "history", 20 * day, 1);
    add("e", "button", 1000, null, "running");
    const item = svc.list().find((s) => s.key === "personal:motion-ad")!;
    expect(item.runCount).toBe(5);
    expect(item).toMatchObject({ rated: 3, up: 2, liveRunId: "e" });
    expect(item.runs14).toHaveLength(14);
    expect(item.runs14[13]).toBe(2);
    expect(item.runs14[11]).toBe(2);
    expect(item.runs14.reduce((a, b) => a + b, 0)).toBe(4);
    expect(item.lastRunAt).toBe(now);
  });

  it("publishes skills on the hub after a rescan that changed something", async () => {
    const { hub, svc } = await service();
    const seen: string[] = [];
    hub.subscribe(["skills"], (topic) => seen.push(topic));
    svc.rescan();
    expect(seen).toEqual(["skills"]);
    svc.rescan();
    expect(seen).toEqual(["skills"]);
  });
});

describe("skills routes", () => {
  it("lists skills and toggles ignore by key", async () => {
    const { createApp } = await import("./http");
    const { skillsRoutes } = await import("./routes/skills");
    const { p, db, hub, svc } = await service();
    svc.rescan();
    const app = createApp({ paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: 4791, token: "t".repeat(64), version: "0.1.0" }, hub, now: Date.now, activeRuns: () => 0 }, [skillsRoutes(svc)]);
    const headers = { host: "127.0.0.1:4791", authorization: `Bearer ${"t".repeat(64)}`, "content-type": "application/json" };
    const list = (await (await app.request("/api/skills", { headers })).json()) as { skills: { key: string }[] };
    expect(list.skills.map((s) => s.key)).toContain("personal:motion-ad");
    const r = await app.request(`/api/skills/${encodeURIComponent("plugin:toolkit:lint")}/ignore`, { method: "POST", headers, body: JSON.stringify({ ignored: true }) });
    expect(r.status).toBe(200);
    expect(loadConfig(p).ignored).toContain("toolkit:lint");
    expect((await app.request(`/api/skills/nope/ignore`, { method: "POST", headers, body: "{}" })).status).toBe(404);
    expect((await app.request(`/api/skills/${encodeURIComponent("personal:motion-ad")}/ignore`, { method: "POST", headers, body: "{\"ignored\":\"yes\"}" })).status).toBe(400);
  });
});
