import type { SkillListItem } from "../../../src/server/skills";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function sourceLabel(s: Pick<SkillListItem, "source" | "projectPath">): string {
  return s.source === "project" ? `project · ${base(s.projectPath ?? "")}` : s.source;
}

export function SourceTag({ skill }: { skill: Pick<SkillListItem, "source" | "projectPath"> }) {
  return <span className={`src src-${skill.source}`}>{sourceLabel(skill)}</span>;
}
