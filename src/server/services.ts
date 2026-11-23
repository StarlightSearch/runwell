/** Builds every service and route for a server (or a test) from the base context. One wiring for both. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAskBroker } from "./asks";
import { claudeState, locateClaude } from "./claude/auth";
import { createClaudeDriver, type AgentDriver } from "./claude/driver";
import type { App, Ctx } from "./http";
import { createOutputsService } from "./outputs";
import { scanProjects } from "./projects";
import { asksRoutes } from "./routes/asks";
import { claudeRoutes } from "./routes/claude";
import { outputsRoutes } from "./routes/outputs";
import { projectsRoutes } from "./routes/projects";
import { runsRoutes } from "./routes/runs";
import { settingsRoutes } from "./routes/settings";
import { skillsRoutes } from "./routes/skills";
import { stepsRoutes } from "./routes/steps";
import { uploadsRoutes } from "./routes/uploads";
import { workflowRoutes } from "./routes/workflow";
import { createRunsService } from "./runs";
import { createSkillsService } from "./skills";
import { createWorkflowService } from "./workflow";

export interface ServiceOptions {
  /** Overrides for tests: the `claude` to run, extra child env (the fake's variables), stop grace. */
  claudeBin?: string;
  extraEnv?: Record<string, string>;
  graceMs?: number;
  reveal?: (file: string) => void;
  mcpEntry?: string;
}

function pidCommand(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() || null;
  } catch {
    return null;
  }
}

function defaultReveal(file: string): void {
  const p = platform();
  const child = p === "darwin" ? spawn("open", ["-R", file], { stdio: "ignore", detached: true }) : spawn("xdg-open", [dirname(file)], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

export function buildServices(ctx: Ctx, opts: ServiceOptions = {}) {
  const claudeHome = () => ctx.config().claudeHome ?? join(homedir(), ".claude");
  const projectsScan = () => scanProjects(claudeHome(), join(claudeHome(), "..", ".claude.json"));
  const claudeBin = () => opts.claudeBin ?? locateClaude({ configured: ctx.config().claudePath, env: process.env, home: homedir() });

  const skills = createSkillsService({ paths: ctx.paths, db: ctx.db, hub: ctx.hub, config: ctx.config, projects: () => projectsScan().projects.map((p) => p.path), now: ctx.now });
  const workflow = createWorkflowService({ paths: ctx.paths, claudeBin, extraEnv: opts.extraEnv });
  const outputs = createOutputsService({ paths: ctx.paths, db: ctx.db, config: ctx.config, token: () => ctx.info.token, now: ctx.now, reveal: opts.reveal ?? defaultReveal });

  let driver: AgentDriver | null = null;
  const driverFor = (): AgentDriver => {
    const bin = claudeBin();
    if (!bin) throw new Error("Claude Code was not found.");
    driver ??= createClaudeDriver({ bin, home: ctx.paths.root, extraEnv: opts.extraEnv, graceMs: opts.graceMs });
    return driver;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const mcpEntry = opts.mcpEntry ?? process.env.RUNWELL_MCP_ENTRY ?? join(here, "mcp.js");

  let broker: ReturnType<typeof createAskBroker>;
  const runs = createRunsService({
    paths: ctx.paths, db: ctx.db, hub: ctx.hub, config: ctx.config,
    driver: { start: (spec) => driverFor().start(spec), answer: () => {}, decide: () => {} },
    skill: (key) => skills.get(key),
    projects: () => projectsScan().projects,
    claude: async () => {
      const s = await claudeState({ configured: opts.claudeBin ?? ctx.config().claudePath, env: { ...process.env, ...opts.extraEnv } });
      return { found: s.found, signedIn: s.signedIn };
    },
    workflow: (skill) => workflow.resolveWorkflow(skill, { draw: true }),
    collectOutputs: (run, events) => outputs.collect(run, events),
    onRunEnd: (id) => broker.closeRun(id),
    pidCommand,
    mcpServer: () => ({ command: process.execPath, args: [mcpEntry] }),
    now: ctx.now,
  });
  broker = createAskBroker({
    append: runs.append,
    status: (id) => runs.get(id)?.status ?? null,
    agentOfCall: (runId, call) => {
      const e = runs.events(runId).find((x) => x.t === "tool.start" && x.id === call);
      return e && e.t === "tool.start" ? e.agentId : null;
    },
    now: ctx.now,
  });

  const routes: ((app: App, ctx: Ctx) => void)[] = [
    claudeRoutes,
    projectsRoutes,
    skillsRoutes(skills),
    workflowRoutes(skills, workflow),
    stepsRoutes(runs),
    asksRoutes(broker, runs),
    outputsRoutes(outputs, (id) => runs.get(id)),
    uploadsRoutes,
    runsRoutes({ runs, skills, workflow, broker, outputs }),
    settingsRoutes({ claudeBin, claudeHome }),
  ];
  return { skills, workflow, outputs, runs, broker, routes, claudeBin };
}

