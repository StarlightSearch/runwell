// Spike 5 launcher: spawns the stub detached with its own session and exits at once.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const [out, how] = process.argv.slice(2);
const stub = join(dirname(fileURLToPath(import.meta.url)), "stub.mjs");
spawn(process.execPath, [stub, out, how], { detached: true, stdio: "ignore" }).unref();
