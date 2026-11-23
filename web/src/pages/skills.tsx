import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SkillListItem } from "../../../src/server/skills";
import { formatAgo } from "../../../src/shared/format";
import { Empty } from "../components/empty";
import { FilterChips, type Chip } from "../components/filter-chips";
import { PageHeader } from "../components/page-header";
import { SourceTag } from "../components/source-tag";
import { Sparkline } from "../components/sparkline";
import { post } from "../lib/api";
import { useRunDialog } from "../lib/run-dialog-context";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "./skills.css";

const HUES = ["var(--blue)", "var(--violet)", "var(--green)", "var(--amber)", "var(--red)"];
const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]!;
const folderName = (p: string | null) => (p ?? "").split("/").filter(Boolean).pop() ?? "";

function Rating({ s }: { s: SkillListItem }) {
  if (!s.rated) return <span className="desc">no ratings</span>;
  const pct = Math.round((s.up / s.rated) * 100);
  return (
    <span>
      <span className={pct >= 70 ? "rate-up" : pct >= 40 ? "rate-mid" : "rate-down"}>{pct}%</span> <span className="desc">of {s.rated}</span>
    </span>
  );
}

function LastRun({ s }: { s: SkillListItem }) {
  if (s.liveRunId) return <Link className="live-link" to={`/runs/${s.liveRunId}`}>running now</Link>;
  if (!s.lastRunAt) return <span className="desc">never</span>;
  return <span className="desc">{formatAgo(s.lastRunAt, Date.now())}</span>;
}

function RowMenu({ s, onToggle }: { s: SkillListItem; onToggle(): void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <>
      <button className="btn ghost" type="button" aria-label={`More for ${s.ref}`} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
        ⋯
      </button>
      {open ? (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={onToggle}>
            {s.ignored ? "Track this skill" : "Don't track"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SkillsPage() {
  const res = useResource<{ skills: SkillListItem[] }>("/api/skills");
  const [params, setParams] = useSearchParams();
  const [hideIgnored, setHideIgnored] = useState(true);
  const [focus, setFocus] = useState(0);
  const { openRunDialog } = useRunDialog();
  useStream("skills", useCallback(() => res.reload(), [res.reload]));
  useStream("runs", useCallback(() => res.reload(), [res.reload]));

  const filter = params.get("filter") ?? (params.get("project") ? `project:${params.get("project")}` : "all");
  const all = res.data?.skills ?? [];
  const projects = [...new Set(all.filter((s) => s.projectPath).map((s) => s.projectPath!))];
  const chips: Chip[] = [
    { id: "all", label: "All", count: all.length },
    { id: "personal", label: "Personal", count: all.filter((s) => s.source === "personal").length },
    { id: "plugin", label: "Plugins", count: all.filter((s) => s.source === "plugin").length },
    ...projects.map((p) => ({ id: `project:${p}`, label: `Project: ${folderName(p)}`, count: all.filter((s) => s.projectPath === p).length })),
    { id: "workflow", label: "With workflow", count: all.filter((s) => s.hasWorkflow).length },
  ];
  const shown = useMemo(
    () =>
      all
        .filter((s) =>
          filter === "all" ? true : filter === "personal" || filter === "plugin" ? s.source === filter : filter === "workflow" ? s.hasWorkflow : s.projectPath === filter.slice(8),
        )
        .filter((s) => !(hideIgnored && s.ignored))
        .sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || a.name.localeCompare(b.name)),
    [all, filter, hideIgnored],
  );

  // R opens the Run dialog for the focused row; arrows move the focus (Task 37 adds the rest).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowDown") (setFocus((f) => Math.min(f + 1, shown.length - 1)), e.preventDefault());
      else if (e.key === "ArrowUp") (setFocus((f) => Math.max(f - 1, 0)), e.preventDefault());
      else if ((e.key === "r" || e.key === "R" || e.key === "Enter") && !e.metaKey && !e.ctrlKey && shown[focus]) {
        e.preventDefault();
        openRunDialog(shown[focus]!.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, focus, openRunDialog]);

  const toggle = async (s: SkillListItem) => {
    await post(`/api/skills/${encodeURIComponent(s.key)}/ignore`, { ignored: !s.ignored });
    res.reload();
  };

  return (
    <>
      <PageHeader
        actions={
          <button className="btn primary" type="button" onClick={() => shown[focus] && openRunDialog(shown[focus]!.key)} disabled={!shown.length}>
            ▶ Run a skill <span className="kbd" style={{ borderColor: "transparent", color: "inherit", opacity: 0.6 }}>R</span>
          </button>
        }
      >
        <span className="crumb">
          <b>Skills</b>
        </span>
      </PageHeader>
      <div className="page">
        <FilterChips
          chips={chips}
          value={filter}
          onChange={(id) => setParams(id === "all" ? {} : { filter: id })}
          extra={
            <label className="toggle-line">
              <input type="checkbox" checked={hideIgnored} onChange={(e) => setHideIgnored(e.target.checked)} /> Hide ignored
            </label>
          }
        />
        {res.data && !all.length ? (
          <Empty title="No skills found">Runwell looks in ~/.claude/skills, your plugins and your projects' .claude/skills folders.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Source</th>
                <th>Runs (14 days)</th>
                <th>Rating</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => (
                <tr key={s.key} className={`${s.ignored ? "ignored" : ""} ${i === focus ? "focused" : ""}`} data-skill={s.ref} onMouseEnter={() => setFocus(i)}>
                  <td>
                    <div className="sname">
                      <div className="sic" style={{ background: `color-mix(in srgb, ${hue(s.name)} 15%, transparent)`, color: hue(s.name) }}>
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="nm">
                          {s.name}
                          {s.warning ? (
                            <span className="warn-mark" title={s.warning} aria-label={s.warning}>
                              !
                            </span>
                          ) : null}
                          {s.ignored ? <span className="tag">ignored</span> : null}
                          {s.hasWorkflow ? <span className="tag" title="This skill has a workflow map">workflow</span> : null}
                        </div>
                        <div className="ds">{s.description || (s.warning ? s.warning : "")}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <SourceTag skill={s} />
                  </td>
                  <td>
                    <Sparkline values={s.runs14} />
                  </td>
                  <td>
                    <Rating s={s} />
                  </td>
                  <td>
                    <LastRun s={s} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn" type="button" onClick={() => openRunDialog(s.key)}>
                        Run
                      </button>
                      <RowMenu s={s} onToggle={() => void toggle(s)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
