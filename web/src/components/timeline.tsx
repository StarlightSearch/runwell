import type { RunEvent } from "../../../src/shared/events";
import { formatDuration } from "../../../src/shared/format";
import type { WorkflowGraphModel } from "../../../src/shared/graph/types";
import { timelineRows } from "../lib/timeline";
import "./tabs.css";

export function Timeline({ model, events, start, end }: { model: WorkflowGraphModel; events: RunEvent[]; start: number; end: number }) {
  const rows = timelineRows(model, events, end);
  if (!rows.length) return <div className="desc">Nothing has started yet.</div>;
  const t0 = Math.min(start, ...rows.map((r) => r.start));
  const span = Math.max(1, end - t0);
  const pct = (t: number) => `${((t - t0) / span) * 100}%`;
  return (
    <div className="tl" data-testid="timeline">
      <div className="axis">
        <span />
        <span className="ticks">
          <span>0s</span>
          <span>{formatDuration(span / 2)}</span>
          <span>{formatDuration(span)}</span>
        </span>
        <span />
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`tlr ${r.kind}${r.kind === "step" && r.end >= end && model.nodes.find((n) => n.id === r.id)?.state === "running" ? " open" : ""}`} data-testid={`tl-${r.kind}`}>
          <span className="nm" title={r.label}>
            {r.label}
          </span>
          <span className="tlb">
            <i style={{ left: pct(r.start), width: `calc(${pct(r.end)} - ${pct(r.start)})` }} />
          </span>
          <span className="mono desc">{formatDuration(r.end - r.start)}</span>
        </div>
      ))}
    </div>
  );
}
