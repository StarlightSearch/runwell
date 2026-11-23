import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkProject, scanProjects, trustOf } from "./projects";

/** A fake home: real project folders, a ~/.claude.json and session logs under ~/.claude/projects. */
function home() {
  const root = mkdtempSync(join(tmpdir(), "runwell-proj-"));
  const claudeHome = join(root, ".claude");
  const claudeJson = join(root, ".claude.json");
  const proj = (name: string) => {
    const p = join(root, "work", name);
    mkdirSync(p, { recursive: true });
    return p;
  };
  const log = (encoded: string, lines: string[], mtimeSec: number) => {
    const dir = join(claudeHome, "projects", encoded);
    mkdirSync(dir, { recursive: true });
    const f = join(dir, "00000000-0000-4000-8000-000000000001.jsonl");
    writeFileSync(f, lines.join("\n") + "\n");
    utimesSync(f, mtimeSec, mtimeSec);
  };
  return { root, claudeHome, claudeJson, proj, log };
}

describe("scanProjects", () => {
  it("merges both sources, newest first, path from cwd, trust from .claude.json", () => {
    const h = home();
    const alpha = h.proj("alpha");
    const beta = h.proj("my-beta"); // the folder name has a dash, so the encoded name is ambiguous
    const gamma = h.proj("gamma");
    writeFileSync(h.claudeJson, JSON.stringify({ email: "x@example.com", projects: { [alpha]: { hasTrustDialogAccepted: true, allowedTools: [] }, [gamma]: { hasTrustDialogAccepted: false } } }));
    h.log("-encoded-alpha", [JSON.stringify({ type: "user", cwd: alpha })], 2_000_000);
    h.log("-encoded-my-beta", ["not json", JSON.stringify({ type: "summary" }), JSON.stringify({ type: "user", cwd: beta })], 3_000_000);
    const { projects, readable } = scanProjects(h.claudeHome, h.claudeJson);
    expect(readable).toBe(true);
    expect(projects.map((p) => p.path)).toEqual([beta, alpha, gamma]);
    expect(projects.find((p) => p.path === alpha)).toMatchObject({ name: "alpha", trusted: true, lastUsedAt: 2_000_000_000 });
    expect(projects.find((p) => p.path === beta)).toMatchObject({ name: "my-beta", trusted: false });
    expect(projects.find((p) => p.path === gamma)).toMatchObject({ trusted: false, lastUsedAt: null });
    expect(JSON.stringify(projects)).not.toContain("example.com");
  });

  it("hides Claude worktrees and folders that no longer exist", () => {
    const h = home();
    const alpha = h.proj("alpha");
    const wt = h.proj("alpha/.claude/worktrees/brave");
    writeFileSync(h.claudeJson, JSON.stringify({ projects: { [alpha]: {}, [wt]: {}, [join(h.root, "gone")]: {} } }));
    expect(scanProjects(h.claudeHome, h.claudeJson).projects.map((p) => p.path)).toEqual([alpha]);
  });

  it("is readable when one source works, and not when neither does; never throws", () => {
    const h = home();
    const alpha = h.proj("alpha");
    writeFileSync(h.claudeJson, "{broken");
    h.log("-a", [JSON.stringify({ cwd: alpha })], 1_000_000);
    expect(scanProjects(h.claudeHome, h.claudeJson)).toMatchObject({ readable: true, projects: [{ path: alpha }] });
    const empty = home();
    writeFileSync(empty.claudeJson, "{broken");
    expect(scanProjects(empty.claudeHome, empty.claudeJson)).toEqual({ projects: [], readable: false });
    expect(scanProjects("/nonexistent", "/nonexistent/.claude.json")).toEqual({ projects: [], readable: false });
  });

  it("trustOf: unknown or untrusted paths are untrusted", () => {
    const h = home();
    const alpha = h.proj("alpha");
    writeFileSync(h.claudeJson, JSON.stringify({ projects: { [alpha]: { hasTrustDialogAccepted: true } } }));
    const { projects } = scanProjects(h.claudeHome, h.claudeJson);
    expect(trustOf(projects, alpha)).toBe("trusted");
    expect(trustOf(projects, join(h.root, "other"))).toBe("untrusted");
  });
});

describe("checkProject", () => {
  it("reports existence, trust, hooks and MCP servers", () => {
    const h = home();
    const alpha = h.proj("alpha");
    mkdirSync(join(alpha, ".claude"), { recursive: true });
    writeFileSync(join(alpha, ".claude/settings.local.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
    writeFileSync(join(alpha, ".mcp.json"), "{}");
    expect(checkProject(alpha, [])).toEqual({ exists: true, trusted: false, hooks: true, mcp: true });
    const plain = h.proj("plain");
    expect(checkProject(plain, [{ path: plain, name: "plain", trusted: true, lastUsedAt: null, skillCount: 0 }])).toEqual({ exists: true, trusted: true, hooks: false, mcp: false });
    expect(checkProject(join(h.root, "nope"), [])).toEqual({ exists: false, trusted: false, hooks: false, mcp: false });
  });
});

describe("projects routes", () => {
  it("lists projects from the configured Claude folder and checks a path", async () => {
    const { createApp } = await import("./http");
    const { projectsRoutes } = await import("./routes/projects");
    const { loadConfig, saveConfig } = await import("./config");
    const { migrate, openDb } = await import("./db");
    const { paths } = await import("./paths");
    const { createHub } = await import("./sse");
    const h = home();
    const alpha = h.proj("alpha");
    writeFileSync(h.claudeJson, JSON.stringify({ projects: { [alpha]: { hasTrustDialogAccepted: true } } }));
    const p = paths(mkdtempSync(join(tmpdir(), "runwell-projroute-")));
    saveConfig(p, { claudeHome: h.claudeHome });
    const db = await openDb(p.db);
    migrate(db);
    const app = createApp({ paths: p, config: () => loadConfig(p), db, info: { pid: 1, port: 4792, token: "t".repeat(64), version: "0.1.0" }, hub: createHub(), now: Date.now, activeRuns: () => 0 }, [projectsRoutes]);
    const headers = { host: "127.0.0.1:4792", authorization: `Bearer ${"t".repeat(64)}`, "content-type": "application/json" };
    expect(await (await app.request("/api/projects", { headers })).json()).toMatchObject({ readable: true, projects: [{ path: alpha, trusted: true }] });
    expect(await (await app.request("/api/projects/check", { method: "POST", headers, body: JSON.stringify({ path: alpha }) })).json()).toEqual({ exists: true, trusted: true, hooks: false, mcp: false });
    expect((await app.request("/api/projects/check", { method: "POST", headers, body: JSON.stringify({ path: "relative" }) })).status).toBe(400);
  });
});
