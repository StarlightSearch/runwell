import type { GraphNode } from "../../../src/shared/graph/types";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const verb = (name: string) =>
  ({ Write: "Wrote", Edit: "Edited", MultiEdit: "Edited", NotebookEdit: "Edited", Read: "Read", Bash: "Ran", WebFetch: "Fetched", WebSearch: "Searched", Glob: "Listed", Grep: "Searched" })[name] ?? `Used ${name}`;

export interface ActivityItem {
  at: number | null;
  text: string;
  strong?: string;
}

/** A node's own activity, newest first: its tool calls, the agents it started, and its short messages. */
export function activityOf(node: GraphNode, agents: GraphNode[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const c of node.detail.toolCalls) {
    if (c.name === "subagent") continue;
    const target = c.target ? (c.target.split("/").pop() ?? c.target) : "";
    items.push({ at: c.startedAt, text: `${verb(c.name)} `, strong: c.name === "Bash" ? c.target : target || c.name });
  }
  for (const a of agents) items.push({ at: a.detail.startedAt, text: "Started agent ", strong: a.label });
  for (const o of node.detail.output.slice(-4)) items.push({ at: null, text: `"${o.trim().split("\n")[0]!.slice(0, 160)}"` });
  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export function ActivityList({ items, runStart }: { items: ActivityItem[]; runStart: number }) {
  if (!items.length) return <div className="desc">Nothing yet.</div>;
  return (
    <div>
      {items.slice(0, 60).map((it, i) => (
        <div className="ev" key={i}>
          <span className="k mono">{it.at ? mmss(it.at - runStart) : ""}</span>
          <span className="v">
            {it.text}
            {it.strong ? <b className={/^[A-Za-z]+ /.test(it.text) && it.text.startsWith("Ran") ? "mono" : ""}>{it.strong}</b> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
