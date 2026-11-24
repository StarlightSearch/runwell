/** `node dist/mcp.js`: the stdio MCP server `claude` starts for each run. */
import { main } from "./server";

main().catch((err: Error) => {
  process.stderr.write(`workflows mcp: ${err.message}\n`);
  process.exit(1);
});
