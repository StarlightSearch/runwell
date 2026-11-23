import type { App, Ctx } from "../http";
import type { SkillsService } from "../skills";

export function skillsRoutes(skills: SkillsService, hasGraph: (s: { hasWorkflow: boolean; hash: string }) => boolean = (s) => s.hasWorkflow) {
  return (app: App, ctx: Ctx) => {
    // `ignored` is the person's patterns, so the page can tell a whole ignored plugin or marketplace.
    // `hasGraph`: a workflow map in SKILL.md, or a graph Claude has drawn for this version.
    app.get("/api/skills", (c) => c.json({ skills: skills.list().map((s) => ({ ...s, hasGraph: hasGraph(s) })), ignored: ctx.config().ignored }));
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
