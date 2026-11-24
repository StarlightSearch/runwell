import type { ReactNode } from "react";
import type { GraphNode } from "../../../src/shared/graph/types";
import { AgentIcon, FileIcon, GlobeIcon, PencilIcon, SearchIcon, TerminalIcon, WrenchIcon } from "./icons";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const verb = (name: string) =>
  ({ Write: "Wrote", Edit: "Edited", MultiEdit: "Edited", NotebookEdit: "Edited", Read: "Read", Bash: "Ran", WebFetch: "Fetched", WebSearch: "Searched the web for", Glob: "Listed", Grep: "Searched for" })[name] ?? `Used ${name}`;

type Kind = "read" | "write" | "run" | "web" | "search" | "agent" | "tool";
const kindOf = (name: string): Kind =>
  name === "Read" ? "read" : /Write|Edit/.test(name) ? "write" : name === "Bash" ? "run" : name.startsWith("Web") ? "web" : name === "Glob" || name === "Grep" ? "search" : "tool";
const ICON: Record<Kind, ReactNode> = {
  read: <FileIcon size={14} />,
  write: <PencilIcon size={14} />,
  run: <TerminalIcon size={14} />,
  web: <GlobeIcon size={14} />,
  search: <SearchIcon size={14} />,
  agent: <AgentIcon size={14} />,
  tool: <WrenchIcon size={14} />,
};

export interface ActivityItem {
  at: number | null;
  kind: Kind;
  text: string;
  strong?: string;
  /** Show `strong` as code (a shell command). */
  code?: boolean;
}

/** A node's own actions, newest first: its tool calls and the agents it started. */
export function activityOf(node: GraphNode, agents: GraphNode[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const c of node.detail.toolCalls) {
    if (c.name === "subagent") continue;
    const target = c.target ? (c.target.split("/").pop() ?? c.target) : "";
    const bash = c.name === "Bash";
    items.push({ at: c.startedAt, kind: kindOf(c.name), text: verb(c.name), strong: bash ? (c.target ?? undefined) : target || undefined, code: bash });
  }
  for (const a of agents) items.push({ at: a.detail.startedAt, kind: "agent", text: "Started", strong: a.label });
  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** What the node last said in its own words: its newest short messages, oldest first. */
export function messagesOf(node: GraphNode): string[] {
  return node.detail.output
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(-2);
}

export function ActivityList({ items, runStart, empty }: { items: ActivityItem[]; runStart: number; empty: string }) {
  if (!items.length) return <div className="quiet">{empty}</div>;
  return (
    <ol className="acts">
      {items.slice(0, 60).map((it, i) => (
        <li className="ev" key={i}>
          <span className="k">{it.at ? mmss(it.at - runStart) : ""}</span>
          <span className={`ic ${it.kind}`}>{ICON[it.kind]}</span>
          <span className="v">
            {it.text}
            {it.strong ? (
              <>
                {" "}
                {it.code ? <code>{it.strong}</code> : <b>{it.strong}</b>}
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
