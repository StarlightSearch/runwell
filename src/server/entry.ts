/** `node dist/server.js`: starts the Runwell server, or exits quietly when another one already serves. */
import { startServer } from "./main";

// node:sqlite prints an ExperimentalWarning on first use; it is expected and says nothing to the person.
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (/SQLite is an experimental feature/.test(text)) return;
  (emit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

startServer().then(
  (s) => {
    const stop = () => void s.close().then(() => process.exit(0));
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  },
  (err: Error) => {
    process.stderr.write(`runwell: ${err.message}\n`);
    process.exit(err.message.startsWith("Another Runwell server") ? 0 : 1);
  },
);
