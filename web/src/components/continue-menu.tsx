import { useState } from "react";
import type { ResumeInfo } from "../../../src/server/continue";
import { ApiError, post } from "../lib/api";
import "./past-run.css";

/** "Continue in Claude": reopen a finished run's Claude session in a terminal or Claude Desktop. */
export function ContinueMenu({ runId, resume }: { runId: string; resume: ResumeInfo }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const go = async (where: "terminal" | "desktop") => {
    setOpen(false);
    setNote(null);
    try {
      const r = await post<{ message: string }>(`/api/runs/${runId}/continue`, { where });
      setNote({ text: r.message, bad: false });
    } catch (e) {
      setNote({ text: (e as ApiError).message, bad: true });
    }
  };
  const copy = async () => {
    setOpen(false);
    await navigator.clipboard.writeText(resume.command);
    setNote({ text: "Command copied. Paste it into a terminal.", bad: false });
  };
  return (
    <span className="menu-wrap">
      <button className="btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Continue in Claude ▾
      </button>
      {open ? (
        <div className="menu wide" role="menu">
          <button type="button" role="menuitem" onClick={() => void go("terminal")}>
            Open in a terminal
            <span className="desc">claude --resume, in this run's folder</span>
          </button>
          <button type="button" role="menuitem" disabled={!resume.desktop.available} title={resume.desktop.reason ?? ""} onClick={() => void go("desktop")}>
            Open in Claude Desktop
            <span className="desc">{resume.desktop.available ? "the Code tab" : resume.desktop.reason}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => void copy()}>
            Copy command
            <span className="desc mono">{resume.command.length > 60 ? `…${resume.command.slice(-58)}` : resume.command}</span>
          </button>
        </div>
      ) : null}
      {note ? (
        <span className={`continue-note${note.bad ? " bad" : ""}`} role="status" data-testid="continue-note">
          {note.text}
        </span>
      ) : null}
    </span>
  );
}
