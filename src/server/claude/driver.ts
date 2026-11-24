/**
 * Runs a skill through the person's own `claude -p` in stream-json mode (spike 1). Never `--bare`,
 * and nothing is added to the child's environment that could carry a credential: the person's own
 * signed-in `claude` does the work.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { AskAnswer, RunEvent } from "../../shared/events";
import type { OverviewStep } from "../../shared/graph/source-types";
import { DECISIONS, type Decisions } from "./decisions";
import { createNormaliser } from "./normalise";

export type RunMode = "auto" | "ask";

export interface RunSpec {
  runId: string;
  /** runs/<id>: where settings.json for the folder rule is written. */
  runDir: string;
  cwd: string;
  skillRef: string;
  brief: string;
  /** Absolute paths under runs/<id>/inputs. */
  inputs: string[];
  /** Set for fresh-folder runs: edits inside it are pre-allowed. */
  editFolder: string | null;
  /** A project given as read context to a fresh-folder run. */
  addDir: string | null;
  model: string | null;
  allowAll: boolean;
  /** "auto": Claude Code's Auto mode; "ask": the person's own settings decide (the old default). Ignored with allowAll. */
  mode: RunMode;
  steps: OverviewStep[] | null;
  mcpConfigPath: string;
}

export interface RunHandle {
  pid: number;
  events: AsyncIterable<RunEvent>;
  /** Claude's session id once its init line has arrived. */
  sessionId?(): string | null;
  stop(): Promise<void>;
  done: Promise<{ exitCode: number | null; sawResult: boolean; skippedLines: number }>;
}

/** Signals a child's whole process group (it was spawned detached), falling back to the child alone. */
function killGroup(child: { pid?: number; kill(s: NodeJS.Signals): boolean }, sig: NodeJS.Signals): void {
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch {
    child.kill(sig);
  }
}

export interface AgentDriver {
  start(spec: RunSpec): RunHandle;
  /** No-ops for the permission-tool route: answers travel back through the MCP tool's long poll. */
  answer(runId: string, askId: string, a: AskAnswer): void;
  decide(runId: string, askId: string, a: AskAnswer): void;
}

const flatSteps = (steps: OverviewStep[], out: OverviewStep[] = []): OverviewStep[] => {
  for (const s of steps) {
    out.push(s);
    if (s.children?.length) flatSteps(s.children, out);
  }
  return out;
};

export function systemPrompt(spec: RunSpec): string {
  const head = [`Run id: ${spec.runId}`, `This run is shown live in Workflows. Report progress with the workflows_step tool, passing runId "${spec.runId}".`];
  if (!spec.steps?.length) {
    return [
      ...head,
      'Name your own steps: call workflows_step with a short id you choose (for example "gather-sources") and status "started" when you begin each one, and "done", "failed" or "skipped" when it ends.',
    ].join("\n");
  }
  return [
    ...head,
    "Steps:",
    ...flatSteps(spec.steps).map((s) => `- ${s.id}: ${s.title}`),
    'Call workflows_step with status "started" when you begin a step and "done", "failed" or "skipped" when it ends. Start a loop step again each time you repeat it. If you do work that is not in the list, report it under a short id of your own.',
  ].join("\n");
}

export function firstMessage(spec: RunSpec, d: Decisions): string {
  const head = d.skillInvocation(spec.skillRef, spec.brief);
  return spec.inputs.length ? `${head}\n\nAttached files:\n${spec.inputs.join("\n")}` : head;
}

export function buildArgv(spec: RunSpec, d: Decisions): string[] {
  const argv = [
    "-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose",
    "--append-system-prompt", systemPrompt(spec),
    "--mcp-config", spec.mcpConfigPath,
    "--allowedTools", "mcp__workflows__workflows_step",
  ];
  if (spec.addDir) argv.push("--add-dir", spec.addDir);
  if (spec.model) argv.push("--model", spec.model);
  if (spec.editFolder) {
    const file = join(spec.runDir, "settings.json");
    writeFileSync(file, JSON.stringify(d.folderRule(spec.editFolder)));
    argv.push("--settings", file);
  }
  if (spec.allowAll) argv.push(...d.bypassFlag);
  else if (spec.mode === "auto") argv.push(...d.autoFlag);
  if (!spec.allowAll && (d.askRoute === "permission-tool" || d.askRoute === "mixed")) argv.push("--permission-prompt-tool", "mcp__workflows__workflows_permission");
  return argv;
}

/** A queue that is also an async iterable, ended once. */
function eventQueue() {
  const items: RunEvent[] = [];
  let ended = false;
  let wake: (() => void) | null = null;
  return {
    push(e: RunEvent) {
      items.push(e);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (items.length) {
          yield items.shift()!;
          continue;
        }
        if (ended) return;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    },
  };
}

export function createClaudeDriver(opts: { bin: string; home: string; extraEnv?: Record<string, string>; graceMs?: number; decisions?: Decisions; now?: () => number }): AgentDriver {
  const d = opts.decisions ?? DECISIONS;
  const grace = opts.graceMs ?? 5000;
  const now = opts.now ?? Date.now;

  return {
    start(spec) {
      const argv = buildArgv(spec, d);
      const child = spawn(opts.bin, argv, {
        cwd: spec.cwd,
        env: { ...process.env, ...opts.extraEnv, ...d.toolTimeoutEnv, WORKFLOWS_RUN_ID: spec.runId, WORKFLOWS_HOME: opts.home },
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, so a stop that has to force it also ends what it started (Bash children,
        // the MCP server). Not on Windows, where a detached child gets its own console window.
        detached: process.platform !== "win32",
      });
      const queue = eventQueue();
      const norm = createNormaliser(now);
      let sawResult = false;
      child.stdin.on("error", () => {});
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: firstMessage(spec, d) }] } }) + "\n");
      child.stderr.resume();

      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        for (const e of norm.push(line)) {
          queue.push(e);
          if (e.t === "result") {
            sawResult = true;
            child.stdin.end();
          }
        }
      });

      const done = new Promise<{ exitCode: number | null; sawResult: boolean; skippedLines: number }>((resolve) => {
        let exitCode: number | null = null;
        let closed = 0;
        const finish = () => {
          if (++closed < 2) return;
          for (const e of norm.end()) queue.push(e);
          queue.end();
          resolve({ exitCode, sawResult, skippedLines: norm.skipped() });
        };
        child.on("exit", (code) => {
          exitCode = code;
          finish();
        });
        rl.on("close", finish);
        child.on("error", () => {
          exitCode = null;
          closed = 1;
          finish();
        });
      });

      let stopping: Promise<void> | null = null;
      const stop = () =>
        (stopping ??= (async () => {
          if (child.exitCode !== null || child.signalCode !== null) return;
          child.kill(d.stopSignal);
          const exited = new Promise<void>((r) => child.once("exit", () => r()));
          const after = (ms: number) => new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms));
          if ((await Promise.race([exited, after(grace)])) === "timeout") {
            killGroup(child, "SIGTERM");
            if ((await Promise.race([exited, after(2000)])) === "timeout") killGroup(child, "SIGKILL");
          }
          await exited;
        })());

      return { pid: child.pid ?? 0, events: queue, sessionId: () => norm.sessionId(), stop, done };
    },
    answer() {},
    decide() {},
  };
}
