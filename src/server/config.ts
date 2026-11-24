/** `~/.pulsar-workflows/config.json`: the person's settings. A bad or missing file never stops Workflows. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { DEFAULT_IGNORED } from "../shared/ignore";
import type { Paths } from "./paths";

export interface Config {
  port: number;
  ignored: string[];
  claudePath: string | null;
  nodePath: string | null;
  claudeHome: string | null;
  maxRuns: number;
  copyFileCapBytes: number;
  copyRunCapBytes: number;
  backfillDays: number;
}

export const DEFAULT_CONFIG: Config = {
  port: 4790,
  ignored: [...DEFAULT_IGNORED],
  claudePath: null,
  nodePath: null,
  claudeHome: null,
  maxRuns: 3,
  copyFileCapBytes: 200 * 1024 ** 2,
  copyRunCapBytes: 1024 ** 3,
  backfillDays: 90,
};

type Check = (v: unknown) => boolean;
const posInt: Check = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
const strOrNull: Check = (v) => v === null || typeof v === "string";
const CHECKS: Record<keyof Config, Check> = {
  port: (v) => posInt(v) && (v as number) < 65536,
  ignored: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  claudePath: strOrNull,
  nodePath: strOrNull,
  claudeHome: strOrNull,
  maxRuns: posInt,
  copyFileCapBytes: posInt,
  copyRunCapBytes: posInt,
  backfillDays: posInt,
};

function readRaw(p: Paths): Record<string, unknown> {
  try {
    const v = JSON.parse(readFileSync(p.configJson, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function loadConfig(p: Paths): Config {
  const raw = readRaw(p);
  const out = { ...DEFAULT_CONFIG, ignored: [...DEFAULT_CONFIG.ignored] } as Record<string, unknown>;
  for (const key of Object.keys(CHECKS) as (keyof Config)[]) {
    if (key in raw && CHECKS[key](raw[key])) out[key] = raw[key];
  }
  return out as unknown as Config;
}

/** Merges `patch` into the file (unknown keys kept) with a temp file and a rename. */
export function saveConfig(p: Paths, patch: Partial<Config>): Config {
  const merged = { ...readRaw(p), ...loadConfig(p), ...patch };
  const tmp = `${p.configJson}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, p.configJson);
  return loadConfig(p);
}
