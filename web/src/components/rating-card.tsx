import { useEffect, useRef, useState } from "react";
import type { RunRow } from "../../../src/server/runs";
import { post } from "../lib/api";
import { CheckIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import "./past-run.css";

export function RatingCard({ run, onSaved }: { run: RunRow; onSaved(run: RunRow): void }) {
  const [rating, setRating] = useState(run.rating);
  const [note, setNote] = useState(run.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setRating(run.rating);
    setNote(run.note ?? "");
  }, [run.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async (r: 1 | -1 | null, n: string) => {
    setError(null);
    try {
      const res = await post<{ run: RunRow }>(`/api/runs/${run.id}/rating`, { rating: r, note: n });
      onSaved(res.run);
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const pick = (r: 1 | -1) => {
    const next = rating === r ? null : r;
    setRating(next);
    void save(next, note);
  };
  return (
    <section className="card rate" data-testid="rating-card">
      <header className="card-h">
        <div>
          <h3>Was it good?</h3>
          <p className="card-sub">Rate this run to compare it with the next ones.</p>
        </div>
        <span className={`saved${saved ? " on" : ""}`} aria-live="polite">
          {saved ? (
            <>
              <CheckIcon size={12} />
              Saved
            </>
          ) : null}
        </span>
      </header>
      <div className="thumbs">
        <button type="button" className="thumb up" aria-label="Good" aria-pressed={rating === 1} onClick={() => pick(1)}>
          <ThumbUpIcon size={16} />
          <span>Good</span>
        </button>
        <button type="button" className="thumb down" aria-label="Not good" aria-pressed={rating === -1} onClick={() => pick(-1)}>
          <ThumbDownIcon size={16} />
          <span>Not good</span>
        </button>
      </div>
      <label className="note">
        <span className="note-l">Note</span>
        <textarea
          aria-label="Note"
          placeholder="What worked, what didn't. For example: the music was too loud"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (run.note ?? "") && void save(rating, note)}
        />
      </label>
      {error ? <div className="err">{error}</div> : null}
    </section>
  );
}
