import { useParams } from "react-router-dom";
import type { RunRow } from "../../../src/server/runs";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import { useResource } from "../lib/use-resource";

export function RunPage() {
  const { id } = useParams();
  const res = useResource<{ run: RunRow }>(id ? `/api/runs/${id}` : null);
  const run = res.data?.run;
  return (
    <>
      <PageHeader>
        <span className="crumb">Runs / {run ? `${run.skillRef} / ` : ""}<b>{run ? `#${run.n}` : ""}</b></span>
        {run ? <StatusPill status={run.status} /> : null}
      </PageHeader>
      <div className="page" />
    </>
  );
}
