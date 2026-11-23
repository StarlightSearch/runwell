/** The `runwell` command. */
import { main } from "./cli";
import { openUrl } from "./launcher";

main(process.argv.slice(2), {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  openUrl: (u) => openUrl(u),
  cwd: process.cwd(),
}).then(
  (code) => process.exit(code),
  (e: Error) => {
    process.stderr.write(`runwell: ${e.message}\n`);
    process.exit(1);
  },
);
