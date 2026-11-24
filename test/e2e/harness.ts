/**
 * The end-to-end harness: the built server (plugin/dist/server.js) as a child process on a seeded temp
 * home, with the fake `claude`. Everything goes through HTTP. The brief picks the fake's fixture
 * ("[fixture:question]"), so one server serves every scenario.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_CLAUDE, FIXTURES } from "../fake-claude";
import { seed, type Seeded } from "../ui/seed";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const SERVER = join(ROOT, "plugin/dist/server.js");
export const BUILT = existsSync(SERVER);

export interface Harness {
  url: string;
  token: string;
  home: string;
  seeded: Seeded;
  log: string;
  fetchApi(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<Response>;
  startRun(fixture: string, input?: { brief?: string; flags?: string[]; place?: unknown }): Promise<{ id: string; n: number }>;
  waitForStatus(id: string, status: string, ms?: number): Promise<Record<string, unknown>>;
  stopServer(signal?: NodeJS.Signals): Promise<void>;
  restartServer(): Promise<void>;
  pid(): number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function harness(): Promise<Harness> {
  const seeded = await seed();
  const home = seeded.home;
  const cfgPath = join(home, "config.json");
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, "utf8")), claudePath: FAKE_CLAUDE, port: 20000 + Math.floor(Math.random() * 20000) }));
  const log = join(home, "fake.log");
  let child: ChildProcess | null = null;
  let info = { port: 0, token: "", pid: 0 };

  const start = async () => {
    child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, WORKFLOWS_HOME: home, FAKE_CLAUDE_FIXTURE: join(FIXTURES, "happy.jsonl"), FAKE_CLAUDE_LOG: log },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      await sleep(50);
      try {
        const s = JSON.parse(readFileSync(join(home, "server.json"), "utf8"));
        if (s.pid !== child.pid) continue;
        const r = await fetch(`http://127.0.0.1:${s.port}/health`);
        if (r.ok) {
          info = s;
          return;
        }
      } catch {
        /* not up yet */
      }
    }
    throw new Error("the server did not start");
  };
  await start();

  const h: Harness = {
    get url() {
      return `http://127.0.0.1:${info.port}`;
    },
    get token() {
      return info.token;
    },
    home,
    seeded,
    log,
    pid: () => info.pid,
    fetchApi: (path, init = {}) =>
      fetch(`http://127.0.0.1:${info.port}${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json", ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    async startRun(fixture, input = {}) {
      const brief = `${input.brief ?? "e2e"} [fixture:${fixture}]${(input.flags ?? []).map((f) => ` [${f}]`).join("")}`;
      const r = await h.fetchApi("/api/runs", { method: "POST", body: { skillKey: "personal:motion-ad", brief, place: input.place ?? { kind: "folder" } } });
      const body = (await r.json()) as { run?: { id: string; n: number }; message?: string };
      if (!body.run) throw new Error(`start failed: ${r.status} ${body.message}`);
      return body.run;
    },
    async waitForStatus(id, status, ms = 10_000) {
      const end = Date.now() + ms;
      for (;;) {
        const r = (await (await h.fetchApi(`/api/runs/${id}`)).json()) as { run: Record<string, unknown> };
        if (r.run?.status === status) return r.run;
        if (Date.now() > end) throw new Error(`run ${id} is ${r.run?.status}, not ${status}`);
        await sleep(100);
      }
    },
    async stopServer(signal = "SIGTERM") {
      const c = child;
      if (!c || c.exitCode !== null || c.signalCode !== null) return;
      const exited = new Promise((r) => c.once("exit", r));
      c.kill(signal);
      await exited;
    },
    async restartServer() {
      await h.stopServer();
      await start();
    },
  };
  return h;
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Reads a finished run's events through its SSE stream (stored events, then `end`). */
export async function readEvents(h: Harness, id: string): Promise<Record<string, unknown>[]> {
  const r = await h.fetchApi(`/api/runs/${id}/events`);
  const text = await r.text();
  return text
    .split("\n\n")
    .filter((b) => b.includes("event: event"))
    .map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data: "))!.slice(6)));
}

/** No credential-looking text anywhere in the data folder, and the fake never got --bare. */
export function checkHygiene(h: Harness): void {
  const hits = (word: string) => {
    try {
      return execFileSync("grep", ["-rIl", word, h.home]).toString().trim();
    } catch {
      return "";
    }
  };
  for (const word of ["ANTHROPIC", "oauth", "accessToken"]) if (hits(word)) throw new Error(`found "${word}" in ${hits(word)}`);
  const log = existsSync(h.log) ? readFileSync(h.log, "utf8") : "";
  if (log.includes("--bare")) throw new Error("the fake received --bare");
}
