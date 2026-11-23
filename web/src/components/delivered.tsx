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
    <section data-testid="delivered">
      <h2>Delivered by this run</h2>
      {!main ? (
        <NoFiles onRescan={onRescan} />
      ) : (
        <>
          <OutputPreview output={main} grant={grant} />
          <div className="deliv-head">
            <span className="p mono">{main.path}</span>
            <OutputActions output={main} />
          </div>
          {outputs.length > 1 ? (
            <div style={{ marginTop: 18 }} data-testid="other-files">
              <h2>Other files</h2>
              <OutputList outputs={outputs.filter((o) => o !== main)} grant={grant} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
