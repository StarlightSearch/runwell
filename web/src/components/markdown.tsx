import type { ReactNode } from "react";

/**
 * A small markdown renderer that only makes elements and text nodes: headings, lists, code, paragraphs
 * and links. Raw HTML in the source stays text, so a skill's output can never run script here.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<code key={`${key}-${i++}`}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<a key={`${key}-${i++}`} href={m[3]} target="_blank" rel="noreferrer noopener">{m[2].slice(1, m[2].indexOf("]"))}</a>);
    else if (m[4]) out.push(<strong key={`${key}-${i++}`}>{m[4].slice(2, -2)}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(<pre key={k++}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(h[1]!.length, 3);
      const content = inline(h[2]!, `h${k}`);
      blocks.push(level === 1 ? <h1 key={k++}>{content}</h1> : level === 2 ? <h2 key={k++}>{content}</h2> : <h3 key={k++}>{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) {
        items.push(<li key={items.length}>{inline(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""), `l${k}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|```|\s*([-*]|\d+\.)\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={k++}>{inline(para.join(" "), `p${k}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
