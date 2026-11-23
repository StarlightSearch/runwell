/**
 * A stable colour per project, from its path: the same project is the same colour in the sidebar, the
 * Skills table and the filters, and different projects are easy to tell apart. Mid-tone hues that read on
 * both the dark and the light theme.
 */
const PROJECT_COLORS = ["#6d8cff", "#f0795a", "#3fb987", "#e3a63b", "#b07cf0", "#e8679f", "#3fb3cc", "#97b53f", "#e98d4a", "#8f9cff", "#57c4a4", "#d36fd0"];

export function projectColor(path: string): string {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 16777619);
  return PROJECT_COLORS[(h >>> 0) % PROJECT_COLORS.length]!;
}

/** "now", "5m", "3h", "2d", then dd/mm. For tight spots like the sidebar. */
export function shortAgo(ms: number, now = Date.now()): string {
  const m = Math.floor((now - ms) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const dt = new Date(ms);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
