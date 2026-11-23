import type { App, Ctx } from "../http";
import type { SkillsService } from "../skills";
import type { WorkflowService } from "../workflow";

export function workflowRoutes(skills: Pick<SkillsService, "get">, workflow: WorkflowService) {
  return (app: App, _ctx: Ctx) => {
    app.get("/api/skills/:key/workflow", (c) => {
      const skill = skills.get(c.req.param("key"));
      return skill ? c.json(workflow.cachedWorkflow(skill)) : c.json({ error: "No skill with that key." }, 404);
    });
    // The "Draw workflow" button: the one place besides starting a run that may spend the person's usage.
    app.post("/api/skills/:key/draw", async (c) => {
      const skill = skills.get(c.req.param("key"));
      if (!skill) return c.json({ error: "No skill with that key." }, 404);
      return c.json(await workflow.resolveWorkflow(skill, { draw: true }));
    });
  };
}
