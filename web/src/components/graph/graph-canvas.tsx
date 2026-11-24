import type { GraphLayout } from "../../../../src/shared/graph/layout";
import type { GraphNode, WorkflowGraphModel } from "../../../../src/shared/graph/types";

const MARK: Partial<Record<GraphNode["state"], string>> = { done: "✓", failed: "!" };

/** "1. Read the brief" with tile "1" reads "Read the brief": the tile already shows the number. */
export function withoutNumber(label: string, tile: string): string {
  const m = /^(\d+(?:\.\d+)*)[.)]?\s+(.+)$/.exec(label);
  return m && m[1] === tile ? m[2]! : label;
}

export function GraphCanvas({ model, layout, selectedId, onSelect, askNodeIds }: { model: WorkflowGraphModel; layout: GraphLayout; selectedId: string | null; onSelect(id: string): void; askNodeIds: Set<string> }) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  return (
    <div className="graph" style={{ width: layout.width, height: layout.height }} data-mode={layout.mode}>
      {layout.groups.map((g) => (
        <div key={g.id} className="region" style={{ left: g.x, top: g.y, width: g.w, height: g.h }} data-testid="loop-region">
          <div className="rl">
            <span>↻ {g.labelLeft}</span>
            <span>{g.labelRight ?? ""}</span>
          </div>
        </div>
      ))}
      <svg width={layout.width} height={layout.height} aria-hidden>
        <defs>
          <marker id="wg-loop-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="currentColor" style={{ color: "var(--tx3)" }} />
          </marker>
        </defs>
        {layout.edges.map((e) => (
          <path key={`${e.from}-${e.to}`} className={`edge${e.live ? " live" : ""}`} d={e.path} />
        ))}
        {layout.loopReturns.map((r) => (
          <path key={r.groupId} className="loop-return" d={r.path} markerEnd="url(#wg-loop-arrow)" />
        ))}
      </svg>
      {layout.nodes.map((p) => {
        const n = byId.get(p.id);
        if (!n) return null;
        const asking = askNodeIds.has(n.id);
        return (
          <button
            key={n.id}
            type="button"
            className={`gnode ${n.kind === "agent" ? "agent" : "step"} state-${n.state}${selectedId === n.id ? " sel" : ""}${asking ? " asking" : ""}`}
            style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
            onClick={() => onSelect(n.id)}
            data-node={n.id}
            data-state={n.state}
            aria-label={n.label}
            title={n.label}
          >
            {n.kind === "agent" ? null : <span className="tile">{n.tile ?? ""}</span>}
            <span className="txt">
              <span className="lb">{n.tile && n.kind !== "agent" ? withoutNumber(n.label, n.tile) : n.label}</span>
              {asking ? <span className="ln">Waiting for you</span> : n.line ? <span className="ln">{n.line}</span> : null}
            </span>
            <span className="mark">{MARK[n.state] ?? ""}</span>
          </button>
        );
      })}
    </div>
  );
}
