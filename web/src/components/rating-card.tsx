import { useEffect, useState } from "react";
import type { RunRow } from "../../../src/server/runs";
import { post } from "../lib/api";
import "./past-run.css";

export function RatingCard({ run, onSaved }: { run: RunRow; onSaved(run: RunRow): void }) {
  const [rating, setRating] = useState(run.rating);
  const [note, setNote] = useState(run.note ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRating(run.rating);
    setNote(run.note ?? "");
  }, [run.id]);
  const save = async (r: 1 | -1 | null, n: string) => {
    setError(null);
    try {
      const res = await post<{ run: RunRow }>(`/api/runs/${run.id}/rating`, { rating: r, note: n });
      onSaved(res.run);
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
    <section className="rate" data-testid="rating-card">
      <h2 style={{ margin: 0 }}>Was it good?</h2>
      <div className="thumbs">
        <button type="button" aria-label="Good" aria-pressed={rating === 1} onClick={() => pick(1)}>
          👍
        </button>
        <button type="button" aria-label="Not good" aria-pressed={rating === -1} onClick={() => pick(-1)}>
          👎
        </button>
      </div>
      <textarea
        aria-label="Note"
        placeholder="Add a note, for example: the music was too loud"
        value={note}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (run.note ?? "") && void save(rating, note)}
      />
      <div className="desc">Ratings and notes are kept with the run.</div>
      {error ? <div className="err">{error}</div> : null}
    </section>
  );
}
