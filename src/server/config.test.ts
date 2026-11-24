import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORED } from "../shared/ignore";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config";
import { paths } from "./paths";

const home = () => mkdtempSync(join(tmpdir(), "workflows-cfg-"));

describe("config", () => {
  it("defaults when the file is missing", () => {
    const p = paths(home());
    expect(loadConfig(p)).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toMatchObject({ port: 4790, ignored: DEFAULT_IGNORED, maxRuns: 3, backfillDays: 90, copyFileCapBytes: 200 * 1024 ** 2, copyRunCapBytes: 1024 ** 3 });
  });
  it("round trips and keeps unknown keys", () => {
    const p = paths(home());
    writeFileSync(p.configJson, JSON.stringify({ future: { x: 1 } }));
    const c = saveConfig(p, { port: 5000, ignored: ["a:*"] });
    expect(c.port).toBe(5000);
    expect(loadConfig(p)).toMatchObject({ port: 5000, ignored: ["a:*"] });
    expect(JSON.parse(readFileSync(p.configJson, "utf8")).future).toEqual({ x: 1 });
  });
  it("replaces wrong-typed values with defaults", () => {
    const p = paths(home());
    writeFileSync(p.configJson, JSON.stringify({ port: "x", ignored: 7 }));
    expect(loadConfig(p)).toEqual(DEFAULT_CONFIG);
  });
  it("unreadable JSON gives defaults", () => {
    const p = paths(home());
    writeFileSync(p.configJson, "{nope");
    expect(loadConfig(p)).toEqual(DEFAULT_CONFIG);
  });
  it("saveConfig leaves no temp file", () => {
    const p = paths(home());
    saveConfig(p, { maxRuns: 2 });
    expect(readdirSync(p.root).filter((f) => f.includes(".tmp"))).toEqual([]);
  });
  it("paths are under WORKFLOWS_HOME-style root with run folders", () => {
    const h = home();
    const p = paths(h);
    expect(p.root).toBe(h);
    expect(p.work("r1")).toBe(join(h, "runs", "r1", "work"));
    expect(p.events("r1")).toBe(join(h, "runs", "r1", "events.jsonl"));
  });
});
