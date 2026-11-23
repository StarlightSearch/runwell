import { Link } from "react-router-dom";
import { formatDate } from "../../../src/shared/format";
import type { OutputItem } from "./output-preview";
import { fileUrl } from "./output-preview";

export type TileItem = OutputItem & { skillRef: string; runN: number; runCreatedAt: number; grant: string };
const BADGE: Record<string, string> = { video: "MP4", audio: "AUDIO", image: "IMG", pdf: "PDF", html: "HTML", markdown: "MD", text: "TXT", other: "FILE" };

export function OutputTile({ item }: { item: TileItem }) {
  const url = fileUrl(item.grant, item.runId, item.path);
  const name = item.path.split("/").pop() ?? item.path;
  const viewable = item.copied || item.label === "written";
  return (
    <Link to={`/runs/${item.runId}`} className="tile" data-testid="output-tile" data-kind={item.kind}>
      <div className={`thumb kind-${item.kind}`}>
        {viewable && item.kind === "image" ? <img alt="" src={url} loading="lazy" /> : viewable && item.kind === "video" ? <video preload="metadata" muted src={url} /> : <span>{BADGE[item.kind]}</span>}
      </div>
      <div className="tmeta">
        <div className="tname" title={item.path}>
          {name}
        </div>
        <div className="desc">
          {item.skillRef} #{item.runN} · {formatDate(item.runCreatedAt)}
        </div>
      </div>
    </Link>
  );
}
