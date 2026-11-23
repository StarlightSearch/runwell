/**
 * Reads a SKILL.md's leading `---` header: `key: value`, quoted values, and `>` / `|` blocks.
 * Hand-written and linear, because the file is user-written. Never throws.
 */
export interface SkillHeader {
  name: string | null;
  description: string | null;
  warning: string | null;
}

const BAD_HEADER = "Could not read this skill's header";

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) return t.slice(1, -1);
  return t;
}

export function parseSkillMd(text: string): SkillHeader {
  const fail: SkillHeader = { name: null, description: null, warning: BAD_HEADER };
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  if (!/^---\r?\n/.test(src)) return fail;
  const body = src.slice(src.indexOf("\n") + 1);
  const end = body.search(/^---\s*$/m);
  if (end < 0) return fail;
  const lines = body.slice(0, end).split(/\r?\n/);

  const fields = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]!) || lines[i + 1] === "")) block.push(lines[++i]!.trim());
      while (block.length && block.at(-1) === "") block.pop();
      fields.set(key, raw.startsWith(">") ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n"));
    } else {
      fields.set(key, unquote(raw));
    }
  }
  const name = fields.get("name") || null;
  const description = fields.get("description") || null;
  return { name, description, warning: name === null && description === null ? BAD_HEADER : null };
}
