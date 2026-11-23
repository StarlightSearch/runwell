import { useMemo, useState, type ReactNode } from "react";
import type { RunEvent } from "../../../src/shared/events";
import { SUBAGENT_TOOLS } from "../../../src/shared/graph/from-events";
import "./tabs.css";

const WINDOW = 200;
const brief = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
};
const toolLine = (name: string, input: Record<string, unknown>) => {
  const key = ["file_path", "command", "pattern", "url", "description", "path", "query"].find((k) => typeof input[k] === "string");
  return key ? `${name} · ${brief(input[key])}` : name;
};

type Item = { key: string; agentId: string | null; node: ReactNode };

/** The run as a reading: the brief, then what the lead and its agents said and did, in order. */
export function Transcript({ events, runBrief }: { events: RunEvent[]; runBrief: string }) {
  const [shown, setShown] = useState(WINDOW);
  const items = useMemo(() => {
    const ends = new Map<string, Extract<RunEvent, { t: "tool.end" }>>();
    const agentOf = new Map<string, string | null>();
    for (const e of events) {
      if (e.t === "tool.end") ends.set(e.id, e);
      if (e.t === "tool.start") agentOf.set(e.id, e.agentId);
    }
    const out: Item[] = [];
    events.forEach((e, i) => {
      const key = String(i);
      if (e.t === "text") out.push({ key, agentId: e.agentId, node: <p>{e.text}</p> });
      else if (e.t === "tool.start") {
        const end = ends.get(e.id);
        const label = SUBAGENT_TOOLS.has(e.name) ? `Agent · ${brief(e.input.description ?? e.input.subagent_type ?? "")}` : toolLine(e.name, e.input);
        out.push({
          key,
          agentId: e.agentId,
          node: (
            <details data-testid="tool-row">
              <summary>
                <span className={end && !end.ok ? "bad" : ""}>{end ? (end.ok ? "✓" : "✗") : "…"}</span>
                <span className="mono">{label}</span>
              </summary>
              <pre className="mono">{JSON.stringify(e.input, null, 2)}</pre>
              {end ? <pre className="mono">{end.result || "(no output)"}</pre> : null}
            </details>
          ),
        });
      } else if (e.t === "step") {
        if (e.status === "started" || e.status === "failed") out.push({ key, agentId: null, node: <div className="divider">Step {e.status}: {e.stepId}{e.note ? ` · ${e.note}` : ""}</div> });
      } else if (e.t === "ask") {
        const q = e.ask.kind === "question" ? e.ask.questions.map((x) => x.question).join(" ") : `Allow ${e.ask.tool}?`;
        out.push({ key, agentId: e.ask.agentId, node: <div className="askline">Asked: {q}</div> });
      } else if (e.t === "ask.done") {
        const a = e.answer;
        const line = !a ? "Closed without an answer" : a.kind === "permission" ? (a.allow ? "Allowed" : "Denied") : Object.values(a.answers).join(", ");
        out.push({ key, agentId: null, node: <div className="askline">Answered: {line}</div> });
      } else if (e.t === "result" && !e.ok && e.error) out.push({ key, agentId: null, node: <div className="err">{e.error}</div> });
    });
    return out;
  }, [events]);
  const from = Math.max(0, items.length - shown);
  return (
    <div className="tx" data-testid="transcript">
      {from === 0 ? (
        <div className="brief" data-testid="transcript-brief">
          <div className="desc">Brief</div>
          <p>{runBrief || "(no brief)"}</p>
        </div>
      ) : (
        <button className="btn ghost" type="button" onClick={() => setShown((n) => n + WINDOW)}>
          Show earlier
        </button>
      )}
      {items.slice(from).map((it) => (
        <div key={it.key} className={it.agentId ? "agentwrap" : undefined}>
          {it.node}
        </div>
      ))}
    </div>
  );
}
