import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RunRow } from "../../../src/server/runs";
import type { SkillListItem } from "../../../src/server/skills";
import { api } from "../lib/api";
import { dialogOpen, isTyping, KEYS } from "../lib/keys";
import { useRunDialog } from "../lib/run-dialog-context";
import "./run-dialog.css";
import "./palette.css";

type Item = { kind: "skill"; skill: SkillListItem } | { kind: "run"; run: RunRow };

function Palette({ skillsOnly, onClose }: { skillsOnly: boolean; onClose(): void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const navigate = useNavigate();
  const { openRunDialog } = useRunDialog();
  useEffect(() => {
    api<{ skills: SkillListItem[] }>("/api/skills").then((r) => setSkills(r.skills), () => {});
    if (!skillsOnly) api<{ runs: RunRow[] }>("/api/runs?limit=200").then((r) => setRuns(r.runs), () => {});
  }, [skillsOnly]);
  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const hit = (...s: (string | null | undefined)[]) => !t || s.some((x) => x?.toLowerCase().includes(t));
    const ss = skills.filter((s) => hit(s.name, s.ref, s.description)).slice(0, 8).map((skill) => ({ kind: "skill" as const, skill }));
    const rs = skillsOnly ? [] : runs.filter((r) => hit(`${r.skillRef} #${r.n}`, r.brief)).slice(0, 8).map((run) => ({ kind: "run" as const, run }));
    return [...ss, ...rs];
  }, [q, skills, runs, skillsOnly]);
  useEffect(() => setSel(0), [q]);
  const choose = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    if (it.kind === "skill") openRunDialog(it.skill.key);
    else navigate(`/runs/${it.run.id}`);
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-label={skillsOnly ? "Pick a skill to run" : "Search"}>
        <input
          autoFocus
          aria-label="Search"
          placeholder={skillsOnly ? "Pick a skill to run…" : "Search skills and runs…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, items.length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            else if (e.key === "Enter") (e.preventDefault(), choose(items[sel]));
            else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), onClose());
          }}
        />
        <div className="presults" role="listbox">
          {items.map((it, i) => (
            <div
              key={it.kind === "skill" ? it.skill.key : it.run.id}
              role="option"
              aria-selected={i === sel}
              className={`pitem${i === sel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => (e.preventDefault(), choose(it))}
            >
              {it.kind === "skill" ? (
                <>
                  <span className="pk">Skill</span>
                  <b>{it.skill.name}</b>
                  <span className="desc">{it.skill.description}</span>
                </>
              ) : (
                <>
                  <span className="pk">Run</span>
                  <b>
                    {it.run.skillRef} #{it.run.n}
                  </b>
                  <span className="desc">{it.run.brief}</span>
                </>
              )}
            </div>
          ))}
          {!items.length ? <div className="desc" style={{ padding: 12 }}>Nothing matches.</div> : null}
        </div>
      </div>
    </div>
  );
}

function KeysHelp({ onClose }: { onClose(): void }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-label="Keyboard shortcuts">
        <div className="dh">
          <div className="t">Keyboard shortcuts</div>
        </div>
        <div className="dbody">
          {KEYS.map(([k, what]) => (
            <div key={k} className="krow">
              <span className="kbd">{k}</span>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The global keys and the command palette. */
export function CommandPalette() {
  const [open, setOpen] = useState<null | "search" | "pick" | "help">(null);
  const navigate = useNavigate();
  const location = useLocation();
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    const onOpen = () => setOpen("search");
    window.addEventListener("runwell:palette", onOpen);
    return () => window.removeEventListener("runwell:palette", onOpen);
  }, []);
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => (o === "search" ? null : dialogOpen() ? o : "search"));
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(null);
        return;
      }
      if (isTyping(e.target) || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (g && Date.now() - g < 1200) {
        g = 0;
        const to = { s: "/skills", r: "/runs", o: "/outputs" }[e.key.toLowerCase()];
        if (to) (e.preventDefault(), navigate(to));
        return;
      }
      if (e.key === "g" || e.key === "G") g = Date.now();
      else if (e.key === "?") (e.preventDefault(), setOpen("help"));
      else if ((e.key === "r" || e.key === "R") && location.pathname !== "/skills") (e.preventDefault(), setOpen("pick"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, navigate, location.pathname]);
  if (open === "help") return <KeysHelp onClose={close} />;
  if (open === "search" || open === "pick") return <Palette key={open} skillsOnly={open === "pick"} onClose={close} />;
  return null;
}
