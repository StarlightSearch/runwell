import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatAgo, formatDateTime, formatDuration } from "../../../src/shared/format";
import type { RunRow } from "../../../src/server/runs";
import { Empty } from "../components/empty";
import { FilterChips } from "../components/filter-chips";
import { PageHeader } from "../components/page-header";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "./skills.css";
import "./lists.css";

const LIVE = new Set(["queued", "running", "waiting"]);
const base = (p: string | null) => (p ?? "").split("/").filter(Boolean).pop() ?? "";
const FILTERS: Record<string, (r: RunRow) => boolean> = {
  all: () => true,
  live: (r) => LIVE.has(r.status),
  finished: (r) => r.status === "finished",
  failed: (r) => r.status === "failed",
  chat: (r) => r.kind === "history",
};

export function whereOf(r: RunRow): string {
  if (r.kind === "history") return `chat in ${base(r.projectPath ?? r.cwd) || "a folder"}`;
  return r.place === "project" ? base(r.projectPath) : "run folder";
}

export function RunsPage() {
  const [params, setParams] = useSearchParams();
  const skill = params.get("skill");
  const runs = useResource<{ runs: RunRow[] }>(`/api/runs?limit=500${skill ? `&skill=${encodeURIComponent(skill)}` : ""}`);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();
  useStream("runs", useCallback(() => runs.reload(), [runs.reload]));
  const all = runs.data?.runs ?? [];
  const shown = useMemo(() => all.filter(FILTERS[filter]!), [all, filter]);
  const now = Date.now();
  const chips = [
    { id: "all", label: "All", count: all.length },
    { id: "live", label: "Live", count: all.filter(FILTERS.live!).length },
    { id: "finished", label: "Finished" },
    { id: "failed", label: "Failed" },
    { id: "chat", label: "From chat" },
  ];
  return (
    <>
      <PageHeader>
        <span className="crumb">
          <b>Runs</b>
          {skill ? <> / {skill.split(":").pop()}</> : null}
        </span>
      </PageHeader>
      <div className="page">
        <FilterChips
          chips={chips}
          value={filter}
          onChange={setFilter}
          extra={
            skill ? (
              <button type="button" className="f" onClick={() => (params.delete("skill"), setParams(params))}>
                {skill.split(":").pop()} ×
              </button>
            ) : null
          }
        />
        {!runs.data ? null : !shown.length ? (
          <Empty title={all.length ? "No runs match this filter." : "No runs yet."}>{all.length ? null : "Press Run on a skill, or use a skill in a chat, and it shows up here."}</Empty>
        ) : (
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
              {shown.map((r) => {
                const started = r.startedAt ?? r.createdAt;
                return (
                  <tr key={r.id} className="clickable" data-testid="run-row" data-status={r.status} onClick={() => navigate(`/runs/${r.id}`)}>
                    <td>
                      <span className={`dot ${r.status}`} aria-label={r.status} /> <b>{r.skillRef}</b> #{r.n}
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
        )}
      </div>
    </>
  );
}
