import type { RunEvent } from "../../../src/shared/events";
import { formatDuration } from "../../../src/shared/format";
import type { WorkflowGraphModel } from "../../../src/shared/graph/types";
import { timelineRows } from "../lib/timeline";
import { ReplayIcon, TranscriptIcon } from "./icons";
import "./past-run.css";

export interface Segment {
  id: string;
  label: string;
  agents: number;
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
    const state = nodes.some((n) => n.state === "failed") ? "failed" : starts.length ? "done" : "pending";
    out.push({ id: key, label: e.label, agents, state, ms: starts.length ? Math.max(...ends) - Math.min(...starts) : null, start: starts.length ? Math.min(...starts) : Number.MAX_SAFE_INTEGER });
  }
  for (const r of timelineRows(model, events, endAt)) if (r.kind === "waiting") out.push({ id: r.id, label: "Waiting for you", agents: 0, state: "waiting", ms: r.end - r.start, start: r.start });
  return out.sort((a, b) => a.start - b.start);
}

export function HowItWent({ model, events, endAt, onReplay, onTranscript }: { model: WorkflowGraphModel; events: RunEvent[]; endAt: number; onReplay(): void; onTranscript(): void }) {
  const segs = segmentsOf(model, events, endAt);
  const longest = Math.max(1, ...segs.map((s) => s.ms ?? 0));
  return (
    <section className="card" data-testid="how-it-went">
      <header className="card-h">
        <h3>How it went</h3>
        <div className="card-actions">
          <button className="btn sm" type="button" onClick={onReplay}>
            <ReplayIcon size={13} />
            Replay
          </button>
          <button className="btn sm" type="button" onClick={onTranscript}>
            <TranscriptIcon size={13} />
            Transcript
          </button>
        </div>
      </header>
      {segs.length ? (
        <ol className="hw-steps-list">
          {segs.map((s) => (
            <li key={s.id} className={`hw-srow ${s.state}`} data-testid="segment">
              <i className="hw-sdot" />
              <div className="hw-sbody">
                <div className="hw-sline">
                  <span className="hw-sl">{s.label}</span>
                  <span className="hw-sd">{s.ms === null ? "not run" : formatDuration(s.ms)}</span>
                </div>
                {s.agents ? <div className="hw-smeta">{s.agents} {s.agents === 1 ? "agent" : "agents"}</div> : null}
                <div className="hw-sbar">
                  <i style={{ width: `${s.ms ? Math.max(3, (s.ms / longest) * 100) : 0}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="quiet">No steps were recorded.</div>
      )}
    </section>
  );
}
