import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_CLAUDE, fakeEnv } from "../../test/fake-claude";
import { paths } from "./paths";
import type { SkillRow } from "./skills";
import { cachedWorkflow, createWorkflowService, DRAW_PROMPT } from "./workflow";

const SKILLS = join(__dirname, "../../test/fixtures/skills/claude/skills");

function skillAt(dir: string, over: Partial<SkillRow> = {}): SkillRow {
  return { key: "personal:x", source: "personal", name: "x", ref: "x", description: "", path: dir, plugin: null, marketplace: null, projectPath: null, warning: null, hash: "h" + Math.random().toString(16).slice(2), hasWorkflow: false, workflowNote: null, version: 1, ignored: false, ...over };
}
function plainSkill() {
  const dir = mkdtempSync(join(tmpdir(), "workflows-wfskill-"));
  writeFileSync(join(dir, "SKILL.md"), "---\nname: x\ndescription: d\n---\n# X\n## Gather\n## Write\n");
  return dir;
}
function fixtureAnswering(text: string, exitCode = 0) {
  const dir = mkdtempSync(join(tmpdir(), "workflows-wffx-"));
  const f = join(dir, "draw.jsonl");
  writeFileSync(f, [JSON.stringify({ type: "result", subtype: "success", is_error: false, result: text }), ...(exitCode ? [JSON.stringify({ __fake: "exit", code: exitCode })] : [])].join("\n"));
  return f;
}
function service(fixture: string, timeoutMs = 10_000) {
  const p = paths(mkdtempSync(join(tmpdir(), "workflows-wf-")));
  const log = join(p.root, "fake.log");
  const svc = createWorkflowService({ paths: p, claudeBin: () => FAKE_CLAUDE, extraEnv: fakeEnv({ fixture, log }), timeoutMs });
  const spawned = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"argv"')).length : 0);
  return { p, svc, spawned, log };
}
const GOOD = JSON.stringify({ steps: [{ title: "Gather", detail: "Collect sources", kind: "action" }, { title: "Write", detail: "Draft it", kind: "action" }] });

describe("workflow source", () => {
  it("a valid block is used and nothing is spawned", async () => {
    const { svc, p, spawned } = service(fixtureAnswering(GOOD));
    const r = await svc.resolveWorkflow(skillAt(join(SKILLS, "motion-ad")), { draw: true });
    expect(r.from).toBe("block");
    expect(r.steps!.map((s) => s.title)).toEqual(["Research the page", "Render"]);
    expect(spawned()).toBe(0);
    expect(cachedWorkflow(skillAt(join(SKILLS, "motion-ad")), p).from).toBe("block");
  });

  it("an invalid block gives a note", () => {
    const dir = mkdtempSync(join(tmpdir(), "workflows-wfbad-"));
    writeFileSync(join(dir, "SKILL.md"), "# X\n## Workflow map\n```pulsar-workflow\n{nope\n```\n");
    expect(cachedWorkflow(skillAt(dir), paths(mkdtempSync(join(tmpdir(), "workflows-wfp-"))))).toMatchObject({ from: "none", steps: null, note: "Workflow map ignored: the map is not valid JSON" });
  });

  it("no block and draw false: none, no spawn", async () => {
    const { svc, spawned } = service(fixtureAnswering(GOOD));
    expect(await svc.resolveWorkflow(skillAt(plainSkill()), { draw: false })).toMatchObject({ from: "none", steps: null });
    expect(spawned()).toBe(0);
  });

  it("draw true: draws, caches under ~/.pulsar-workflows/workflows, and a second call does not spawn", async () => {
    const { svc, p, spawned, log } = service(fixtureAnswering(GOOD));
    const dir = plainSkill();
    const before = readdirSync(dir);
    const skill = skillAt(dir);
    const r = await svc.resolveWorkflow(skill, { draw: true });
    expect(r.from).toBe("drawn");
    expect(r.steps!.map((s) => [s.id, s.title])).toEqual([["s1", "Gather"], ["s2", "Write"]]);
    expect(existsSync(join(p.workflows, `${skill.hash}.json`))).toBe(true);
    expect(readdirSync(dir)).toEqual(before);
    const again = await svc.resolveWorkflow(skill, { draw: true });
    expect(again.from).toBe("drawn");
    expect(spawned()).toBe(1);
    const logged = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const argv: string[] = logged.find((l) => l.argv).argv;
    expect(argv).toEqual(expect.arrayContaining(["-p", "--output-format", "json"]));
    expect(argv).not.toContain("--bare");
    expect(argv).toContain(DRAW_PROMPT);
  });

  it("an answer wrapped in a code fence still parses", async () => {
    const { svc } = service(fixtureAnswering("Here you go:\n```json\n" + GOOD + "\n```"));
    expect((await svc.resolveWorkflow(skillAt(plainSkill()), { draw: true })).from).toBe("drawn");
  });

  it.each([
    ["garbage", fixtureAnswering("I cannot do that.")],
    ["bad shape", fixtureAnswering(JSON.stringify({ steps: "no" }))],
    ["non-zero exit", fixtureAnswering(GOOD, 3)],
  ])("%s gives none", async (_n, fx) => {
    const { svc } = service(fx);
    expect((await svc.resolveWorkflow(skillAt(plainSkill()), { draw: true })).from).toBe("none");
  });

  it("a timeout gives none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "workflows-wfslow-"));
    const fx = join(dir, "slow.jsonl");
    writeFileSync(fx, [JSON.stringify({ __fake: "sleep", ms: 5000 }), JSON.stringify({ type: "result", is_error: false, result: GOOD })].join("\n"));
    const { svc } = service(fx, 300);
    const t = Date.now();
    expect((await svc.resolveWorkflow(skillAt(plainSkill()), { draw: true })).from).toBe("none");
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it("no claude binary gives none", async () => {
    const p = paths(mkdtempSync(join(tmpdir(), "workflows-wfnone-")));
    const svc = createWorkflowService({ paths: p, claudeBin: () => null });
    expect((await svc.resolveWorkflow(skillAt(plainSkill()), { draw: true })).from).toBe("none");
  });
});

describe("workflow routes", () => {
  it("reads the cached workflow and draws on request", async () => {
    const { createApp } = await import("./http");
    const { workflowRoutes } = await import("./routes/workflow");
    const { loadConfig } = await import("./config");
    const { migrate, openDb } = await import("./db");
    const { createHub } = await import("./sse");
    const { svc, p } = service(fixtureAnswering(GOOD));
    const skill = skillAt(plainSkill(), { key: "personal:x" });
    const db = await openDb(p.db);
    migrate(db);
    const app = createApp({ paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: 4794, token: "t".repeat(64), version: "0.1.0" }, hub: createHub(), now: Date.now, activeRuns: () => 0 }, [workflowRoutes({ get: (k) => (k === skill.key ? skill : null) }, svc)]);
    const headers = { host: "127.0.0.1:4794", authorization: `Bearer ${"t".repeat(64)}` };
    const key = encodeURIComponent(skill.key);
    expect(await (await app.request(`/api/skills/${key}/workflow`, { headers })).json()).toMatchObject({ from: "none" });
    expect(await (await app.request(`/api/skills/${key}/draw`, { method: "POST", headers })).json()).toMatchObject({ from: "drawn" });
    expect(await (await app.request(`/api/skills/${key}/workflow`, { headers })).json()).toMatchObject({ from: "drawn" });
    expect((await app.request(`/api/skills/nope/workflow`, { headers })).status).toBe(404);
  });
});
