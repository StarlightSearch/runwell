import { useCallback, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { BackfillState } from "../../../src/server/backfill";
import type { ProjectRow } from "../../../src/server/projects";
import type { RunRow } from "../../../src/server/runs";
import type { SkillListItem } from "../../../src/server/skills";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import { useTheme } from "../lib/theme";
import { projectColor, shortAgo } from "../lib/colors";
import { Logo } from "./logo";
import { MoonIcon, OutputsIcon, PlusIcon, RunsIcon, SearchIcon, SettingsIcon, SkillsIcon, SunIcon } from "./icons";

const LIVE = new Set(["queued", "running", "waiting"]);

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const skills = useResource<{ skills: SkillListItem[] }>("/api/skills");
  const runs = useResource<{ runs: RunRow[] }>("/api/runs?limit=50");
  const projects = useResource<{ projects: ProjectRow[]; readable: boolean }>("/api/projects");
  const [backfill, setBackfill] = useState<BackfillState | null>(null);
  const bf = useResource<BackfillState>("/api/backfill");
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  useStream("runs", useCallback(() => runs.reload(), [runs.reload]));
  useStream("skills", useCallback(() => skills.reload(), [skills.reload]));
  useStream("backfill", useCallback((d) => setBackfill(d as BackfillState), []));
  const bfState = backfill ?? bf.data;

  const all = runs.data?.runs ?? [];
  const live = all.filter((r) => LIVE.has(r.status)).length;
  const visibleSkills = (skills.data?.skills ?? []).filter((s) => !s.ignored).length;

  return (
    <aside className="side" aria-label="Sidebar">
      <div className="ws">
        <Logo size={22} className="logo" />
        <span className="ws-name">Workflows</span>
      </div>
      <button className="search" onClick={onSearch} type="button" title="Search (⌘K)">
        <span className="search-l">
          <SearchIcon size={14} />
          <span className="label">Search skills, runs…</span>
        </span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="side-scroll">
        <NavLink to="/skills" title="Skills" className={({ isActive }) => `nav${isActive ? " on" : ""}`}>
          <SkillsIcon />
          <span className="label">Skills</span>
          <span className="n">{skills.data ? visibleSkills : ""}</span>
        </NavLink>
        <NavLink to="/runs" end title="Runs" className={({ isActive }) => `nav${isActive ? " on" : ""}`}>
          <RunsIcon />
          <span className="label">Runs</span>
          {live ? (
            <span className="n live-count" title={`${live} running`}>
              <i className="pulse" />
              {live}
            </span>
          ) : null}
        </NavLink>
        <NavLink to="/outputs" title="Outputs" className={({ isActive }) => `nav${isActive ? " on" : ""}`}>
          <OutputsIcon />
          <span className="label">Outputs</span>
        </NavLink>

        <div className="sec rail-hide">Projects from Claude</div>
        {(projects.data?.projects ?? []).slice(0, 8).map((p) => (
          <a key={p.path} className="nav rail-hide" title={p.path} onClick={() => navigate(`/skills?project=${encodeURIComponent(p.path)}`)}>
            <i className="pdot" style={{ background: projectColor(p.path) }} />
            <span className="label">{p.name}</span>
            <span className="n">{p.skillCount || ""}</span>
          </a>
        ))}
        <a className="nav muted rail-hide" onClick={() => navigate("/settings")}>
          <PlusIcon />
          <span className="label">Open folder…</span>
        </a>

        <div className="sec rail-hide">Recent runs</div>
        {all.slice(0, 8).map((r) => (
          <NavLink key={r.id} to={`/runs/${r.id}`} className={({ isActive }) => `nav rail-hide${isActive ? " on" : ""}`} data-testid="recent-run">
            <span className="label">
              {r.skillRef.split(":").pop()} <span className="run-n">#{r.n}</span>
            </span>
            {LIVE.has(r.status) ? (
              <span className="n live-mark" aria-label={r.status === "waiting" ? "waiting for you" : "running"}>
                <i className={`pulse${r.status === "waiting" ? " wait" : ""}`} />
              </span>
            ) : r.status === "failed" ? (
              <span className="n fail-mark">failed</span>
            ) : (
              <span className="n">{shortAgo(r.startedAt ?? r.createdAt)}</span>
            )}
          </NavLink>
        ))}
        {!all.length && runs.data ? <div className="backfill-line rail-hide">No runs yet</div> : null}
      </div>

      <div className="side-foot">
        {bfState && bfState.status === "running" ? (
          <div className="backfill-line" data-testid="backfill-line">
            Reading past chats: {bfState.filesDone} of {bfState.filesTotal}
          </div>
        ) : null}
        <NavLink to="/settings" title="Settings" className={({ isActive }) => `nav${isActive ? " on" : ""}`}>
          <SettingsIcon />
          <span className="label">Settings</span>
        </NavLink>
        <button className="nav" type="button" title="Switch theme" onClick={toggle} style={{ border: 0, background: "transparent", textAlign: "left" }}>
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          <span className="label">{theme === "dark" ? "Dark" : "Light"} theme</span>
        </button>
      </div>
    </aside>
  );
}
