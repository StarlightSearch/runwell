// Spike 5 stub server: listens on a free 127.0.0.1 port, records {pid, port, startedAt, how},
// and appends a heartbeat line every second so survival can be checked afterwards.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
const out = process.argv[2];
const how = process.argv[3] ?? "unknown";
const srv = createServer((_, res) => res.end("ok")).listen(0, "127.0.0.1", () => {
  writeFileSync(`${out}/${how}.json`, JSON.stringify({ pid: process.pid, port: srv.address().port, startedAt: Date.now(), how }));
});
setInterval(() => appendFileSync(`${out}/${how}.beat`, Date.now() + "\n"), 1000);
setTimeout(() => process.exit(0), 120000);
