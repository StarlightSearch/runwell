import type { RunEvent } from "../../../src/shared/events";
import { formatDuration } from "../../../src/shared/format";
import type { WorkflowGraphModel } from "../../../src/shared/graph/types";
import { timelineRows } from "../lib/timeline";
import "./past-run.css";

export interface Segment {
  id: string;
  label: string;
  state: "done" | "failed" | "waiting" | "pending";
  ms: number | null;
  start: number;
}

/** One segment per top-level step (a loop is one segment with its pass count), plus each wait for the person. */
export function segmentsOf(model: WorkflowGraphModel, events: RunEvent[], endAt: number): Segment[] {
  const loops = new Map(model.groups.filter((g) => g.kind === "loop").map((g) => [g.stepId, g]));
  const byKey = new Map<string, { label: string; ids: string[] }>();
  for (const n of model.nodes) {
    if (n.kind === "agent") continue;
    const key = n.parentId && loops.has(n.parentId) ? n.parentId : n.parentId ? null : n.id;
    if (!key) continue;
    const g = loops.get(key);
    const entry = byKey.get(key) ?? { label: g ? `${g.title} ↻ ×${g.pass ?? 1}` : n.label, ids: [] };
    entry.ids.push(n.id);
    byKey.set(key, entry);
  }
  const out: Segment[] = [];
  for (const [key, e] of byKey) {
    const nodes = model.nodes.filter((n) => e.ids.includes(n.id));
    const starts = nodes.map((n) => n.detail.startedAt).filter((x): x is number => !!x);
    const ends = nodes.map((n) => n.detail.endedAt ?? (n.detail.startedAt ? endAt : null)).filter((x): x is number => !!x);
    const agents = model.nodes.filter((n) => n.kind === "agent" && n.parentId && e.ids.includes(n.parentId) && n.detail.startedAt).length;
    const label = agents ? `${e.label} · ${agents} ${agents === 1 ? "agent" : "agents"}` : e.label;
    const state = nodes.some((n) => n.state === "failed") ? "failed" : starts.length ? "done" : "pending";
    out.push({ id: key, label, state, ms: starts.length ? Math.max(...ends) - Math.min(...starts) : null, start: starts.length ? Math.min(...starts) : Number.MAX_SAFE_INTEGER });
  }
  for (const r of timelineRows(model, events, endAt)) if (r.kind === "waiting") out.push({ id: r.id, label: "Waiting for you", state: "waiting", ms: r.end - r.start, start: r.start });
  return out.sort((a, b) => a.start - b.start);
}

export function HowItWent({ brief, model, events, endAt, onReplay, onTranscript }: { brief: string; model: WorkflowGraphModel; events: RunEvent[]; endAt: number; onReplay(): void; onTranscript(): void }) {
  const segs = segmentsOf(model, events, endAt);
  return (
    <section data-testid="how-it-went">
      <h2>How it went</h2>
      <div className="desc">You asked: “{brief || "(no brief)"}”</div>
      {segs.length ? (
        <div className="strip">
          {segs.map((s) => (
            <div key={s.id} className={`seg ${s.state}`} data-testid="segment">
              <span>{s.label}</span>
              <span className="d">{s.ms === null ? "not run" : formatDuration(s.ms)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" type="button" onClick={onReplay}>
          Replay
        </button>
        <button className="btn ghost" type="button" onClick={onTranscript}>
          Transcript
        </button>
      </div>
    </section>
  );
}
