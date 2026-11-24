import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
export const FAKE_CLAUDE = join(here, "claude.mjs");
export const FIXTURES = join(here, "..", "fixtures", "stream");

export function fakeEnv(opts: { fixture: string; auth?: "in" | "out"; ignoreSigint?: boolean; log?: string; holdMs?: number; home?: string }): Record<string, string> {
  return {
    FAKE_CLAUDE_FIXTURE: opts.fixture.includes("/") ? opts.fixture : join(FIXTURES, `${opts.fixture}.jsonl`),
    FAKE_CLAUDE_AUTH: opts.auth ?? "in",
    ...(opts.ignoreSigint ? { FAKE_CLAUDE_IGNORE_SIGINT: "1" } : {}),
    ...(opts.log ? { FAKE_CLAUDE_LOG: opts.log } : {}),
    ...(opts.holdMs ? { FAKE_CLAUDE_HOLD_MS: String(opts.holdMs) } : {}),
    ...(opts.home ? { WORKFLOWS_HOME: opts.home } : {}),
  };
}
