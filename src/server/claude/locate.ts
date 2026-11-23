/** Finds the person's own `claude`: a configured path, then PATH, then the usual install folders. */
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

function isExecutable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function locateClaude(opts: { configured: string | null; env: NodeJS.ProcessEnv; home: string }): string | null {
  const candidates = [
    ...(opts.configured ? [opts.configured] : []),
    ...(opts.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "claude")),
    join(opts.home, ".claude/local/claude"),
    join(opts.home, ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  return candidates.find(isExecutable) ?? null;
}
