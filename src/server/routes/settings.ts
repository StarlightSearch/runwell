import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../../shared/version";
import { saveConfig, type Config } from "../config";
import type { App, Ctx } from "../http";

function folderBytes(root: string, limit = 50_000): number {
  let total = 0;
  let seen = 0;
  const stack = [root];
  while (stack.length && seen < limit) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen++;
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += statSync(p).size;
        } catch {
          /* gone */
        }
      }
    }
  }
  return total;
}

function nodeVersion(path: string): string | null {
  try {
    return execFileSync(path, ["--version"], { timeout: 3000 }).toString().trim().replace(/^v/, "");
  } catch {
    return null;
  }
}

export function settingsRoutes(deps: { claudeBin(): string | null; claudeHome(): string }) {
  return (app: App, ctx: Ctx) => {
    app.get("/api/settings", (c) => {
      const config = ctx.config();
      const claudeHome = deps.claudeHome();
      const claudeJson = join(claudeHome, "..", ".claude.json");
      const bin = deps.claudeBin();
      const node = config.nodePath ?? process.execPath;
      return c.json({
        config,
        folders: {
          claudeHome: { path: claudeHome, found: existsSync(claudeHome) },
          claudeJson: { path: claudeJson, found: existsSync(claudeJson) },
          claudeBin: { path: bin, found: bin !== null },
          node: { path: node, version: nodeVersion(node) },
          data: { path: ctx.paths.root, bytes: folderBytes(ctx.paths.root) },
        },
        version: VERSION,
      });
    });

    app.patch("/api/settings", async (c) => {
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Send the settings to change." }, 400);
      }
      const patch: Partial<Config> = {};
      if ("port" in body) {
        if (typeof body.port !== "number" || !Number.isInteger(body.port) || body.port < 1024 || body.port > 65535) return c.json({ error: "The port must be a number from 1024 to 65535." }, 400);
        patch.port = body.port;
      }
      if ("ignored" in body) {
        if (!Array.isArray(body.ignored) || body.ignored.some((x) => typeof x !== "string")) return c.json({ error: "Ignored skills must be a list of names or patterns." }, 400);
        const list = (body.ignored as string[]).map((x) => x.trim()).filter(Boolean);
        if (list.length > 200) return c.json({ error: "Up to 200 ignored skills or patterns." }, 400);
        patch.ignored = list;
      }
      for (const key of ["claudePath", "nodePath", "claudeHome"] as const) {
        if (!(key in body)) continue;
        const v = body[key];
        if (v === null) patch[key] = null;
        else if (typeof v === "string" && existsSync(v)) patch[key] = v;
        else return c.json({ error: `That ${key === "claudeHome" ? "folder" : "file"} does not exist.` }, 400);
      }
      for (const key of ["maxRuns", "backfillDays"] as const) {
        if (!(key in body)) continue;
        const v = body[key];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > (key === "maxRuns" ? 10 : 3650)) return c.json({ error: `${key} is out of range.` }, 400);
        patch[key] = v;
      }
      const before = ctx.config();
      const config = saveConfig(ctx.paths, patch);
      return c.json({ config, restartNeeded: patch.port !== undefined && patch.port !== before.port });
    });
  };
}
