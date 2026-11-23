import type { App, Ctx } from "../http";
import type { SkillsService } from "../skills";

export function skillsRoutes(skills: SkillsService) {
  return (app: App, _ctx: Ctx) => {
    app.get("/api/skills", (c) => c.json({ skills: skills.list() }));
    app.post("/api/skills/:key/ignore", async (c) => {
      const key = c.req.param("key");
      if (!skills.get(key)) return c.json({ error: "No skill with that key." }, 404);
      let body: { ignored?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Send { ignored: true | false }." }, 400);
      }
      if (typeof body.ignored !== "boolean") return c.json({ error: "Send { ignored: true | false }." }, 400);
      skills.setIgnored(key, body.ignored);
      return c.json({ ok: true, skill: skills.get(key) });
    });
  };
}
