import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkflowSource } from "../../../src/shared/api";
import type { OverviewStep } from "../../../src/shared/graph/source-types";
import type { ClaudeState } from "../../../src/server/claude/auth";
import type { ProjectRow } from "../../../src/server/projects";
import type { RunRow } from "../../../src/server/runs";
import type { SkillListItem } from "../../../src/server/skills";
import { api, ApiError, post } from "../lib/api";
import { pickSkill, RunDialogContext } from "../lib/run-dialog-context";
import "./run-dialog.css";

type Where = { kind: "folder" } | { kind: "project"; path: string } | { kind: "custom" };
interface Upload {
  id: string;
  name: string;
  bytes: number;
}
type Check = { exists: boolean; trusted: boolean; hooks: boolean; mcp: boolean };

const MODE_HINT = {
  auto: "Auto mode: Claude Code decides which actions need your OK; those come to the run page.",
  ask: "Ask first: your own Claude Code permission settings decide; questions come to the run page.",
} as const;

const MODELS = [
  { label: "Default", value: "" },
  { label: "Sonnet", value: "sonnet" },
  { label: "Opus", value: "opus" },
  { label: "Haiku", value: "haiku" },
];

const countSteps = (steps: OverviewStep[]): number => steps.reduce((n, s) => n + 1 + (s.children ? countSteps(s.children) : 0), 0);
const hasAgents = (steps: OverviewStep[]): boolean => steps.some((s) => (s.agents?.length ?? 0) > 0 || (s.children ? hasAgents(s.children) : false));

function trustMessage(c: Check): string {
  const parts = [c.hooks ? "hooks" : null, c.mcp ? "MCP servers" : null].filter(Boolean);
  return parts.length
    ? `Claude Code has not been trusted in this folder. Running here can start this folder's ${parts.join(" and ")}.`
    : "Claude Code has not been trusted in this folder. Running here uses this folder's settings.";
}

