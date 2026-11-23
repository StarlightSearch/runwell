import type { GraphHeader } from "../../../src/shared/graph/types";

export function ProgressLine({ header }: { header: GraphHeader }) {
  const pct = header.stepTotal ? Math.round(((header.stepTotal - header.stepsLeft) / header.stepTotal) * 100) : 0;
  return (
    <div className="progress" data-testid="progress">
      <span>{header.stepTotal ? `Step ${Math.max(header.stepIndex, 0)} of ${header.stepTotal}` : "Waiting for the first step"}</span>
      <div className="bar">
        <i style={{ width: `${header.done ? 100 : pct}%` }} />
      </div>
      {header.agentsWorking ? <span>{header.agentsWorking} {header.agentsWorking === 1 ? "agent" : "agents"} running</span> : null}
      {header.failed ? <span className="failed-count">{header.failed} failed</span> : null}
    </div>
  );
}
