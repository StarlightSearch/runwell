import type { ReactNode } from "react";
import type { GraphNode, WorkflowGraphModel } from "../../../src/shared/graph/types";
import { formatDuration } from "../../../src/shared/format";
import { ActivityList, activityOf } from "./activity-list";

const WRITE = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export function NodePanel({ node, model, runStart, now, askSlot }: { node: GraphNode | null; model: WorkflowGraphModel; runStart: number; now: number; askSlot?: ReactNode }) {
  if (!node) return <aside className="panel"><div className="pb"><div className="desc">Select a step to see what it did.</div></div></aside>;
  const agents = model.nodes.filter((n) => n.kind === "agent" && n.parentId === node.id);
  const parts: string[] = [];
  if (node.pass) parts.push(`Loop pass ${node.pass}`);
  if (node.detail.startedAt) {
    parts.push(node.state === "running" ? `started ${formatDuration(now - node.detail.startedAt)} ago` : node.detail.endedAt ? formatDuration(node.detail.endedAt - node.detail.startedAt) : "started");
  }
  if (agents.length) parts.push(`${agents.length} ${agents.length === 1 ? "agent" : "agents"}`);
  if (node.kind === "agent") parts.unshift("Agent");
  const outputs = [...new Set(node.detail.toolCalls.filter((c) => WRITE.has(c.name) && c.target).map((c) => c.target))];
  return (
    <aside className="panel" data-testid="node-panel">
      <div className="ph">
        <h3>{node.label}</h3>
        {parts.length ? <p>{parts.join(" · ")}</p> : null}
      </div>
      <div className="pb">
        {askSlot}
        {node.kind === "agent" && node.detail.brief ? (
          <>
            <div className="lab">Task</div>
            <div className="desc" style={{ whiteSpace: "pre-wrap" }}>{node.detail.brief.slice(0, 600)}</div>
          </>
        ) : null}
        <div className="lab">Activity</div>
        <ActivityList items={activityOf(node, agents)} runStart={runStart} />
        {outputs.length ? (
          <>
            <div className="lab">Outputs so far</div>
            {outputs.map((p) => (
              <div className="file" key={p} title={p}>
                <span className="p">{p}</span>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );
}
