/**
 * Workflows' Claude Code mod (built to plugin/hooks/register.js). At session start it runs the launcher,
 * which starts the Workflows server detached if it is not running and exits; it registers /workflows.
 * Every handler catches its own errors: nothing here can break or slow a session. It makes no network
 * call; the CLI it runs talks only to 127.0.0.1.
 */
type RunResult = { exitCode: number; stdout: string; stderr: string };
type Api = {
  process: { run(argv: readonly string[]): Promise<RunResult> };
  command: { register(c: { name: string; description: string; argumentHint?: string; immediate?: boolean }): Promise<unknown> };
  session: { cwd(): Promise<string> };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<unknown> };
  env: { get(name: string): Promise<string | undefined> };
  fs: { read(path: string): Promise<string> };
  ui: { toast(text: string): unknown };
};
type Next = (e: unknown) => Promise<unknown>;
type On = (event: string, ...rest: unknown[]) => void;

const NODE_HINT = "Workflows needs Node 20 or newer to run. Install it from https://nodejs.org. Claude Code is not affected.";

// pathname is percent-encoded: a plugin folder with a space or an accent must be decoded.
const root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/$/, "");
const cli = `${root}/dist/cli.js`;
const launcher = `${root}/dist/launcher.js`;
let node = "node";

async function hintOnce($: Api): Promise<void> {
  try {
    if (await $.store.get("nodeHintShown")) return;
    await $.store.set("nodeHintShown", true);
    $.ui.toast(NODE_HINT);
  } catch {
    /* never in the way */
  }
}

/** Runs a Node script with `node` on PATH, else the nodePath in ~/.pulsar-workflows/config.json. */
async function runNode($: Api, args: string[]): Promise<RunResult | null> {
  try {
    return await $.process.run([node, ...args]);
  } catch {
    try {
      const home = await $.env.get("HOME");
      const cfg = JSON.parse(await $.fs.read(`${home}/.pulsar-workflows/config.json`)) as { nodePath?: unknown };
      if (typeof cfg.nodePath !== "string") return null;
      node = cfg.nodePath;
      return await $.process.run([node, ...args]);
    } catch {
      return null;
    }
  }
}

export function register(on: On): void {
  on("session.start", async ($: Api, e: unknown, next: Next) => {
    try {
      const r = await runNode($, [launcher]);
      if (!r || r.stderr.includes("Node 20")) await hintOnce($);
    } catch {
      /* the server is optional for the session */
    }
    try {
      await $.command.register({ name: "workflows", description: "Open Workflows, or run a skill in it", argumentHint: "[run <skill> [brief] | last]", immediate: true });
    } catch {
      /* the commands/workflows.md fallback still works */
    }
    return next(e);
  });

  on("command.run", { command: "workflows" }, async ($: Api, e: { args?: string }) => {
    try {
      const words = (e.args ?? "").trim().split(/\s+/).filter(Boolean);
      const cwd = await $.session.cwd();
      let argv: string[];
      if (!words.length || words[0] === "open") argv = [cli, "open"];
      else if (words[0] === "last") argv = [cli, "last", "--cwd", cwd];
      else if (words[0] === "run" && words[1]) argv = [cli, "run", words[1], words.slice(2).join(" "), "--cwd", cwd];
      else if (words[0] === "run") argv = [cli, "run"];
      else return { text: "Usage: /workflows, /workflows last, or /workflows run <skill> [brief]", isTextDisplayOnly: true };
      const r = await runNode($, argv);
      if (!r) {
        await hintOnce($);
        return { text: NODE_HINT, isTextDisplayOnly: true };
      }
      // The whole answer: one line for open, last and run, the list of skills for a bare `run`.
      const text = r.stdout.trim() || r.stderr.trim() || "Workflows could not start.";
      return { text: text.length > 6000 ? `${text.slice(0, 6000)}…` : text, isTextDisplayOnly: true };
    } catch {
      return { text: "Workflows could not start. Try npx workflows in a terminal.", isTextDisplayOnly: true };
    }
  });
}
