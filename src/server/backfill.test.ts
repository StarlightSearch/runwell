import { cpSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBackfill } from "./backfill";
import { loadConfig, saveConfig } from "./config";
import { migrate, openDb } from "./db";
import { paths } from "./paths";
import { createHub } from "./sse";

const FIXTURES = join(__dirname, "../../test/fixtures/sessions");
const t = (min: number) => new Date(Date.now() - 3_600_000 + min * 60_000).toISOString();
const cmd = (name: string, args: string, min: number, cwd: string) => JSON.stringify({ type: "user", cwd, timestamp: t(min), message: { role: "user", content: `<command-name>/${name}</command-name>\n<command-args>${args}</command-args>` } });
const write = (id: string, file_path: string, min: number, cwd: string) => JSON.stringify({ type: "assistant", cwd, timestamp: t(min), message: { content: [{ type: "tool_use", id, name: "Write", input: { file_path } }] } });

async function setup(opts: { ignored?: string[] } = {}) {
  const claudeHome = mkdtempSync(join(tmpdir(), "runwell-bfhome-"));
  mkdirSync(join(claudeHome, "projects"), { recursive: true });
  const p = paths(mkdtempSync(join(tmpdir(), "runwell-bf-")));
  saveConfig(p, { claudeHome, ...(opts.ignored ? { ignored: opts.ignored } : {}) });
  const db = await openDb(p.db);
  migrate(db);
  const hub = createHub();
  const bf = createBackfill({ paths: p, db, hub, config: () => loadConfig(p), skillKeyOf: (ref) => (ref === "known" ? "personal:known" : null), now: Date.now });
  const runs = () => db.all<{ id: string; skill_key: string; skill_ref: string; kind: string; place: string; status: string; source_ref: string; brief: string; project_path: string }>("SELECT * FROM runs ORDER BY created_at");
  return { claudeHome, p, db, bf, runs };
}
async function finish(bf: ReturnType<typeof createBackfill>) {
  bf.start();
  const t0 = Date.now();
  while (bf.state().status !== "done") {
    if (Date.now() - t0 > 8000) throw new Error("backfill did not finish");
    await new Promise((r) => setTimeout(r, 20));
  }
  return bf.state();
}

describe("backfill", () => {
  it("creates one history run from the fixture session, with its events", async () => {
    const s = await setup();
    cpSync(FIXTURES, join(s.claudeHome, "projects"), { recursive: true });
    const f = join(s.claudeHome, "projects/-home-user-project/00000000-0000-4000-8000-000000000001.jsonl");
    utimesSync(f, new Date(), new Date());
    const st = await finish(s.bf);
    expect(st).toMatchObject({ status: "done", filesDone: 1, filesTotal: 1, runsFound: 1 });
    const [r] = s.runs();
    expect(r).toMatchObject({ skill_key: "unknown:runwell-fixture", skill_ref: "runwell-fixture", kind: "history", place: "chat", status: "finished", brief: "colour list" });
    const events = readFileSync(s.p.events(r!.id), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(events.some((e) => e.t === "tool.start" && e.name === "Agent")).toBe(true);
    expect(events.at(-1)).toMatchObject({ t: "status", status: "finished" });
    expect((r as { session_id?: string }).session_id).toBeTruthy();
  });

  it("a history run recorded before session ids were kept gets its id from the log's file name", async () => {
    const s = await setup();
    s.db.run(
      "INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, created_at, source_ref) VALUES ('old', 'unknown:x', 'x', 1, 'history', 'finished', 1, ?)",
      "/home/u/.claude/projects/-p/0b1c2d3e-4f50-4617-8899-aabbccddeeff.jsonl:3-9",
    );
    await finish(s.bf);
    expect(s.db.get<{ session_id: string }>("SELECT session_id FROM runs WHERE id = 'old'")!.session_id).toBe("0b1c2d3e-4f50-4617-8899-aabbccddeeff");
  });

  it("running twice creates each run once; a grown file adds only the new use", async () => {
    const s = await setup();
    const dir = join(s.claudeHome, "projects/-p");
    mkdirSync(dir, { recursive: true });
    const proj = mkdtempSync(join(tmpdir(), "runwell-bfproj-"));
    const f = join(dir, "a.jsonl");
    writeFileSync(f, [cmd("known", "one", 0, proj), write("w1", join(proj, "x.txt"), 1, proj)].join("\n") + "\n");
    await finish(s.bf);
    await finish(s.bf);
    expect(s.runs()).toHaveLength(1);
    expect(s.runs()[0]!.skill_key).toBe("personal:known");
    appendFileSync(f, [cmd("known", "two", 5, proj), write("w2", join(proj, "y.txt"), 6, proj)].join("\n") + "\n");
    await finish(s.bf);
    expect(s.runs().map((r) => r.brief)).toEqual(["one", "two"]);
  });

  it("an ignored skill creates no run; a file older than the window is not read", async () => {
    const s = await setup({ ignored: ["known"] });
    const dir = join(s.claudeHome, "projects/-p");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.jsonl"), cmd("known", "x", 0, "/p") + "\n");
    const old = join(dir, "old.jsonl");
    writeFileSync(old, cmd("other", "x", 0, "/p") + "\n");
    const longAgo = new Date(Date.now() - 100 * 86_400_000);
    utimesSync(old, longAgo, longAgo);
    const st = await finish(s.bf);
    expect(st.filesTotal).toBe(1);
    expect(s.runs()).toHaveLength(0);
  });

  it("outputs: written files that still exist are copied and labelled history; gone ones are not listed", async () => {
    const s = await setup();
    const dir = join(s.claudeHome, "projects/-p");
    mkdirSync(dir, { recursive: true });
    const proj = mkdtempSync(join(tmpdir(), "runwell-bfproj-"));
    writeFileSync(join(proj, "kept.txt"), "k");
    writeFileSync(join(dir, "a.jsonl"), [cmd("known", "x", 0, proj), write("w1", join(proj, "kept.txt"), 1, proj), write("w2", join(proj, "gone.txt"), 2, proj)].join("\n") + "\n");
    await finish(s.bf);
    const id = s.runs()[0]!.id;
    expect(s.db.all("SELECT path, label, copied FROM outputs WHERE run_id = ?", id)).toEqual([{ path: "kept.txt", label: "history", copied: 1 }]);
    expect(readFileSync(join(s.p.outputs(id), "kept.txt"), "utf8")).toBe("k");
  });

  it("an unreadable projects folder ends done with zero files", async () => {
    const s = await setup();
    saveConfig(s.p, { claudeHome: "/nonexistent/claude" });
    expect(await finish(s.bf)).toMatchObject({ status: "done", filesDone: 0, filesTotal: 0 });
  });
});

describe("backfill routes", () => {
  it("reports state and rescans", async () => {
    const { createApp } = await import("./http");
    const { backfillRoutes } = await import("./routes/backfill");
    const s = await setup();
    const app = createApp({ paths: s.p, config: () => loadConfig(s.p), db: s.db, info: { pid: 1, port: 4797, token: "t".repeat(64), version: "0.1.0" }, hub: createHub(), now: Date.now, activeRuns: () => 0 }, [backfillRoutes(s.bf)]);
    const headers = { host: "127.0.0.1:4797", authorization: `Bearer ${"t".repeat(64)}` };
    expect(await (await app.request("/api/backfill", { headers })).json()).toMatchObject({ status: "idle" });
    expect((await app.request("/api/backfill/rescan", { method: "POST", headers })).status).toBe(200);
    await finish(s.bf);
    expect(await (await app.request("/api/backfill", { headers })).json()).toMatchObject({ status: "done" });
  });
});
