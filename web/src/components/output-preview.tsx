import { useEffect, useState } from "react";
import type { OutputRow } from "../../../src/server/outputs";
import { formatBytes } from "../../../src/shared/format";
import { Markdown } from "./markdown";

export type OutputItem = OutputRow & { absolute?: string };
export const fileUrl = (grant: string, runId: string, path: string) => `/o/${grant}/${runId}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** HTML and PDF run in a sandboxed frame with no same-origin access: a page a skill wrote cannot reach Runwell. */
export function OutputPreview({ output, grant }: { output: OutputItem; grant: string }) {
  const url = fileUrl(grant, output.runId, output.path);
  const [text, setText] = useState<string | null>(null);
  const textual = output.kind === "markdown" || output.kind === "text";
  useEffect(() => {
    if (!textual) return;
    fetch(url, { headers: { range: "bytes=0-204799" } }).then((r) => r.text()).then(setText, () => setText(null));
  }, [url, textual]);
  const available = output.copied || output.label === "written";
  if (!available) return <div className="preview filecard">Too large to keep a copy. It is still at its original path.</div>;
  switch (output.kind) {
    case "video":
      return <div className="preview"><video controls preload="metadata" src={url} /></div>;
    case "audio":
      return <div className="preview" style={{ padding: 16 }}><audio controls src={url} style={{ width: "100%" }} /></div>;
    case "image":
      return <div className="preview"><img alt={output.path} src={url} /></div>;
    case "pdf":
    case "html":
      return <div className="preview"><iframe title={output.path} sandbox="allow-scripts" src={url} /></div>;
    case "markdown":
      return <div className="preview">{text === null ? null : <Markdown source={text} />}</div>;
    case "text":
      return <div className="preview"><pre className="mono">{text ?? ""}</pre></div>;
    default:
      return <div className="preview filecard">{output.path} · {formatBytes(output.bytes)}</div>;
  }
}
