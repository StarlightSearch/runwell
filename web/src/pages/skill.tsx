import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { WorkflowSource } from "../../../src/shared/api";
import type { OverviewStep } from "../../../src/shared/graph/source-types";
import { formatAgo } from "../../../src/shared/format";
import type { RunRow } from "../../../src/server/runs";
import type { SkillListItem } from "../../../src/server/skills";
import { Empty } from "../components/empty";
import { GraphCanvas } from "../components/graph/graph-canvas";
import { useGraph } from "../components/graph/use-graph";
import { PageHeader } from "../components/page-header";
import { RunsTable } from "../components/runs-table";
import { SourceTag } from "../components/source-tag";
import { ApiError, post } from "../lib/api";
import { useRunDialog } from "../lib/run-dialog-context";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "../components/graph/graph.css";
import "./skill.css";

const NO_EVENTS: never[] = [];
const findStep = (steps: OverviewStep[], id: string): OverviewStep | null => {
  for (const s of steps) {
    if (s.id === id) return s;
    const c = s.children ? findStep(s.children, id) : null;
    if (c) return c;
  }
  return null;
};

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth - 40)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function SkillPage() {
  const key = decodeURIComponent(useParams().key ?? "");
  const skills = useResource<{ skills: SkillListItem[] }>("/api/skills");
  const wf = useResource<WorkflowSource>(key ? `/api/skills/${encodeURIComponent(key)}/workflow` : null);
  const runs = useResource<{ runs: RunRow[] }>(key ? `/api/runs?limit=500&skill=${encodeURIComponent(key)}` : null);
  useStream("runs", useCallback(() => runs.reload(), [runs.reload]));
  const { openRunDialog } = useRunDialog();
  const [selected, setSelected] = useState<string | null>(null);
  // The tab is in the address (?tab=runs), so a reload or a shared link keeps it.
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "runs" ? "runs" : "how";
  const setTab = (t: "how" | "runs") => setParams(t === "runs" ? { tab: "runs" } : {}, { replace: true });
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [wrapRef, width] = useWidth();
  const steps = wf.data?.steps ?? null;
  // Drawn as a run that has not started yet, so every step reads "Not started", not "Not run".
  const { model, layout } = useGraph(NO_EVENTS, steps, true, width);
  const skill = skills.data?.skills.find((s) => s.key === key) ?? null;
  const all = runs.data?.runs ?? [];
  const step = useMemo(() => (steps && selected ? findStep(steps, selected) : null), [steps, selected]);
  const node = model.nodes.find((n) => n.id === selected) ?? null;

  const draw = async () => {
    setDrawing(true);
    setDrawError(null);
    try {
      await post(`/api/skills/${encodeURIComponent(key)}/draw`);
      wf.reload();
    } catch (e) {
      setDrawError((e as ApiError).message);
    } finally {
      setDrawing(false);
    }
  };

  if (skills.data && !skill) {
    return (
      <div className="page">
        <Empty title="This skill is not installed any more.">Its past runs are still under Runs.</Empty>
      </div>
    );
  }
  if (!skill) return null;
  const last = all[0];
  return (
    <>
      <PageHeader
        actions={
          <button className="btn primary" type="button" onClick={() => openRunDialog(skill.key)}>
            ▶ Run
          </button>
        }
      >
        <span className="crumb">
          <Link to="/skills">Skills</Link> / <b>{skill.name}</b>
        </span>
        <SourceTag skill={skill} />
        {skill.ignored ? <span className="tag">ignored</span> : null}
      </PageHeader>
      <div className="page skill-page">
        <div className="skill-head">
          <p className="desc">{skill.description || skill.warning || ""}</p>
          <div className="stats" data-testid="skill-stats">
            <span>
              <b>{skill.runCount}</b> {skill.runCount === 1 ? "run" : "runs"}
            </span>
            <span>{skill.rated ? <><b>{Math.round((skill.up / skill.rated) * 100)}%</b> 👍 of {skill.rated} rated</> : "no ratings yet"}</span>
            <span>{last ? `last run ${formatAgo(last.startedAt ?? last.createdAt, Date.now())}` : "never run"}</span>
            <span className="mono">v{skill.version}</span>
          </div>
        </div>

        <div className="tabs skill-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "how"} className={`tab${tab === "how" ? " on" : ""}`} onClick={() => setTab("how")}>
            How it works
          </button>
          <button type="button" role="tab" aria-selected={tab === "runs"} className={`tab${tab === "runs" ? " on" : ""}`} onClick={() => setTab("runs")}>
            Runs · {all.length}
          </button>
        </div>

        {tab === "how" ? (
        <section>
          {wf.data?.note ? <div className="note-line">{wf.data.note}</div> : null}
          {steps && steps.length ? (
            <div className="skill-graph">
              <div className="canvas-wrap" ref={wrapRef} data-testid="skill-graph">
                <div className="canvas-inner">
                  <GraphCanvas model={model} layout={layout} selectedId={selected} onSelect={setSelected} askNodeIds={new Set()} />
                </div>
              </div>
              <aside className="panel">
                <div className="pb">
                  {node ? (
                    <>
                      <h3>{node.label}</h3>
                      {node.role ? <div className="desc">{node.role}</div> : null}
                      <p className="desc" style={{ whiteSpace: "pre-wrap" }} data-testid="step-detail">
                        {step?.detail || (node.kind === "agent" ? "An agent this step starts." : "")}
                      </p>
                      {step?.maxPasses ? <div className="desc">Repeats up to {step.maxPasses} times.</div> : null}
                      {step?.branches?.length ? (
                        <ul className="desc">
                          {step.branches.map((b) => (
                            <li key={b.when}>
                              If {b.when}: {b.then}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <div className="desc">Select a step to see what it does.</div>
                  )}
                </div>
              </aside>
            </div>
          ) : wf.data ? (
            <div className="nograph" data-testid="no-workflow">
              <p className="desc">This skill has no workflow map yet. Claude can read it and draw its steps. That uses your Claude Code usage, and takes about a minute.</p>
              <button className="btn" type="button" disabled={drawing} onClick={() => void draw()}>
                {drawing ? "Drawing…" : "Draw the workflow"}
              </button>
              {drawError ? <div className="err">{drawError}</div> : null}
            </div>
          ) : null}
        </section>
        ) : (
        <section>
          {!runs.data ? null : all.length ? (
            <RunsTable runs={all} showSkill={false} />
          ) : (
            <Empty title="No runs yet.">Press Run to start one, or use this skill in a chat.</Empty>
          )}
        </section>
        )}
      </div>
    </>
  );
}
