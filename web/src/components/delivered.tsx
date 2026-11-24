import { formatBytes } from "../../../src/shared/format";
import { FileIcon } from "./icons";
import { NoFiles, OutputActions, OutputList } from "./output-list";
import { OutputPreview, type OutputItem } from "./output-preview";
import "./past-run.css";

const ORDER = ["video", "audio", "image", "pdf", "html", "markdown", "text", "other"];

/** The run's main deliverable: the first file by kind order, newest first within a kind. */
export function pickDelivered(outputs: OutputItem[]): OutputItem | null {
  return [...outputs].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.mtime - a.mtime)[0] ?? null;
}

export function Delivered({ outputs, grant, onRescan }: { outputs: OutputItem[]; grant: string; onRescan?: () => void }) {
  const main = pickDelivered(outputs);
  return (
    <section className="deliv" data-testid="delivered">
      <div className="card deliv-card">
        <header className="card-h deliv-head">
          <span className="deliv-ic">
            <FileIcon size={15} />
          </span>
          <div className="deliv-name">
            <div className="eyebrow">Delivered</div>
            {main ? (
              <div className="p mono" title={main.path}>
                {main.path}
              </div>
            ) : (
              <div className="p">No files</div>
            )}
          </div>
          {main ? (
            <>
              {main.bytes ? <span className="deliv-size">{formatBytes(main.bytes)}</span> : null}
              <OutputActions output={main} />
            </>
          ) : null}
        </header>
        <div className="deliv-body">{main ? <OutputPreview output={main} grant={grant} /> : <NoFiles onRescan={onRescan} />}</div>
      </div>
      {main && outputs.length > 1 ? (
        <div className="card" data-testid="other-files">
          <header className="card-h">
            <h3>Other files</h3>
            <span className="card-count">{outputs.length - 1}</span>
          </header>
          <OutputList outputs={outputs.filter((o) => o !== main)} grant={grant} />
        </div>
      ) : null}
    </section>
  );
}
