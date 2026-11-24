/** The data folder (`~/.pulsar-workflows`, or WORKFLOWS_HOME) and every path in it. */
import { existsSync, mkdirSync } from "node:fs";
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
 * Folders Workflows itself made Claude work in: its data folder (button runs' work folders) and the
 * temporary folders of "Draw the workflow". Claude Code records them like any folder; Workflows never
 * lists them as projects or reads their sessions back as history.
 */
export function isWorkflowsFolder(path: string, root: string): boolean {
  const p = path.replace(/\/+$/, "");
  return p === root || p.startsWith(`${root}/`) || /(^|\/)(workflows|runwell)-draw-[^/]*$/.test(p);
}

/**
 * `~/.pulsar-workflows`, unless only a folder from before the rename (`~/.runwell`, when this was called
 * Runwell) exists: that one is kept where it is, because Claude keys an old run's session by its work
 * folder, so moving it would break continuing that run.
 */
export function defaultRoot(home = homedir()): string {
  const root = join(home, ".pulsar-workflows");
  const legacy = join(home, ".runwell");
  return !existsSync(root) && existsSync(legacy) ? legacy : root;
}

export function paths(home?: string): Paths {
  const root = home ?? process.env.WORKFLOWS_HOME ?? defaultRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const runs = join(root, "runs");
  const runDir = (id: string) => join(runs, id);
  return {
    root,
    db: join(root, existsSync(join(root, "runwell.db")) ? "runwell.db" : "workflows.db"),
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
