// Spike 1 route A server: /decide long-polls 25 s and answers "allow" once 70 s have passed since the first ask.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const LOG = process.env.RELAY_LOG;
let firstAsk = null;
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/log") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { appendFileSync(LOG, b + "\n"); res.end("ok"); });
    return;
  }
  if (url.pathname === "/decide") {
    firstAsk ??= Date.now();
    appendFileSync(LOG, JSON.stringify({ kind: "poll", tool: url.searchParams.get("tool"), at: Date.now() }) + "\n");
    const wait = Math.max(0, Math.min(25000, firstAsk + 70000 - Date.now()));
    setTimeout(() => res.end(Date.now() - firstAsk >= 70000 ? (url.searchParams.get("tool") === "Bash" ? "deny" : "allow") : "wait"), wait);
    return;
  }
  res.statusCode = 404; res.end();
}).listen(47911, "127.0.0.1");
