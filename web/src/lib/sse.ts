import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "../../../src/shared/events";

/** A run's events: everything stored, then live ones. EventSource reconnects with Last-Event-ID itself. */
export function useEvents(runId: string | undefined): { events: RunEvent[]; ended: boolean } {
  const [state, setState] = useState<{ events: RunEvent[]; ended: boolean }>({ events: [], ended: false });
  useEffect(() => {
    if (!runId) return;
    setState({ events: [], ended: false });
    const es = new EventSource(`/api/runs/${runId}/events`);
    const buffer: RunEvent[] = [];
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batch = buffer.splice(0);
      if (batch.length) setState((s) => ({ ...s, events: [...s.events, ...batch] }));
    };
    es.addEventListener("event", (m) => {
      buffer.push(JSON.parse((m as MessageEvent).data) as RunEvent);
      if (!raf) raf = requestAnimationFrame(flush);
    });
    es.addEventListener("end", () => {
      flush();
      setState((s) => ({ ...s, ended: true }));
      es.close();
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      es.close();
    };
  }, [runId]);
  return state;
}

/** Calls `onMessage` for each message on a hub topic (runs, skills, backfill). */
export function useStream(topic: "runs" | "skills" | "backfill", onMessage: (data: unknown) => void): void {
  const cb = useRef(onMessage);
  cb.current = onMessage;
  useEffect(() => {
    const es = new EventSource(`/api/stream?topics=${topic}`);
    es.addEventListener(topic, (m) => cb.current(JSON.parse((m as MessageEvent).data)));
    return () => es.close();
  }, [topic]);
}
