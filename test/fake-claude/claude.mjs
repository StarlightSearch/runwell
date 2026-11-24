#!/usr/bin/env node
// A stand-in for the `claude` CLI in tests. It replays a recorded stream-json fixture and acts out the
// control lines in it (objects with a "__fake" key), which are never printed:
//   {"__fake":"sleep","ms":50}
//   {"__fake":"step","stepId":"s1","status":"started","note":null}   POSTs to Workflows' steps route
//   {"__fake":"ask","ask":{...}}                                     POSTs to the asks route and waits for the answer
//   {"__fake":"write","path":"out.txt","text":"hi"}                  writes relative to its working folder
//   {"__fake":"copy","from":"media/x.mp4","path":"x.mp4"}             copies a file from test/fixtures into it
//   {"__fake":"exit","code":1}
// Env: FAKE_CLAUDE_FIXTURE (path), FAKE_CLAUDE_AUTH (in|out), FAKE_CLAUDE_LOG (path),
// FAKE_CLAUDE_IGNORE_SIGINT=1, FAKE_CLAUDE_NOW=1, FAKE_CLAUDE_HOLD_MS (wait this long before replaying), WORKFLOWS_HOME, WORKFLOWS_RUN_ID.
// The brief can pick the fixture and behaviour instead (for a server started once): "[fixture:failure]"
// replays fixtures/stream/failure.jsonl, "[ignore-sigint]" ignores the interrupt.
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
const env = process.env;
const log = (o) => env.FAKE_CLAUDE_LOG && appendFileSync(env.FAKE_CLAUDE_LOG, JSON.stringify(o) + "\n");
const STOP_LINE = JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: null, session_id: "00000000-0000-4000-8000-000000000001" });

if (argv[0] === "--version") {
  process.stdout.write("2.1.330 (Claude Code)\n");
  process.exit(0);
}
if (argv[0] === "auth" && argv[1] === "status") {
  const signedIn = (env.FAKE_CLAUDE_AUTH ?? "in") === "in";
  process.stdout.write(JSON.stringify({ loggedIn: signedIn, authMethod: signedIn ? "claude.ai" : "none", email: "someone@example.com" }) + "\n");
  process.exit(signedIn ? 0 : 1);
}
if (!argv.includes("-p")) {
  process.stderr.write("fake claude: only -p, --version and auth status are supported\n");
  process.exit(2);
}

log({ argv, cwd: process.cwd(), pid: process.pid });
const refuse = (why) => {
  process.stderr.write(`fake claude: ${why}\n`);
  process.exit(2);
};
if (argv.includes("--bare")) refuse("--bare is not allowed");
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) if (env[k] !== undefined) refuse(`${k} must not be set`);

let stopping = false;
let ignoreSigint = env.FAKE_CLAUDE_IGNORE_SIGINT === "1";
let fixture = env.FAKE_CLAUDE_FIXTURE;
process.on("SIGINT", () => {
  if (ignoreSigint) return;
  stopping = true;
  process.stdout.write(STOP_LINE + "\n");
  process.exit(0);
});
process.on("SIGTERM", () => process.exit(143));

const sysIdx = argv.indexOf("--append-system-prompt");
const runId = env.WORKFLOWS_RUN_ID ?? (sysIdx >= 0 ? /Run id: (\S+)/.exec(argv[sysIdx + 1] ?? "")?.[1] : undefined);
const server = () => JSON.parse(readFileSync(join(env.WORKFLOWS_HOME ?? "", "server.json"), "utf8"));
const post = async (path, body) => {
  const s = server();
  const r = await fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok ? r.json().catch(() => ({})) : {};
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rl = createInterface({ input: process.stdin });
let started = false;
rl.on("line", async (line) => {
  log({ stdin: line });
  if (started) return;
  started = true;
  const pick = /\[fixture:([a-z-]+)\]/.exec(line);
  if (pick) fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "stream", `${pick[1]}.jsonl`);
  if (line.includes("[ignore-sigint]")) ignoreSigint = true;
  if (env.FAKE_CLAUDE_HOLD_MS) await sleep(Number(env.FAKE_CLAUDE_HOLD_MS));
  const lines = readFileSync(fixture, "utf8").split("\n").filter((l) => l.trim());
  for (const l of lines) {
    if (stopping) return;
    let ctl = null;
    if (l.includes('"__fake"')) {
      try {
        ctl = JSON.parse(l);
      } catch {
        ctl = null;
      }
    }
    if (!ctl || ctl.__fake === undefined) {
      // FAKE_CLAUDE_NOW=1: stamp lines with the current time, as real claude would (for screenshots).
      process.stdout.write((env.FAKE_CLAUDE_NOW === "1" ? l.replace(/"timestamp": "[^"]+"/g, `"timestamp": "${new Date().toISOString()}"`) : l) + "\n");
      continue;
    }
    if (ctl.__fake === "sleep") await sleep(ctl.ms ?? 0);
    else if (ctl.__fake === "write") {
      const target = join(process.cwd(), ctl.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, ctl.text ?? "");
    } else if (ctl.__fake === "copy") {
      const target = join(process.cwd(), ctl.path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", ctl.from), target);
    } else if (ctl.__fake === "step") {
      await post(`/api/runs/${runId}/steps`, { stepId: ctl.stepId, status: ctl.status, note: ctl.note ?? null }).catch(() => {});
    } else if (ctl.__fake === "ask") {
      const r = await post(`/api/runs/${runId}/asks`, ctl.ask).catch(() => ({}));
      log({ answered: r.answer ?? null });
    } else if (ctl.__fake === "exit") {
      process.exit(ctl.code ?? 0);
    }
  }
  process.exit(0);
});
