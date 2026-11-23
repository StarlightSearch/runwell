/** What kind of preview an output file gets, and its media type, by extension. */
export type OutputKind = "video" | "audio" | "image" | "pdf" | "html" | "markdown" | "text" | "other";

const MIME: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8", markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8", json: "application/json", csv: "text/csv; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", ts: "text/plain; charset=utf-8", tsx: "text/plain; charset=utf-8",
  jsx: "text/plain; charset=utf-8", py: "text/plain; charset=utf-8", yaml: "text/plain; charset=utf-8", yml: "text/plain; charset=utf-8",
  xml: "application/xml", sh: "text/plain; charset=utf-8", toml: "text/plain; charset=utf-8", log: "text/plain; charset=utf-8",
};

const ext = (path: string): string => {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

export function mimeOf(path: string): string {
  return MIME[ext(path)] ?? "application/octet-stream";
}

export function outputKind(path: string): OutputKind {
  const m = mimeOf(path);
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/html")) return "html";
  if (m.startsWith("text/markdown")) return "markdown";
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return "text";
  return "other";
}
