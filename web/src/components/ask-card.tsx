import { useState } from "react";
import type { Ask, AskAnswer } from "../../../src/shared/events";
import { ApiError, post } from "../lib/api";
import "./ask-card.css";

/** What a permission card shows as its target: the command, the path, the URL, else the input as JSON. */
function target(tool: string, input: Record<string, unknown>): { text: string; json: boolean } {
  const pick = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const t = (tool === "Bash" ? pick("command") : null) ?? pick("file_path") ?? pick("notebook_path") ?? pick("url") ?? pick("path") ?? pick("query");
  return t ? { text: t, json: false } : { text: JSON.stringify(input, null, 2), json: true };
}

function summary(ask: Ask, a: AskAnswer): string {
  if (a.kind === "question") return `You answered: ${Object.values(a.answers).join(", ")}`;
  const t = ask.kind === "permission" ? target(ask.tool, ask.input).text.split("\n")[0] : "";
  return a.allow ? `You allowed: ${t}` : `You denied: ${t}${a.message ? ` (${a.message})` : ""}`;
}

export function AskCard({ runId, ask, onAnswered }: { runId: string; ask: Ask; onAnswered(line: string): void }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, Set<string>>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  const send = async (a: AskAnswer) => {
    setError(null);
    try {
      await post(`/api/runs/${runId}/asks/${ask.id}/answer`, a);
      const line = summary(ask, a);
      setDone(line);
      onAnswered(line);
    } catch (e) {
      if ((e as ApiError).status === 409) {
        setDone("Already answered");
        onAnswered("Already answered");
      } else setError((e as ApiError).message);
    }
  };

  // The page keeps the one-line summary once a card is answered.
  if (done) return null;

  if (ask.kind === "permission") {
    const t = target(ask.tool, ask.input);
    return (
      <div className="ask" data-testid="ask-card">
        <div className="qh">Permission</div>
        <div className="q">Claude wants to run {ask.tool}</div>
        <div className="target">{t.text}</div>
        {denying ? (
          <div className="row">
            <input aria-label="Tell Claude why" placeholder="Tell Claude why (optional)" value={reason} autoFocus onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send({ kind: "permission", allow: false, message: reason.trim() || null })} />
            <button className="btn" type="button" onClick={() => void send({ kind: "permission", allow: false, message: reason.trim() || null })}>
              Deny
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn primary" type="button" onClick={() => void send({ kind: "permission", allow: true, message: null })}>
              Allow
            </button>
            <button className="btn" type="button" onClick={() => setDenying(true)}>
              Deny
            </button>
          </div>
        )}
        {error ? <div className="err">{error}</div> : null}
      </div>
    );
  }

  const single = ask.questions.length === 1 && !ask.questions[0]!.multiSelect;
  const submitAll = () => {
    const answers: Record<string, string> = {};
    for (const q of ask.questions) {
      const v = q.multiSelect ? [...(multi[q.question] ?? [])].join(", ") : (picked[q.question] ?? "");
      answers[q.question] = (typed[q.question]?.trim() || v).trim();
    }
    void send({ kind: "question", answers });
  };
  return (
    <div className="ask" data-testid="ask-card">
      {ask.questions.map((q) => (
        <div key={q.question} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.header ? <div className="qh">{q.header}</div> : null}
          <div className="q">Claude asks: {q.question}</div>
          <div className="choices">
            {q.options.map((o) =>
              q.multiSelect ? (
                <label key={o.label} className="choice" title={o.description ?? undefined}>
                  <input
                    type="checkbox"
                    checked={multi[q.question]?.has(o.label) ?? false}
                    onChange={(e) =>
                      setMulti((m) => {
                        const s = new Set(m[q.question] ?? []);
                        if (e.target.checked) s.add(o.label);
                        else s.delete(o.label);
                        return { ...m, [q.question]: s };
                      })
                    }
                  />{" "}
                  {o.label}
                </label>
              ) : (
                <button
                  key={o.label}
                  type="button"
                  className={`choice${picked[q.question] === o.label ? " on" : ""}`}
                  title={o.description ?? undefined}
                  onClick={() => (single ? void send({ kind: "question", answers: { [q.question]: o.label } }) : setPicked((p) => ({ ...p, [q.question]: o.label })))}
                >
                  {o.label}
                </button>
              ),
            )}
          </div>
          <div className="row">
            <input
              aria-label="Type an answer"
              placeholder="Type an answer…"
              value={typed[q.question] ?? ""}
              onChange={(e) => setTyped((t) => ({ ...t, [q.question]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && single && typed[q.question]?.trim() && void send({ kind: "question", answers: { [q.question]: typed[q.question]!.trim() } })}
            />
          </div>
        </div>
      ))}
      {!single ? (
        <div className="row">
          <button className="btn primary" type="button" onClick={submitAll}>
            Send
          </button>
        </div>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
