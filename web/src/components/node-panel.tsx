import { useState, type ReactNode } from "react";
import type { GraphNode, WorkflowGraphModel } from "../../../src/shared/graph/types";
import { formatDuration } from "../../../src/shared/format";
import { ActivityList, activityOf, messagesOf } from "./activity-list";
import { FileIcon } from "./icons";

const WRITE = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const STATE: Record<GraphNode["state"], string> = { waiting: "Not started", running: "Working", done: "Finished", skipped: "Skipped", failed: "Failed", not_run: "Not run", stopped: "Stopped" };
const LONG_TASK = 320;

export function NodePanel({ node, model, runStart, now, askSlot }: { node: GraphNode | null; model: WorkflowGraphModel; runStart: number; now: number; askSlot?: ReactNode }) {
  if (!node)
    return (
      <aside className="panel">
        <div className="pb">
          <div className="quiet">Select a step to see what it did.</div>
        </div>
      </aside>
    );
  return <NodeDetail key={node.id} node={node} model={model} runStart={runStart} now={now} askSlot={askSlot} />;
}

function NodeDetail({ node, model, runStart, now, askSlot }: { node: GraphNode; model: WorkflowGraphModel; runStart: number; now: number; askSlot?: ReactNode }) {
  const [taskOpen, setTaskOpen] = useState(false);
  const agents = model.nodes.filter((n) => n.kind === "agent" && n.parentId === node.id);
  const isAgent = node.kind === "agent";
  const { startedAt, endedAt } = node.detail;
  const time = startedAt ? (node.state === "running" ? `${formatDuration(now - startedAt)} so far` : endedAt ? formatDuration(endedAt - startedAt) : null) : null;
  const outputs = [...new Set(node.detail.toolCalls.filter((c) => WRITE.has(c.name) && c.target).map((c) => c.target!))];
  const messages = messagesOf(node);
  const brief = isAgent ? node.detail.brief?.trim() : null;
  const long = !!brief && brief.length > LONG_TASK;
  const running = node.state === "running";

  return (
    <aside className="panel" data-testid="node-panel">
      <header className="ph">
        <div className="ph-kind">{isAgent ? (node.role ?? "Agent") : node.tile ? `Step ${node.tile}` : "Step"}</div>
        <h3>{node.label}</h3>
        <div className="ph-meta">
          <span className={`chip state-${node.state}`}>
            <i className="chip-dot" />
            {STATE[node.state]}
          </span>
          {time ? <span className="chip plain">{time}</span> : null}
          {node.pass ? <span className="chip plain">Loop pass {node.pass}</span> : null}
          {agents.length ? <span className="chip plain">{agents.length} {agents.length === 1 ? "agent" : "agents"}</span> : null}
        </div>
      </header>
      <div className="pb">
        {askSlot}
        {brief ? (
          <section className="psec">
            <h4 className="lab">Task</h4>
            <div className={`task${long && !taskOpen ? " clamped" : ""}`}>{taskOpen ? brief : brief.slice(0, 1200)}</div>
            {long ? (
              <button type="button" className="more" onClick={() => setTaskOpen(!taskOpen)}>
                {taskOpen ? "Show less" : "Show the whole task"}
              </button>
            ) : null}
          </section>
        ) : null}
        {messages.length ? (
          <section className="psec">
            <h4 className="lab">{running ? "Latest update" : "Last said"}</h4>
            {messages.map((m, i) => (
              <p className="says" key={i}>
                {m.split("\n")[0]!.slice(0, 280)}
              </p>
            ))}
          </section>
        ) : null}
        <section className="psec">
          <h4 className="lab">Activity</h4>
          <ActivityList items={activityOf(node, agents)} runStart={runStart} empty={running ? "Getting started…" : node.state === "waiting" ? "Has not started yet." : "No actions recorded."} />
        </section>
        {outputs.length ? (
          <section className="psec">
            <h4 className="lab">Files written</h4>
            <div className="files">
              {outputs.map((p) => (
                <div className="file" key={p} title={p}>
                  <FileIcon size={14} />
                  <span className="p">{p.split("/").pop()}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
