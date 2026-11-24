import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultRoot, isWorkflowsFolder, paths } from "./paths";

describe("isWorkflowsFolder", () => {
  it("matches the data folder, anything inside it, and draw folders; nothing else", () => {
    expect(isWorkflowsFolder("/home/u/.pulsar-workflows", "/home/u/.pulsar-workflows")).toBe(true);
    expect(isWorkflowsFolder("/home/u/.pulsar-workflows/runs/abc/work", "/home/u/.pulsar-workflows")).toBe(true);
    expect(isWorkflowsFolder("/tmp/workflows-draw-84lM4M", "/home/u/.pulsar-workflows")).toBe(true);
    expect(isWorkflowsFolder("/home/u/.pulsar-workflows-old", "/home/u/.pulsar-workflows")).toBe(false);
    expect(isWorkflowsFolder("/home/u/code/workflows", "/home/u/.pulsar-workflows")).toBe(false);
    expect(isWorkflowsFolder("/tmp/workflows-draw-x/sub", "/home/u/.pulsar-workflows")).toBe(false);
    expect(isWorkflowsFolder("/tmp/runwell-draw-84lM4M", "/home/u/.pulsar-workflows")).toBe(true);
  });
});

describe("defaultRoot", () => {
  it("uses ~/.pulsar-workflows, keeping a ~/.runwell from before the rename while it is the only one", () => {
    const home = mkdtempSync(join(tmpdir(), "workflows-root-"));
    expect(defaultRoot(home)).toBe(join(home, ".pulsar-workflows"));
    mkdirSync(join(home, ".runwell"));
    expect(defaultRoot(home)).toBe(join(home, ".runwell"));
    mkdirSync(join(home, ".pulsar-workflows"));
    expect(defaultRoot(home)).toBe(join(home, ".pulsar-workflows"));
  });

  it("keeps an old folder's runwell.db", () => {
    const home = mkdtempSync(join(tmpdir(), "workflows-db-"));
    expect(paths(home).db).toBe(join(home, "workflows.db"));
    writeFileSync(join(home, "runwell.db"), "");
    expect(paths(home).db).toBe(join(home, "runwell.db"));
  });
});
