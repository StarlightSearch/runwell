import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../shared/events";
import { DEFAULT_CONFIG, loadConfig } from "./config";
import { migrate, openDb } from "./db";
import { createApp } from "./http";
import { collectOutputs, createOutputsService, grantFor, outputFile } from "./outputs";
import { paths } from "./paths";
import { outputsRoutes } from "./routes/outputs";
import type { RunRow } from "./runs";
import { createHub } from "./sse";

const T0 = Date.UTC(2026, 10, 23, 10);
const run = (over: Partial<RunRow>): RunRow => ({
  id: "r1", skillKey: "personal:x", skillRef: "x", n: 1, kind: "button", status: "finished", brief: "", cwd: "", place: "folder",
  projectPath: null, model: null, allowAll: false, skillVersion: 1, createdAt: T0, startedAt: T0, endedAt: T0 + 60_000, waitingMs: 0,
  rating: null, note: null, error: null, sessionId: null, mode: "auto", ...over,
});
const write = (id: string, file_path: string): RunEvent[] => [{ t: "tool.start", at: T0 + 1, id, agentId: null, name: "Write", input: { file_path } }, { t: "tool.end", at: T0 + 2, id, ok: true, result: "ok" }];
function put(path: string, text: string, mtime = T0 + 30_000) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  utimesSync(path, mtime / 1000, mtime / 1000);
}

