import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** A process's command line: /proc on Linux, `ps` elsewhere (macOS). Null when it is not running. */
export function pidCommand(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() || null;
  } catch {
    try {
      return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { timeout: 2000 }).toString().trim() || null;
    } catch {
      return null;
    }
  }
}
