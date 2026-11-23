import { useCallback, useMemo, useState } from "react";
import { RunsTable } from "../components/runs-table";
import { useSearchParams } from "react-router-dom";
import type { RunRow } from "../../../src/server/runs";
import { Empty } from "../components/empty";
import { FilterChips } from "../components/filter-chips";
import { PageHeader } from "../components/page-header";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "./skills.css";
import "./lists.css";

const LIVE = new Set(["queued", "running", "waiting"]);
const FILTERS: Record<string, (r: RunRow) => boolean> = {
  all: () => true,
  live: (r) => LIVE.has(r.status),
  finished: (r) => r.status === "finished",
  failed: (r) => r.status === "failed",
  chat: (r) => r.kind === "history",
};


export function RunsPage() {
  const [params, setParams] = useSearchParams();
  const skill = params.get("skill");
  const runs = useResource<{ runs: RunRow[] }>(`/api/runs?limit=500${skill ? `&skill=${encodeURIComponent(skill)}` : ""}`);
  const [filter, setFilter] = useState("all");
  useStream("runs", useCallback(() => runs.reload(), [runs.reload]));
  const all = runs.data?.runs ?? [];
  const shown = useMemo(() => all.filter(FILTERS[filter]!), [all, filter]);

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
          <RunsTable runs={shown} />
        )}
      </div>
    </>
  );
}
