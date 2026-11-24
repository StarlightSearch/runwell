/** Skills the person chose not to track: names or patterns, `*` matching any run of characters. */
export const DEFAULT_IGNORED = ["workflows:*"];

/**
 * `skillRef` is `name` or `plugin:name`. Whole-string, case-sensitive. A pattern starting with `@` names a
 * marketplace (`@claude-plugins-official`, `@my-*`) and matches every skill of every plugin installed from it.
 */
export function isIgnored(skillRef: string, patterns: string[], marketplace: string | null = null): boolean {
  return patterns.some((p) => (p.startsWith("@") ? marketplace !== null && matches(marketplace, p.slice(1)) : matches(skillRef, p)));
}

/** The pattern that ignores a whole plugin, and the one that ignores a whole marketplace. */
export const pluginPattern = (plugin: string) => `${plugin}:*`;
export const marketplacePattern = (marketplace: string) => `@${marketplace}`;

function matches(s: string, pattern: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return s === pattern;
  const first = parts[0]!;
  const last = parts.at(-1)!;
  if (!s.startsWith(first) || !s.endsWith(last) || s.length < first.length + last.length) return false;
  let pos = first.length;
  const stop = s.length - last.length;
  for (const mid of parts.slice(1, -1)) {
    const at = s.indexOf(mid, pos);
    if (at < 0 || at + mid.length > stop) return false;
    pos = at + mid.length;
  }
  return true;
}