describe("collectOutputs", () => {
  it("a fresh-folder run lists what is in work/, nothing copied", () => {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    put(join(p.work("r1"), "a.txt"), "a");
    put(join(p.work("r1"), "sub/b.mp4"), "bb");
    const rows = collectOutputs(run({ cwd: p.work("r1") }), [], DEFAULT_CONFIG, p);
    expect(rows.map((r) => [r.path, r.label, r.kind, r.copied]).sort()).toEqual([["a.txt", "written", "text", false], ["sub/b.mp4", "written", "video", false]]);
  });

  it("a project run: Write paths are written, other changed files probably; skips node_modules, gitignored and outside paths", () => {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    const proj = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    put(join(proj, "report.md"), "r");
    put(join(proj, "poster.png"), "p");
    put(join(proj, "old.txt"), "o", T0 - 3_600_000);
    put(join(proj, "node_modules/x.js"), "x");
    put(join(proj, "secret.log"), "s");
    put(join(proj, ".gitignore"), "*.log\n", T0 - 3_600_000);
    const outside = join(mkdtempSync(join(tmpdir(), "runwell-else-")), "else.txt");
    put(outside, "e");
    const rows = collectOutputs(run({ place: "project", cwd: proj, projectPath: proj }), [...write("w1", join(proj, "report.md")), ...write("w2", outside)], DEFAULT_CONFIG, p);
    expect(rows.map((r) => [r.path, r.label]).sort()).toEqual([["poster.png", "probably"], ["report.md", "written"]]);
    expect(rows.every((r) => r.copied)).toBe(true);
    expect(existsSync(join(p.outputs("r1"), "report.md"))).toBe(true);
  });

  it("respects the copy caps: a big file is hashed not copied; copying stops at the run cap", () => {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    const proj = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    put(join(proj, "big.bin"), "x".repeat(20));
    let rows = collectOutputs(run({ place: "project", cwd: proj, projectPath: proj }), write("w", join(proj, "big.bin")), { ...DEFAULT_CONFIG, copyFileCapBytes: 10 }, p);
    expect(rows[0]).toMatchObject({ copied: false, bytes: 20 });
    expect(rows[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    const p2 = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    const proj2 = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    for (const n of ["a", "b", "c"]) put(join(proj2, `${n}.txt`), "y".repeat(10));
    rows = collectOutputs(run({ place: "project", cwd: proj2, projectPath: proj2 }), [], { ...DEFAULT_CONFIG, copyRunCapBytes: 25 }, p2);
    expect(rows.filter((r) => r.copied)).toHaveLength(2);
  });

  it("never follows a symlink; skips a file that vanished", () => {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    const proj = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    symlinkSync("/etc/hosts", join(proj, "hosts"));
    const rows = collectOutputs(run({ place: "project", cwd: proj, projectPath: proj }), [...write("w1", join(proj, "hosts")), ...write("w2", join(proj, "gone.txt"))], DEFAULT_CONFIG, p);
    expect(rows).toEqual([]);
  });
});

describe("files a run points to outside its folder", () => {
  const said = (text: string): RunEvent[] => [{ t: "text", at: T0 + 5, agentId: null, text }];
  it("keeps a file under home that the run named and wrote during the run, for both run kinds", () => {
    const home = mkdtempSync(join(tmpdir(), "runwell-home-"));
    const p = paths(join(home, ".runwell"));
    put(join(home, "Downloads", "ad-4x5.mp4"), "video");
    put(join(home, "Downloads", "old.mp4"), "old", T0 - 3_600_000);
    put(join(home, ".runwell", "runs", "x", "work", "inner.png"), "mine");
    const events = [
      ...said("Done. Saved to ~/Downloads/ad-4x5.mp4 (the 4:5 cut)."),
      ...said(`Also see ${join(home, "Downloads", "old.mp4")} and ${join(home, ".runwell", "runs", "x", "work", "inner.png")}`),
      { t: "tool.start", at: T0 + 6, id: "b1", agentId: null, name: "Bash", input: { command: "ffmpeg -i /tmp/frames/%04d.png ~/Downloads/missing.mp4" } } as RunEvent,
    ];
    const proj = mkdtempSync(join(tmpdir(), "runwell-proj-"));
    const projectRows = collectOutputs(run({ place: "project", cwd: proj, projectPath: proj }), events, DEFAULT_CONFIG, p, home);
    expect(projectRows.map((r) => [r.path, r.label, r.kind, r.copied])).toEqual([["~/Downloads/ad-4x5.mp4", "probably", "video", true]]);
    expect(readFileSync(join(p.outputs("r1"), "~/Downloads/ad-4x5.mp4"), "utf8")).toBe("video");

    mkdirSync(p.work("r2"), { recursive: true });
    const folderRows = collectOutputs(run({ id: "r2", cwd: p.work("r2") }), events, DEFAULT_CONFIG, p, home);
    expect(folderRows.map((r) => r.path)).toEqual(["~/Downloads/ad-4x5.mp4"]);
    expect(outputFile(run({ id: "r2", cwd: p.work("r2") }), "~/Downloads/ad-4x5.mp4", p)).toBe(realpathSync(join(p.outputs("r2"), "~/Downloads/ad-4x5.mp4")));
  });
});

describe("outputFile", () => {
  it("refuses absolute paths, .. segments and symlinks out of the folder", () => {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-out-")));
    put(join(p.work("r1"), "ok.txt"), "k");
    symlinkSync("/etc/hosts", join(p.work("r1"), "escape"));
    const r = run({ cwd: p.work("r1") });
    expect(outputFile(r, "ok.txt", p)).toBe(join(p.work("r1"), "ok.txt"));
    expect(outputFile(r, "../../runwell.db", p)).toBeNull();
    expect(outputFile(r, "/etc/passwd", p)).toBeNull();
    expect(outputFile(r, "escape", p)).toBeNull();
  });
});

describe("file route", () => {
  async function app(now = T0) {
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-outroute-")));
    const db = await openDb(p.db);
    migrate(db);
    const token = "t".repeat(64);
    db.run("INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, cwd, place, created_at) VALUES ('r1', 'personal:x', 'x', 1, 'button', 'finished', ?, 'folder', ?)", p.work("r1"), T0);
    put(join(p.work("r1"), "page.html"), "<script>fetch('/api/ping')</script>");
    put(join(p.work("r1"), "clip.mp4"), "0123456789abcdefghij");
    const svc = createOutputsService({ paths: p, db, config: () => loadConfig(p), token: () => token, now: () => now, reveal: () => {} });
    const a = createApp({ paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: 4795, token, version: "0.1.0" }, hub: createHub(), now: () => now, activeRuns: () => 0 }, [outputsRoutes(svc, (id) => (id === "r1" ? run({ cwd: p.work("r1") }) : null))]);
    return { a, token, p };
  }
  const host = { host: "127.0.0.1:4795" };

  it("serves a file with a good grant, sandboxed, with no cookie set", async () => {
    const { a, token } = await app();
    const g = grantFor(token, "r1", T0);
    const r = await a.request(`/o/${g}/r1/page.html`, { headers: host });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(r.headers.get("content-type")).toContain("text/html");
  });

  it("404s a bad grant, another run's grant and an expired grant", async () => {
    const { a, token } = await app();
    expect((await a.request(`/o/nope/r1/page.html`, { headers: host })).status).toBe(404);
    expect((await a.request(`/o/${grantFor(token, "r2", T0)}/r1/page.html`, { headers: host })).status).toBe(404);
    expect((await a.request(`/o/${grantFor(token, "r1", T0 - 2 * 3_600_000)}/r1/page.html`, { headers: host })).status).toBe(404);
    expect((await a.request(`/o/${grantFor(token, "r1", T0)}/r1/..%2F..%2Frunwell.db`, { headers: host })).status).toBe(404);
  });

  it("answers a Range request with 206", async () => {
    const { a, token } = await app();
    const r = await a.request(`/o/${grantFor(token, "r1", T0)}/r1/clip.mp4`, { headers: { ...host, range: "bytes=0-9" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-9/20");
    expect(await r.text()).toBe("0123456789");
  });
});
