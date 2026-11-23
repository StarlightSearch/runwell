import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { WorkflowSource } from "../../../src/shared/api";
import type { Ask } from "../../../src/shared/events";
import { formatDateTime, formatDuration } from "../../../src/shared/format";
import { askNodeId } from "../../../src/shared/graph/from-events";
import type { RunRow } from "../../../src/server/runs";
import type { SkillRow } from "../../../src/server/skills";
import { AskCard } from "../components/ask-card";
import { ContinueMenu } from "../components/continue-menu";
import type { ResumeInfo } from "../../../src/server/continue";
import { Delivered } from "../components/delivered";
import { HowItWent } from "../components/how-it-went";
import { RatingCard } from "../components/rating-card";
import { Replay } from "../components/replay";
import { GraphCanvas } from "../components/graph/graph-canvas";
import { useGraph } from "../components/graph/use-graph";
import { NodePanel } from "../components/node-panel";
import { OutputList } from "../components/output-list";
import type { OutputItem } from "../components/output-preview";
import { Timeline } from "../components/timeline";
import { Transcript } from "../components/transcript";
import { PageHeader } from "../components/page-header";
import { ProgressLine } from "../components/progress-line";
import { StatusPill } from "../components/status-pill";
import { del, post } from "../lib/api";
import { useRunDialog } from "../lib/run-dialog-context";
import "../components/past-run.css";
import { useEvents } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "../components/graph/graph.css";

export interface RunDetail {
  run: RunRow;
  skill: SkillRow | null;
  workflow: WorkflowSource;
  asks: Ask[];
  grant: string;
  resume: ResumeInfo | null;
}

const LIVE = new Set(["queued", "running", "waiting"]);
const base = (p: string | null) => (p ?? "").split("/").filter(Boolean).pop() ?? "";

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth - 52)));
    ro.observe(el);
    setW(Math.max(320, el.clientWidth - 52));
    return () => ro.disconnect();
  });
  return [ref, w];
}

export function placeLine(run: RunRow, skill: SkillRow | null, past = false): string {
  const parts: string[] = past ? [formatDateTime(run.startedAt ?? run.createdAt)] : [];
  if (run.kind === "history") parts.push(`from chat in ${base(run.projectPath) || "a folder"}`);
  else parts.push("from Run button", run.place === "project" ? `in ${base(run.projectPath)}` : "new run folder");
  parts.push(`v${run.skillVersion ?? skill?.version ?? 1}`);
  if (run.allowAll) parts.push("everything allowed");
  else if (run.mode === "auto") parts.push("auto mode");
  else if (run.mode === "ask") parts.push("asks first");
  return parts.join(" · ");
}

