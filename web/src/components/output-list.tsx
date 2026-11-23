import { useState } from "react";
import { formatBytes } from "../../../src/shared/format";
import { post } from "../lib/api";
import type { OutputItem } from "./output-preview";
import { OutputPreview } from "./output-preview";
import "./tabs.css";

const BADGE: Record<string, string> = { video: "MP4", audio: "AUD", image: "IMG", pdf: "PDF", html: "HTML", markdown: "MD", text: "TXT", other: "FILE" };
const badge = (o: OutputItem) => (o.kind === "other" || o.kind === "text" ? (o.path.split(".").pop() ?? BADGE[o.kind]!).slice(0, 4).toUpperCase() : BADGE[o.kind]!);
const labelOf = (o: OutputItem) =>
  !o.copied && o.label !== "written" ? "too large to keep a copy, still at its original path" : o.label === "written" ? "written by this run" : o.label === "probably" ? "probably from this run" : "from history";

export function OutputActions({ output }: { output: OutputItem }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <span className="err" role="status">{error}</span> : null}
      <button
        className="btn ghost"
        type="button"
        onClick={() => void post("/api/outputs/reveal", { runId: output.runId, path: output.path }).then(() => setError(null), () => setError("That file is no longer there."))}
      >
        Show in folder
      </button>
      <button
        className="btn ghost"
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(output.absolute ?? output.path).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? "Copied" : "Copy path"}
      </button>
    </>
  );
}

export function OutputList({ outputs, grant }: { outputs: OutputItem[]; grant: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!outputs.length) return <div className="desc">This run kept no files.</div>;
  return (
    <div className="outs">
      {outputs.map((o) => (
        <div key={o.path} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="orow" data-testid="output-row">
            <div className={`ft kind-${o.kind}`}>{badge(o)}</div>
            <div className="meta">
              <button type="button" className="p" style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", maxWidth: "100%", textAlign: "left" }} onClick={() => setOpen(open === o.path ? null : o.path)}>
                {o.path}
              </button>
              <div className="desc">
                {formatBytes(o.bytes)} · {labelOf(o)}
              </div>
            </div>
            <OutputActions output={o} />
          </div>
          {open === o.path ? <OutputPreview output={o} grant={grant} /> : null}
        </div>
      ))}
    </div>
  );
}
