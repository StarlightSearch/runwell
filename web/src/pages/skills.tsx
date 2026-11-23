import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { SkillListItem } from "../../../src/server/skills";
import { formatAgo } from "../../../src/shared/format";
import { Empty } from "../components/empty";
import { FilterChips, type Chip } from "../components/filter-chips";
import { dialogOpen, isTyping } from "../lib/keys";
import { PageHeader } from "../components/page-header";
import { SourceTag } from "../components/source-tag";
import { Sparkline } from "../components/sparkline";
import { patch, post } from "../lib/api";
import { marketplacePattern, pluginPattern } from "../../../src/shared/ignore";
import { useRunDialog } from "../lib/run-dialog-context";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "./skills.css";
import { pickSkill } from "../lib/run-dialog-context";
import { projectColor } from "../lib/colors";

const folderName = (p: string | null) => (p ?? "").split("/").filter(Boolean).pop() ?? "";

function Rating({ s }: { s: SkillListItem }) {
  if (!s.rated) return null;
  const pct = Math.round((s.up / s.rated) * 100);
  return (
    <span>
      <span className={pct >= 70 ? "rate-up" : pct >= 40 ? "rate-mid" : "rate-down"}>{pct}%</span> <span className="desc">of {s.rated}</span>
    </span>
  );
}

function LastRun({ s }: { s: SkillListItem }) {
  if (s.liveRunId) return <Link className="live-link" to={`/runs/${s.liveRunId}`}>running now</Link>;
  if (!s.lastRunAt) return null;
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

type Item = SkillListItem & { hasGraph: boolean };

/** Tracked: an open eye. Click it to stop tracking. */
const Eye = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);
/** Not tracked: a crossed-out eye. Click it to track again. */
const EyeOff = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <path d="M1.5 8s2.4-4.5 6.5-4.5c1.1 0 2.1.3 3 .8M14.5 8s-2.4 4.5-6.5 4.5c-1.1 0-2.1-.3-3-.8" />
    <path d="M2.5 13.5 13.5 2.5" />
  </svg>
);
interface Group {
  key: string;
  kind: "personal" | "project" | "marketplace" | "plugin";
  label: string;
  level: 0 | 1;
  /** Groups whose rows are drawn under them (a marketplace only heads its plugins). */
  leaf: boolean;
  skills: Item[];
  color?: string;
  /** The ignore pattern for the whole group, and its marketplace's. */
  pattern?: string;
  parentPattern?: string;
  /** A plugin's marketplace group: closing the marketplace hides its plugins. */
  parent?: string;
}

const OPEN_KEY = "runwell:skills-open";
const readOpen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};

/** Personal skills, then each project, then each marketplace with its plugins under it. */
function groupBySource(items: Item[]): Group[] {
  const out: Group[] = [];
  const personal = items.filter((s) => s.source === "personal");
  if (personal.length) out.push({ key: "personal", kind: "personal", label: "Personal", level: 0, leaf: true, skills: personal });
  const projects = [...new Set(items.filter((s) => s.source === "project").map((s) => s.projectPath!))].sort((a, b) => folderName(a).localeCompare(folderName(b)));
  for (const p of projects) out.push({ key: `project:${p}`, kind: "project", label: folderName(p), level: 0, leaf: true, color: projectColor(p), skills: items.filter((s) => s.projectPath === p) });
  const plugins = items.filter((s) => s.source === "plugin");
  const markets = [...new Set(plugins.map((s) => s.marketplace ?? ""))].sort();
  for (const m of markets) {
    const inMarket = plugins.filter((s) => (s.marketplace ?? "") === m);
    if (m) out.push({ key: `market:${m}`, kind: "marketplace", label: m, level: 0, leaf: false, skills: inMarket, pattern: marketplacePattern(m) });
    for (const pl of [...new Set(inMarket.map((s) => s.plugin!))].sort()) {
      out.push({
        key: `plugin:${pl}`, kind: "plugin", label: pl, level: m ? 1 : 0, leaf: true, skills: inMarket.filter((s) => s.plugin === pl),
        pattern: pluginPattern(pl), parentPattern: m ? marketplacePattern(m) : undefined, parent: m ? `market:${m}` : undefined,
      });
    }
  }
  return out;
}

