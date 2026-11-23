/** `node dist/launcher.js`: starts the server if needed and exits at once. Used by the hook and the mod. */
import { ensureServer, NODE_HINT, nodeOk } from "./launcher";

if (!nodeOk()) {
  process.stderr.write(`${NODE_HINT}\n`);
  process.exit(0);
}
ensureServer({ wait: false }).then(
  () => process.exit(0),
  () => process.exit(0),
);