export function RunPage() {
  const { id } = useParams();
  const detail = useResource<RunDetail>(id ? `/api/runs/${id}` : null);
  const outs = useResource<{ outputs: OutputItem[]; grant: string }>(id ? `/api/runs/${id}/outputs` : null);
  const { events, ended } = useEvents(id);
  const [tabChoice, setTab] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [folderNote, setFolderNote] = useState<string | null>(null);
  const navigate = useNavigate();
  const { openRunDialog } = useRunDialog();
  const [selected, setSelected] = useState<string | null>(null);
  const [noteHidden, setNoteHidden] = useState(false);
  const [answered, setAnswered] = useState<{ id: string; line: string }[]>([]);
  const [wrapRef, width] = useWidth();

  // Status lives on the run row; refresh it when a status or ask event arrives.
  const lastStatusCount = useRef(0);
  useEffect(() => {
    const n = events.filter((e) => e.t === "status" || e.t === "ask" || e.t === "ask.done").length;
    if (n !== lastStatusCount.current) {
      lastStatusCount.current = n;
      detail.reload();
    }
  }, [events, detail.reload]);
  useEffect(() => {
    if (ended) (detail.reload(), outs.reload());
  }, [ended, detail.reload, outs.reload]);
  useEffect(() => {
    if (tabChoice === "outputs") outs.reload();
  }, [tabChoice, outs.reload]);

  const d = detail.data;
  const run = d?.run;
  const live = run ? LIVE.has(run.status) : false;
  const tab = tabChoice ?? (run && !live ? "run" : "graph");
  const now = useNow(live);
  const { model, layout } = useGraph(events, d?.workflow.steps ?? null, live, width, replay ?? undefined);
  const full = useGraph(events, d?.workflow.steps ?? null, live, width);
  const askIds = useMemo(() => new Set((d?.asks ?? []).map((a) => askNodeId(model, a, events)).filter((x): x is string => !!x)), [d?.asks, model, events]);

  // Default selection: the node holding an open ask, else the running one, else the first.
  const fallback = [...askIds][0] ?? model.nodes.filter((n) => n.state === "running").at(-1)?.id ?? model.order[0] ?? null;
  const selId = selected && model.nodes.some((n) => n.id === selected) ? selected : fallback;
  const node = model.nodes.find((n) => n.id === selId) ?? null;

  // The tab title counts open cards.
  const askCount = d?.asks.length ?? 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = askCount ? `(${askCount}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, "");
    };
  }, [askCount]);

  const remove = useCallback(async () => {
    setMenu(false);
    if (!run || !window.confirm(`Delete run #${run.n}? Its trace and kept files are removed. Files in your folders are not touched.`)) return;
    await del(`/api/runs/${run.id}`);
    navigate("/runs");
  }, [run, navigate]);

  const stop = useCallback(async () => {
    if (!run || !window.confirm("Stop this run?")) return;
    await post(`/api/runs/${run.id}/stop`);
    detail.reload();
  }, [run, detail]);

  if (detail.error?.status === 404) return <div className="page"><div className="err">That run does not exist any more.</div></div>;
  if (!run || !d) return null;

  const started = run.startedAt ?? run.createdAt;
  const elapsed = (run.endedAt ?? now) - started;
  const outputList = outs.data?.outputs ?? [];
  const tabs: { id: string; label: string; render(): ReactNode }[] = [
    ...(live
      ? []
      : [
          {
            id: "run",
            label: "Run",
            render: () => (
              <div className="past">
                {run.status === "failed" && run.error ? <div className="err errbox" data-testid="run-error">{run.error}</div> : null}
                <Delivered outputs={outputList} grant={outs.data?.grant ?? d.grant} />
                <RatingCard run={run} onSaved={() => detail.reload()} />
                <HowItWent
                  brief={run.brief}
                  model={full.model}
                  events={events}
                  endAt={run.endedAt ?? now}
                  onReplay={() => (setReplay(0), setTab("graph"))}
                  onTranscript={() => setTab("transcript")}
                />
              </div>
            ),
          },
        ]),
    { id: "graph", label: "Graph", render: () => null },
    { id: "timeline", label: "Timeline", render: () => <Timeline model={model} events={events} start={started} end={run.endedAt ?? now} /> },
    { id: "transcript", label: "Transcript", render: () => <Transcript events={events} runBrief={run.brief} /> },
    { id: "outputs", label: `Outputs · ${outputList.length}`, render: () => <OutputList outputs={outputList} grant={outs.data?.grant ?? d.grant} /> },
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <span className="menu-wrap">
              <button
                className="btn ghost"
                type="button"
                title={run.place === "folder" ? "Open this run's folder" : "Open the folder this run worked in"}
                onClick={() =>
                  void post(`/api/runs/${run.id}/reveal`).then(
                    () => setFolderNote(null),
                    (e: Error) => setFolderNote(e.message),
                  )
                }
              >
                Open folder
              </button>
              {folderNote ? (
                <span className="continue-note bad" role="status" data-testid="folder-note">
                  {folderNote}
                </span>
              ) : null}
            </span>
            {!live && d.resume ? <ContinueMenu runId={run.id} resume={d.resume} /> : null}
            {!live && d.skill ? (
              <button className="btn primary" type="button" onClick={() => openRunDialog(run.skillKey, { fromRun: run.id })}>
                Run again
              </button>
            ) : null}
            {!live ? (
              <span className="menu-wrap">
                <button className="btn ghost" type="button" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                  ⋯
                </button>
                {menu ? (
                  <div className="menu" role="menu">
                    <button type="button" role="menuitem" className="danger" onClick={() => void remove()}>
                      Delete run
                    </button>
                  </div>
                ) : null}
              </span>
            ) : null}
            {live ? (
              <button className="btn" type="button" onClick={() => void stop()}>
                Stop
              </button>
            ) : null}
          </>
        }
      >
        <span className="crumb">
          <Link to="/runs">Runs</Link> / {d.skill ? <Link to={`/skills/${encodeURIComponent(run.skillKey)}`}>{run.skillRef}</Link> : run.skillRef} / <b>#{run.n}</b>
        </span>
        <StatusPill status={run.status} suffix={formatDuration(elapsed)} />
        {!d.skill ? <span className="src" data-testid="not-installed">not installed</span> : null}
        <span className="crumb mono" data-testid="place-line">{placeLine(run, d.skill, !live)}</span>
      </PageHeader>
      {d.asks.length ? (
        <div className="waiting-bar" data-testid="waiting-bar">
          Waiting for you: {d.asks.length} {d.asks.length === 1 ? (d.asks[0]!.kind === "question" ? "question" : "permission") : "cards"}
          <button className="btn" type="button" onClick={() => (setTab("graph"), setSelected([...askIds][0] ?? null))}>
            Show
          </button>
        </div>
      ) : null}
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "graph" ? (
        <div className="run-body">
          <div className="canvas-wrap" ref={wrapRef}>
            <div className="canvas-inner">
              {replay !== null ? <Replay total={events.length} at={replay} onChange={setReplay} onClose={() => setReplay(null)} /> : null}
              {run.status === "failed" && run.error && replay === null ? <div className="err errbox" data-testid="run-error">{run.error}</div> : null}
              {d.workflow.note && !noteHidden ? (
                <div className="note-line">
                  {d.workflow.note}
                  <button type="button" aria-label="Dismiss" onClick={() => setNoteHidden(true)}>
                    ×
                  </button>
                </div>
              ) : null}
              <ProgressLine header={model.header} />
              <GraphCanvas model={model} layout={layout} selectedId={selId} onSelect={setSelected} askNodeIds={askIds} />
            </div>
          </div>
          <NodePanel
            node={node}
            model={model}
            runStart={started}
            now={now}
            askSlot={[
              ...answered.map((a) => (
                <div key={`done-${a.id}`} className="ask-done" data-testid="ask-done">
                  {a.line}
                </div>
              )),
              ...d.asks
              .filter((a) => {
                const at = askNodeId(model, a, events);
                return at === selId || at === null;
              })
              .map((a) => (
                <AskCard
                  key={a.id}
                  runId={run.id}
                  ask={a}
                  onAnswered={(line) => {
                    setAnswered((l) => [...l.filter((x) => x.id !== a.id), { id: a.id, line }]);
                    detail.reload();
                  }}
                />
              )),
            ]}
          />
        </div>
      ) : (
        <div className="page">{tabs.find((t) => t.id === tab)?.render()}</div>
      )}
    </>
  );
}
