/** Runwell's data folder (`~/.runwell`, or RUNWELL_HOME) and every path in it. */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Paths {
  root: string;
  db: string;
  serverJson: string;
  lock: string;
  configJson: string;
  runs: string;
  workflows: string;
  runDir(id: string): string;
  events(id: string): string;
  inputs(id: string): string;
  work(id: string): string;
  outputs(id: string): string;
  workflowJson(id: string): string;
}

/**
 * Folders Runwell itself made Claude work in: its data folder (button runs' work folders) and the
 * temporary folders of "Draw the workflow". Claude Code records them like any folder; Runwell never
 * lists them as projects or reads their sessions back as history.
 */
export function isRunwellFolder(path: string, root: string): boolean {
  const p = path.replace(/\/+$/, "");
  return p === root || p.startsWith(`${root}/`) || /(^|\/)runwell-draw-[^/]*$/.test(p);
}

export function paths(home?: string): Paths {
  const root = home ?? process.env.RUNWELL_HOME ?? join(homedir(), ".runwell");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const runs = join(root, "runs");
  const runDir = (id: string) => join(runs, id);
  return {
    root,
    db: join(root, "runwell.db"),
    serverJson: join(root, "server.json"),
    lock: join(root, "server.lock"),
    configJson: join(root, "config.json"),
    runs,
    workflows: join(root, "workflows"),
    runDir,
    events: (id) => join(runDir(id), "events.jsonl"),
    inputs: (id) => join(runDir(id), "inputs"),
    work: (id) => join(runDir(id), "work"),
    outputs: (id) => join(runDir(id), "outputs"),
    workflowJson: (id) => join(runDir(id), "workflow.json"),
  };
}
