import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatAgo, formatDateTime, formatDuration } from "../../../src/shared/format";
import type { RunRow } from "../../../src/server/runs";
import { dialogOpen, isTyping } from "../lib/keys";
import "../pages/skills.css";
import "../pages/lists.css";

const LIVE = new Set(["queued", "running", "waiting"]);
/** Only runs that need a look are labelled; a finished run is plain. */
const STATE: Record<string, string> = { queued: "queued", running: "running", waiting: "waiting for you", failed: "failed", stopped: "stopped" };
const base = (p: string | null) => (p ?? "").split("/").filter(Boolean).pop() ?? "";

export function whereOf(r: RunRow): string {
  if (r.kind === "history") return `chat in ${base(r.projectPath ?? r.cwd) || "a folder"}`;
  return r.place === "project" ? base(r.projectPath) : "run folder";
}

/** Runs newest first; a row opens its run. ↑/↓ and Enter move and open (when `keys`). */
export function RunsTable({ runs, keys = true, showSkill = true }: { runs: RunRow[]; keys?: boolean; showSkill?: boolean }) {
  const navigate = useNavigate();
  const [focus, setFocus] = useState(-1);
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || dialogOpen() || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowDown") (e.preventDefault(), setFocus((f) => Math.min(f + 1, runs.length - 1)));
      else if (e.key === "ArrowUp") (e.preventDefault(), setFocus((f) => Math.max(f - 1, 0)));
      else if (e.key === "Enter" && runs[focus]) (e.preventDefault(), navigate(`/runs/${runs[focus]!.id}`));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runs, focus, navigate, keys]);
  const now = Date.now();
  return (
    <table className="tbl" data-testid="runs-table">
      <thead>
        <tr>
          <th>Run</th>
          <th>Brief</th>
          <th>Where</th>
          <th>Started</th>
          <th>Took</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r, i) => {
          const started = r.startedAt ?? r.createdAt;
          return (
            <tr key={r.id} className={`clickable${i === focus ? " focused" : ""}`} data-testid="run-row" data-status={r.status} onClick={() => navigate(`/runs/${r.id}`)}>
              <td>
                {showSkill ? <b>{r.skillRef}</b> : null} <span className="run-n">#{r.n}</span>
                {r.status !== "finished" ? <span className={`run-state ${r.status}`}>{STATE[r.status]}</span> : null}
              </td>
              <td className="brief-cell">{r.brief || <span className="desc">(no brief)</span>}</td>
              <td className="desc">{whereOf(r)}</td>
              <td className="desc" title={formatDateTime(started)}>
                {formatAgo(started, now)}
              </td>
              <td className="mono desc">{r.endedAt ? formatDuration(r.endedAt - started) : LIVE.has(r.status) ? "running" : ""}</td>
              <td>{r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
