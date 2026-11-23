import { useEffect, useState } from "react";
import "./past-run.css";

/** A scrubber over a run's events: the graph is drawn from the first `at` of them. */
export function Replay({ total, at, onChange, onClose }: { total: number; at: number; onChange(n: number): void; onClose(): void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    if (at >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onChange(Math.min(total, at + 1)), 300 / speed);
    return () => clearTimeout(t);
  }, [playing, at, total, speed, onChange]);
  return (
    <div className="replay" data-testid="replay">
      <button className="btn ghost" type="button" aria-label="Step back" onClick={() => onChange(Math.max(0, at - 1))}>
        ◀
      </button>
      <button className="btn" type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => (at >= total && !playing ? (onChange(0), setPlaying(true)) : setPlaying(!playing))}>
        {playing ? "Pause" : "Play"}
      </button>
      <button className="btn ghost" type="button" aria-label="Step forward" onClick={() => onChange(Math.min(total, at + 1))}>
        ▶
      </button>
      <input type="range" aria-label="Replay position" min={0} max={total} value={at} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono desc">
        {at}/{total}
      </span>
      <button className="btn ghost" type="button" onClick={() => setSpeed(speed === 1 ? 4 : 1)}>
        {speed}x
      </button>
      <button className="btn ghost" type="button" onClick={onClose}>
        Close replay
      </button>
    </div>
  );
}
