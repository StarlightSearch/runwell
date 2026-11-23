import type { SkillListItem } from "../../../src/server/skills";
import { projectColor } from "../lib/colors";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function sourceLabel(s: Pick<SkillListItem, "source" | "projectPath" | "plugin">): string {
  return s.source === "project" ? base(s.projectPath ?? "") : s.source === "plugin" ? (s.plugin ?? "plugin") : "Personal";
}

/** Where a skill comes from: a project (in its colour), a plugin (by name), or your personal skills. */
export function SourceTag({ skill }: { skill: Pick<SkillListItem, "source" | "projectPath" | "plugin"> }) {
  const label = sourceLabel(skill);
  if (skill.source === "project") {
    return (
      <span className="src src-project" title={skill.projectPath ?? ""}>
        <i className="pdot" style={{ background: projectColor(skill.projectPath ?? "") }} />
        {label}
      </span>
    );
  }
  return (
    <span className={`src src-${skill.source}`} title={skill.source === "plugin" ? `Plugin: ${label}` : "Your personal skills"}>
      {skill.source === "plugin" ? <span className="src-kind">plugin</span> : null}
      {label}
    </span>
  );
}
