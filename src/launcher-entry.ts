/**
 * `node dist/launcher.js`: starts the server if needed and exits at once. Used by the hook and the mod.
 * Replacing an older server waits for it to shut down (up to a few seconds), so that case is handed to a
 * detached copy of this launcher (`--now`) and the caller, a Claude Code session start, never waits.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureServer, NODE_HINT, nodeOk } from "./launcher";
import { decide, probe, readServerInfo } from "./server/lifecycle";
import { paths } from "./server/paths";
import { VERSION } from "./shared/version";

async function main() {
  if (!process.argv.includes("--now")) {
    const info = readServerInfo(paths());
    if (info && decide(await probe(info), VERSION) === "replace") {
      const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "--now"], { detached: true, stdio: "ignore" });
      c.on("error", () => {});
      c.unref();
      return;
    }
  }
  await ensureServer({ wait: false });
}

if (!nodeOk()) {
  process.stderr.write(`${NODE_HINT}\n`);
  process.exit(0);
}
main().then(
  () => process.exit(0),
  () => process.exit(0),
);
