// Builds Runwell: the web UI with Vite into plugin/dist/web, and the Node entries with esbuild into
// plugin/dist (the plugin ships these) and dist (the npm package's bin). node-sqlite3-wasm stays external
// and is copied beside the bundles with its .wasm file.
import { build } from "esbuild";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outDirs = [join(root, "plugin/dist"), join(root, "dist")];

for (const d of outDirs) rmSync(d, { recursive: true, force: true });

await viteBuild({ configFile: join(root, "web/vite.config.ts"), logLevel: "warn" });

const entries = { server: "src/server/entry.ts", mcp: "src/mcp/entry.ts", cli: "src/bin.ts", launcher: "src/launcher-entry.ts" };

for (const outdir of outDirs) {
  await build({
    entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, join(root, v)])),
    outdir,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["node-sqlite3-wasm"],
    define: { __RUNWELL_VERSION__: JSON.stringify(pkg.version) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  // The bin needs a shebang to run as `runwell`.
  const cli = join(outdir, "cli.js");
  writeFileSync(cli, `#!/usr/bin/env node\n${readFileSync(cli, "utf8")}`);
  chmodSync(cli, 0o755);
  mkdirSync(join(outdir, "node_modules"), { recursive: true });
  cpSync(join(root, "node_modules/node-sqlite3-wasm"), join(outdir, "node_modules/node-sqlite3-wasm"), { recursive: true });
}
cpSync(join(root, "plugin/dist/web"), join(root, "dist/web"), { recursive: true });

// The mod: one readable file with no imports (mods may import only their own files and claude-code).
const mod = join(root, "plugin/hooks/register.js");
await build({ entryPoints: [join(root, "src/plugin/mod.ts")], outfile: mod, bundle: true, format: "esm", platform: "neutral", target: "es2022", minify: false, logLevel: "warning" });
if (/^\s*import\s|\brequire\(/m.test(readFileSync(mod, "utf8"))) throw new Error("The mod must not import anything.");
console.log(`built runwell ${pkg.version}: ${Object.keys(entries).join(", ")}, mod + web`);
