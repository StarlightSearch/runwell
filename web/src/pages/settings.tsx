import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "../../../src/shared/format";
import type { BackfillState } from "../../../src/server/backfill";
import type { Config } from "../../../src/server/config";
import type { SkillListItem } from "../../../src/server/skills";
import { PageHeader } from "../components/page-header";
import { api, del, patch, post } from "../lib/api";
import { useStream } from "../lib/sse";
import { useResource } from "../lib/use-resource";
import "../components/run-dialog.css";
import "./settings.css";

interface Settings {
  config: Config;
  folders: {
    claudeHome: { path: string; found: boolean };
    claudeBin: { path: string | null; found: boolean };
    node: { path: string; version: string | null };
    data: { path: string; bytes: number };
  };
  version: string;
}

function FolderRow({ label, path, found, field, onSaved }: { label: string; path: string | null; found: boolean; field: "claudeHome" | "claudePath" | "nodePath"; onSaved(): void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(path ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await patch("/api/settings", { [field]: value.trim() || null });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div data-testid={`folder-${field}`}>
      <div className="srow">
        <span>{label}</span>
        {editing ? (
          <span className="inline">
            <input aria-label={`${label} path`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
            <button className="btn" type="button" onClick={() => void save()}>
              Save
            </button>
          </span>
        ) : (
          <span className="v mono" title={path ?? ""}>
            {path ?? "(not set)"} <span className={found ? "found" : "notfound"}>{found ? "found" : "not found"}</span>
          </span>
        )}
        {editing ? (
          <button className="btn ghost" type="button" onClick={() => (setEditing(false), setError(null))}>
            Cancel
          </button>
        ) : (
          <button className="btn ghost" type="button" onClick={() => (setValue(path ?? ""), setEditing(true))}>
            Edit
          </button>
        )}
      </div>
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

function DeleteRunsDialog({ skills, onClose, onDone }: { skills: SkillListItem[]; onClose(): void; onDone(n: number): void }) {
  const [skill, setSkill] = useState("");
  const [typed, setTyped] = useState("");
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ runs: { status: string }[] }>(`/api/runs?limit=100000${skill ? `&skill=${encodeURIComponent(skill)}` : ""}`).then(
      (r) => setCount(r.runs.filter((x) => !["queued", "running", "waiting"].includes(x.status)).length),
      () => setCount(null),
    );
  }, [skill]);
  const go = async () => {
    const r = await del<{ removed: number }>(`/api/runs${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`);
    onDone(r.removed);
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Delete runs">
        <div className="dh">
          <div className="t">Delete runs</div>
        </div>
        <div className="dbody">
          <label className="opt">
            <select aria-label="Which runs" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">All runs</option>
              {skills.map((s) => (
                <option key={s.key} value={s.key}>
                  Runs of {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="desc" data-testid="delete-count">
            {count === null ? "" : `${count} ${count === 1 ? "run" : "runs"} will be deleted, with their traces and kept files. Runs in progress are kept. Files in your own folders are not touched.`}
          </div>
          <input aria-label="Type DELETE to confirm" placeholder="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="df">
          <span className="sp" />
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" type="button" disabled={typed !== "DELETE" || !count} onClick={() => void go()}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const s = useResource<Settings>("/api/settings");
  const skills = useResource<{ skills: SkillListItem[] }>("/api/skills");
  const bf = useResource<BackfillState>("/api/backfill");
  const [live, setLive] = useState<BackfillState | null>(null);
  const [adding, setAdding] = useState("");
  const [port, setPort] = useState("");
  const [restart, setRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);
  useStream("backfill", useCallback((d) => setLive(d as BackfillState), []));
  const back = live ?? bf.data;
  const cfg = s.data?.config;
  useEffect(() => {
    if (cfg) setPort(String(cfg.port));
  }, [cfg?.port]);

  const setIgnored = async (list: string[]) => {
    setError(null);
    try {
      await patch("/api/settings", { ignored: list });
      s.reload();
      skills.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const savePort = async () => {
    setError(null);
    try {
      const r = await patch<{ restartNeeded: boolean }>("/api/settings", { port: Number(port) });
      if (r.restartNeeded) setRestart(true);
      s.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!s.data || !cfg) return null;
  const f = s.data.folders;
  return (
    <>
      <PageHeader>
        <span className="crumb">
          <b>Settings</b>
        </span>
      </PageHeader>
      <div className="page">
        <div className="settings">
          {error ? <div className="err">{error}</div> : null}
          <section>
            <h2>Folders</h2>
            <FolderRow label="Claude's folder" path={f.claudeHome.path} found={f.claudeHome.found} field="claudeHome" onSaved={() => (s.reload(), skills.reload())} />
            <FolderRow label="Claude Code" path={f.claudeBin.path} found={f.claudeBin.found} field="claudePath" onSaved={s.reload} />
            <FolderRow label="Node" path={f.node.path} found={f.node.version !== null} field="nodePath" onSaved={s.reload} />
          </section>

          <section>
            <h2>Ignored skills</h2>
            <div className="ign" data-testid="ignored-list">
              {cfg.ignored.map((p) => (
                <span className="chip mono" key={p}>
                  {p}
                  <button type="button" aria-label={`Stop ignoring ${p}`} onClick={() => void setIgnored(cfg.ignored.filter((x) => x !== p))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                const v = adding.trim();
                if (v && !cfg.ignored.includes(v)) void setIgnored([...cfg.ignored, v]);
                setAdding("");
              }}
            >
              <input aria-label="Add an ignored skill" placeholder="for example superpowers:*" value={adding} onChange={(e) => setAdding(e.target.value)} />
              <button className="btn" type="submit">
                Add
              </button>
            </form>
            <div className="desc" style={{ marginTop: 8 }}>
              Ignored skills are not recorded from past chats. The Run button still works on them.
            </div>
          </section>

          <section>
            <h2>Server</h2>
            <div className="srow">
              <span>Port</span>
              <span className="inline">
                <input aria-label="Port" value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value)} style={{ maxWidth: 120 }} />
                <button className="btn" type="button" disabled={port === String(cfg.port)} onClick={() => void savePort()}>
                  Save
                </button>
              </span>
              <span />
            </div>
            {restart ? <div className="desc" data-testid="restart-line">Takes effect the next time Workflows starts.</div> : null}
            <div className="srow">
              <span>Version</span>
              <span className="mono">{s.data.version}</span>
              <span />
            </div>
          </section>

          <section>
            <h2>Data</h2>
            <div className="srow">
              <span>Data folder</span>
              <span className="v mono" data-testid="data-size">
                {f.data.path} · {formatBytes(f.data.bytes)}
              </span>
              <span />
            </div>
            <div className="srow">
              <span>Past chats</span>
              <span data-testid="backfill-line">
                {back ? `Read ${back.filesDone} of ${back.filesTotal} logs, ${back.runsFound} runs found, ${back.skippedLines} lines skipped` : ""}
              </span>
              <button className="btn ghost" type="button" disabled={back?.status === "running"} onClick={() => void post<BackfillState>("/api/backfill/rescan").then(setLive)}>
                Look again
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" type="button" onClick={() => setDeleting(true)}>
                Delete runs…
              </button>
              {removed !== null ? <span className="desc" style={{ marginLeft: 10 }}>{removed} {removed === 1 ? "run" : "runs"} deleted.</span> : null}
            </div>
          </section>
        </div>
      </div>
      {deleting ? (
        <DeleteRunsDialog
          skills={skills.data?.skills ?? []}
          onClose={() => setDeleting(false)}
          onDone={(n) => {
            setDeleting(false);
            setRemoved(n);
            s.reload();
          }}
        />
      ) : null}
    </>
  );
}