function RunDialog({ skillKey, fromRun, initialBrief, onClose }: { skillKey: string; fromRun?: string; initialBrief?: string; onClose(): void }) {
  const navigate = useNavigate();
  const [skill, setSkill] = useState<SkillListItem | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowSource | null>(null);
  const [claude, setClaude] = useState<ClaudeState | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [brief, setBrief] = useState(initialBrief ?? "");
  const [where, setWhere] = useState<Where>({ kind: "folder" });
  const [customPath, setCustomPath] = useState("");
  const [model, setModel] = useState("");
  const [from, setFrom] = useState(fromRun ?? "");
  const [allowAll, setAllowAll] = useState(false);
  const [mode, setMode] = useState<"auto" | "ask">("auto");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(0);
  const [confirm, setConfirm] = useState<{ path: string; check: Check } | null>(null);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ skills: SkillListItem[] }>("/api/skills").then((r) => setSkill(r.skills.find((s) => s.key === skillKey) ?? null), () => {});
    api<WorkflowSource>(`/api/skills/${encodeURIComponent(skillKey)}/workflow`).then(setWorkflow, () => setWorkflow(null));
    api<ClaudeState>("/api/claude?fresh=1").then(setClaude, () => setClaude(null));
    api<{ projects: ProjectRow[] }>("/api/projects").then((r) => setProjects(r.projects), () => {});
    api<{ runs: RunRow[] }>(`/api/runs?skill=${encodeURIComponent(skillKey)}&limit=5`).then((r) => setRuns(r.runs), () => {});
  }, [skillKey]);

  // "From run #n" prefills the brief (inputs are copied by the server).
  useEffect(() => {
    const r = runs.find((x) => x.id === from);
    if (r) setBrief(r.brief);
  }, [from, runs]);

  const subline = useMemo(() => {
    const parts: string[] = [];
    if (workflow?.steps?.length) {
      parts.push(`${countSteps(workflow.steps)} steps`);
      if (hasAgents(workflow.steps)) parts.push("uses agents");
    }
    if (skill?.rated) parts.push(`last runs ${Math.round((skill.up / skill.rated) * 100)}% 👍`);
    return parts.join(" · ");
  }, [workflow, skill]);

  const gate = !claude ? null : !claude.found || claude.signedIn === "out" ? claude.message : null;
  const projectPath = where.kind === "project" ? where.path : where.kind === "custom" ? customPath.trim() : null;

  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const u = await api<Upload>("/api/uploads", { method: "POST", headers: { "x-filename": encodeURIComponent(f.name), "content-type": "application/octet-stream" }, body: f });
        setUploads((list) => [...list, u]);
      } catch (e) {
        setError((e as ApiError).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const start = useCallback(async () => {
    if (busy || gate) return;
    setError(null);
    if (projectPath !== null) {
      if (!projectPath.startsWith("/")) return setError("Type the folder's full path, starting with /.");
      if (confirmedFor !== projectPath) {
        const check = await post<Check>("/api/projects/check", { path: projectPath });
        if (!check.exists) return setError("That folder no longer exists.");
        if (!check.trusted) return setConfirm({ path: projectPath, check });
      }
    }
    setBusy(true);
    try {
      const place = projectPath !== null ? { kind: "project", path: projectPath, confirmedUntrusted: confirmedFor === projectPath } : { kind: "folder", contextProject: null };
      const r = await post<{ run: RunRow }>("/api/runs", { skillKey, brief, place, model: model || null, allowAll, mode, uploadIds: uploads.map((u) => u.id), fromRun: from || null });
      onClose();
      navigate(`/runs/${r.run.id}`);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }, [busy, gate, projectPath, confirmedFor, skillKey, brief, model, allowAll, mode, uploads, from, onClose, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (e.preventDefault(), onClose());
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), void start());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, start]);

  const whereValue = where.kind === "project" ? `p:${where.path}` : where.kind;
  const name = skill?.name ?? skillKey.split(":").pop();

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`dialog${dragging ? " drop" : ""}`}
        role="dialog"
        aria-label={`Run ${name}`}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <div className="dh">
          <div>
            <div className="t">
              Run {name}
              <button
                type="button"
                className="change-skill"
                onClick={() => {
                  onClose();
                  pickSkill(brief);
                }}
              >
                Change skill
              </button>
            </div>
            {subline ? <div className="desc">{subline}</div> : null}
          </div>
          <span className="sp" />
          <span className="kbd">esc</span>
        </div>
        <div className="dbody">
          <textarea
            className="brief"
            autoFocus
            aria-label="Brief"
            placeholder={`What should ${name} do?`}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="opts">
            <label className="opt">
              <span>📁</span>
              <select
                aria-label="Where"
                value={whereValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setConfirm(null);
                  setWhere(v === "folder" ? { kind: "folder" } : v === "custom" ? { kind: "custom" } : { kind: "project", path: v.slice(2) });
                }}
              >
                <option value="folder">New run folder</option>
                {projects.map((p) => (
                  <option key={p.path} value={`p:${p.path}`}>
                    {p.name}
                    {p.trusted ? "" : " (not trusted)"}
                  </option>
                ))}
                <option value="custom">Open folder…</option>
              </select>
            </label>
            <label className="opt file">
              📎 Attach files
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />
            </label>
            <label className="opt" title={MODE_HINT[mode]}>
              <span>⛨</span>
              <select aria-label="Permission mode" value={allowAll ? "all" : mode} disabled={allowAll} onChange={(e) => setMode(e.target.value as "auto" | "ask")}>
                <option value="auto">Auto mode</option>
                <option value="ask">Ask first</option>
                {allowAll ? <option value="all">Everything allowed</option> : null}
              </select>
            </label>
            <label className="opt">
              <span>◑</span>
              <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.label} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {runs.length ? (
              <label className="opt">
                <span>⟲</span>
                <select aria-label="From run" value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Start fresh</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      From run #{r.n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {where.kind === "custom" ? <input aria-label="Folder path" placeholder="/full/path/to/folder" value={customPath} onChange={(e) => setCustomPath(e.target.value)} /> : null}
          <div className="hint">
            {where.kind === "folder" ? "Edits are allowed inside the run folder. Shell commands can still write elsewhere." : "Runs in this folder, the way a chat there would."}{" "}
            {allowAll ? null : MODE_HINT[mode]}
          </div>
          {uploads.length || uploading ? (
            <div className="chips">
              {uploads.map((u) => (
                <span className="chip" key={u.id}>
                  {u.name}
                  <button type="button" aria-label={`Remove ${u.name}`} onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))}>
                    ×
                  </button>
                </span>
              ))}
              {uploading ? <span className="chip">Uploading…</span> : null}
            </div>
          ) : null}
          <label className="allow">
            <input type="checkbox" checked={allowAll} onChange={(e) => setAllowAll(e.target.checked)} />
            <span>
              Allow everything for this run
              {allowAll ? <span className="warn"> Commands can reach outside the folder. Nothing will ask first.</span> : null}
            </span>
          </label>
          {confirm ? (
            <div className="confirm" role="alert">
              <span>{trustMessage(confirm.check)}</span>
              <span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setConfirmedFor(confirm.path);
                    setConfirm(null);
                  }}
                >
                  Run here anyway
                </button>
              </span>
            </div>
          ) : null}
          {error ? <div className="err">{error}</div> : null}
        </div>
        <div className="df">
          {gate ? <span className="gate-msg">{gate}</span> : <span>Runs with your own Claude Code login</span>}
          <span className="sp" />
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" disabled={!!gate || busy || uploading > 0 || !!confirm} onClick={() => void start()}>
            Start run ⌘↵
          </button>
        </div>
      </div>
    </div>
  );
}

export function RunDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ skillKey: string; fromRun?: string; brief?: string; nonce: number } | null>(null);
  const value = useMemo(() => ({ openRunDialog: (skillKey: string, opts?: { fromRun?: string; brief?: string }) => setOpen({ skillKey, fromRun: opts?.fromRun, brief: opts?.brief, nonce: Date.now() }) }), []);
  return (
    <RunDialogContext.Provider value={value}>
      {children}
      {open ? <RunDialog key={open.nonce} skillKey={open.skillKey} fromRun={open.fromRun} initialBrief={open.brief} onClose={() => setOpen(null)} /> : null}
    </RunDialogContext.Provider>
  );
}
