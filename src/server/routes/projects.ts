import { homedir } from "node:os";
import { join } from "node:path";
import type { App, Ctx } from "../http";
import { checkProject, scanProjects } from "../projects";

export function projectsRoutes(app: App, ctx: Ctx): void {
  const scan = () => {
    const claudeHome = ctx.config().claudeHome ?? join(homedir(), ".claude");
    return scanProjects(claudeHome, join(claudeHome, "..", ".claude.json"));
  };
  app.get("/api/projects", (c) => c.json(scan()));
  app.post("/api/projects/check", async (c) => {
    let body: { path?: unknown } = {};
    try {
      body = await c.req.json();
    } catch {
      /* falls through to the 400 */
    }
    if (typeof body.path !== "string" || !body.path.startsWith("/")) return c.json({ error: "Send { path: \"/absolute/folder\" }." }, 400);
    return c.json(checkProject(body.path, scan().projects));
  });
}