export function SkillsPage() {
  const res = useResource<{ skills: Item[]; ignored: string[] }>("/api/skills");
  const [params, setParams] = useSearchParams();
  const [hideIgnored, setHideIgnored] = useState(true);
  const [focus, setFocus] = useState(0);
  const { openRunDialog } = useRunDialog();
  useStream("skills", useCallback(() => res.reload(), [res.reload]));
  useStream("runs", useCallback(() => res.reload(), [res.reload]));

  const filter = params.get("filter") ?? (params.get("project") ? `project:${params.get("project")}` : "all");
  const all = res.data?.skills ?? [];
  const patterns = res.data?.ignored ?? [];
  const grouped = params.get("group") === "source";
  const projects = [...new Set(all.filter((s) => s.projectPath).map((s) => s.projectPath!))];
  const chips: Chip[] = [
    { id: "all", label: "All", count: all.length },
    { id: "personal", label: "Personal", count: all.filter((s) => s.source === "personal").length },
    { id: "plugin", label: "Plugins", count: all.filter((s) => s.source === "plugin").length },
    ...projects.map((p) => ({ id: `project:${p}`, label: folderName(p), color: projectColor(p), count: all.filter((s) => s.projectPath === p).length })),
    { id: "workflow", label: "With a graph", count: all.filter((s) => s.hasGraph).length, title: "Skills Runwell can show as steps: from a workflow map in their SKILL.md, or a graph Claude has drawn on the skill's page." },
  ];
  const matching = useMemo(
    () =>
      all
        .filter((s) =>
          filter === "all" ? true : filter === "personal" || filter === "plugin" ? s.source === filter : filter === "workflow" ? s.hasGraph : s.projectPath === filter.slice(8),
        )
        .sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || a.name.localeCompare(b.name)),
    [all, filter],
  );
  const groups = useMemo(() => (grouped ? groupBySource(matching) : null), [grouped, matching]);
  const visible = (s: Item) => !(hideIgnored && s.ignored);
  // Groups start closed, so By source opens as a short list of headers; what you open is remembered.
  const [expanded, setExpanded] = useState<Set<string>>(readOpen);
  const toggleOpen = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* private window: still works for this visit */
      }
      return next;
    });
  const headerShown = (g: Group) => !g.parent || expanded.has(g.parent);
  const rowsOf = (g: Group) => (g.leaf && expanded.has(g.key) && headerShown(g) ? g.skills.filter(visible) : []);
  // The rows in the order they are drawn, for the arrow keys.
  const shown = useMemo(
    () => (groups ? groups.flatMap(rowsOf) : matching.filter(visible)),
    [groups, matching, hideIgnored, expanded],
  );

  // R opens the Run dialog for the focused row, Enter opens its page; arrows move the focus.
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || dialogOpen()) return;
      if (e.key === "ArrowDown") (setFocus((f) => Math.min(f + 1, shown.length - 1)), e.preventDefault());
      else if (e.key === "ArrowUp") (setFocus((f) => Math.max(f - 1, 0)), e.preventDefault());
      else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && shown[focus]) {
        e.preventDefault();
        navigate(`/skills/${encodeURIComponent(shown[focus]!.key)}`);
      } else if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && shown[focus]) {
        e.preventDefault();
        openRunDialog(shown[focus]!.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, focus, openRunDialog, navigate]);

  const toggle = async (s: SkillListItem) => {
    await post(`/api/skills/${encodeURIComponent(s.key)}/ignore`, { ignored: !s.ignored });
    res.reload();
  };
  /** Adds or removes a whole-plugin (`name:*`) or whole-marketplace (`@name`) pattern. */
  const toggleGroup = async (pattern: string) => {
    const next = patterns.includes(pattern) ? patterns.filter((p) => p !== pattern) : [...patterns, pattern];
    await patch("/api/settings", { ignored: next });
    res.reload();
  };

  const row = (s: Item, i: number, nested = false) => (
                <tr key={s.key} className={`${s.ignored ? "ignored" : ""} ${i === focus ? "focused" : ""}${nested ? " nested" : ""}`} data-skill={s.ref} onMouseEnter={() => setFocus(i)}>
                  <td>
                    <div className="sname">
                      <div style={{ minWidth: 0 }}>
                        <div className="nm">
                          <Link to={`/skills/${encodeURIComponent(s.key)}`} className="skill-link">
                            {s.name}
                          </Link>
                          {s.warning ? (
                            <span className="warn-mark" title={s.warning} aria-label={s.warning}>
                              !
                            </span>
                          ) : null}
                          {s.ignored ? <span className="tag">ignored</span> : null}
                          {s.hasGraph ? <span className="tag" title={s.hasWorkflow ? "Its steps come from a workflow map in SKILL.md" : "Claude drew its steps"}>graph</span> : null}
                        </div>
                        <div className="ds">{s.description || (s.warning ? s.warning : "")}</div>
                      </div>
                    </div>
                  </td>
                  {groups ? null : (
                    <td>
                      <SourceTag skill={s} />
                    </td>
                  )}
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
                      <button className="btn run-btn" type="button" onClick={() => openRunDialog(s.key)}>
                        Run
                      </button>
                      <RowMenu s={s} onToggle={() => void toggle(s)} />
                    </div>
                  </td>
                </tr>
  );

  return (
    <>
      <PageHeader
        actions={
          <button className="btn primary" type="button" onClick={() => pickSkill()}>
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
            <>
            <span className="viewseg" role="group" aria-label="Show skills">
              <button type="button" className={grouped ? "" : "on"} aria-pressed={!grouped} onClick={() => (params.delete("group"), setParams(params, { replace: true }))}>
                List
              </button>
              <button type="button" className={grouped ? "on" : ""} aria-pressed={grouped} onClick={() => (params.set("group", "source"), setParams(params, { replace: true }))}>
                By source
              </button>
            </span>
            <label className="toggle-line">
              <input type="checkbox" checked={hideIgnored} onChange={(e) => setHideIgnored(e.target.checked)} /> Hide ignored
            </label>
            </>
          }
        />
        {res.data && !all.length ? (
          <Empty title="No skills found">Runwell looks in ~/.claude/skills, your plugins and your projects' .claude/skills folders.</Empty>
        ) : (
          <table className={`tbl skills-tbl${groups ? " grouped" : ""}`}>
            <colgroup>
              <col />
              {groups ? null : <col style={{ width: 170 }} />}
              <col style={{ width: 130 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 104 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Skill</th>
                {groups ? null : <th>Source</th>}
                <th>Last 14 days</th>
                <th>Rating</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups
                ? groups.map((g) => {
                    if (!headerShown(g)) return null;
                    let offset = 0;
                    for (const h of groups) {
                      if (h === g) break;
                      offset += rowsOf(h).length;
                    }
                    const open = expanded.has(g.key);
                    const ignoredBy = g.pattern && patterns.includes(g.pattern);
                    const viaMarket = g.parentPattern && patterns.includes(g.parentPattern);
                    const rows = rowsOf(g);
                    return (
                      <Fragment key={g.key}>
                        <tr className={`grp lvl${g.level}${ignoredBy || viaMarket ? " off" : ""}`} data-group={g.key} onClick={(e) => !(e.target as HTMLElement).closest(".grp-btn") && toggleOpen(g.key)}>
                          <td colSpan={5}>
                            <div className="grp-h">
                              <button type="button" className="grp-caret" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${g.label}`}>
                                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ transform: open ? "rotate(90deg)" : "none" }}>
                                  <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              {g.color ? <i className="pdot" style={{ background: g.color }} /> : null}
                              <span className="grp-name">{g.label}</span>
                              <span className="grp-meta">
                                {g.kind === "personal" ? "" : `${g.kind} · `}
                                {g.skills.length} {g.skills.length === 1 ? "skill" : "skills"}
                                {ignoredBy ? " · not tracked" : viaMarket ? " · not tracked (marketplace)" : ""}
                              </span>
                              {g.pattern && !viaMarket ? (
                                <button
                                  type="button"
                                  className={`icon-btn grp-btn${ignoredBy ? " on" : ""}`}
                                  aria-label={ignoredBy ? `Track ${g.kind} ${g.label} again` : `Don't track ${g.kind} ${g.label}`}
                                  title={ignoredBy ? `Track this ${g.kind} again` : `Don't track this ${g.kind}: its skills are hidden and not recorded from past chats`}
                                  onClick={(e) => (e.stopPropagation(), void toggleGroup(g.pattern!))}
                                >
                                  {ignoredBy ? <EyeOff /> : <Eye />}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {rows.map((s, j) => row(s, offset + j, g.level === 1))}
                      </Fragment>
                    );
                  })
                : shown.map((s, i) => row(s, i))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
