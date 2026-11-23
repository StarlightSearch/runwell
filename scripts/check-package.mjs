// Checks what `npm publish` would ship: no native code, no install scripts in what users install,
// every entry the plugin and the bin need, and a sane size. Run after `npm run build`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`package check failed: ${msg}`);
  process.exit(1);
};

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString());
const files = pack.files.map((f) => f.path);

const native = files.filter((f) => f.endsWith(".node") || f.endsWith("binding.gyp"));
if (native.length) fail(`native files would ship: ${native.join(", ")}`);

for (const need of ["plugin/dist/web/index.html", "plugin/dist/server.js", "plugin/dist/mcp.js", "plugin/dist/cli.js", "plugin/dist/launcher.js", "plugin/hooks/register.js", "plugin/hooks/hooks.json", "plugin/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "dist/cli.js"]) {
  if (!files.includes(need)) fail(`${need} is missing (run npm run build)`);
}

// Install scripts in anything a user installs (the runtime dependencies and theirs).
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const scripted = Object.entries(lock.packages ?? {}).filter(([path, p]) => path && !p.dev && p.hasInstallScript).map(([path]) => path);
if (scripted.length) fail(`runtime dependencies with install scripts: ${scripted.join(", ")}`);

const mb = pack.unpackedSize / 1024 / 1024;
if (pack.size > 15 * 1024 * 1024) fail(`the package is ${(pack.size / 1024 / 1024).toFixed(1)} MB packed (limit 15 MB)`);
console.log(`package ok: ${files.length} files, ${(pack.size / 1024 / 1024).toFixed(1)} MB packed, ${mb.toFixed(1)} MB unpacked`);
