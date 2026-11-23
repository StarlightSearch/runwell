// Builds Runwell: the web UI with Vite into plugin/dist/web, and the Node entries with esbuild into
// plugin/dist (the plugin ships these) and dist (the npm package's bin). node-sqlite3-wasm stays external
// and is copied beside the bundles with its .wasm file.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outDirs = [join(root, "plugin/dist"), join(root, "dist")];

for (const d of outDirs) rmSync(d, { recursive: true, force: true });

await viteBuild({ configFile: join(root, "web/vite.config.ts"), logLevel: "warn" });

const entries = { server: "src/server/entry.ts", mcp: "src/mcp/entry.ts" };
if (existsSync(join(root, "src/cli.ts"))) entries.cli = "src/cli.ts";

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
  mkdirSync(join(outdir, "node_modules"), { recursive: true });
  cpSync(join(root, "node_modules/node-sqlite3-wasm"), join(outdir, "node_modules/node-sqlite3-wasm"), { recursive: true });
}
cpSync(join(root, "plugin/dist/web"), join(root, "dist/web"), { recursive: true });
console.log(`built runwell ${pkg.version}: ${Object.keys(entries).join(", ")} + web`);
