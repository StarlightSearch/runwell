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

type Topic = "runs" | "skills" | "backfill";
const TOPICS: Topic[] = ["runs", "skills", "backfill"];
const listeners = new Map<Topic, Set<(data: unknown) => void>>(TOPICS.map((t) => [t, new Set()]));
let shared: EventSource | null = null;
let users = 0;

/**
 * Calls `onMessage` for each message on a hub topic. Every subscriber in the page shares one
 * EventSource: browsers allow only six connections per host across all tabs.
 */
export function useStream(topic: Topic, onMessage: (data: unknown) => void): void {
  const cb = useRef(onMessage);
  cb.current = onMessage;
  useEffect(() => {
    const fn = (d: unknown) => cb.current(d);
    listeners.get(topic)!.add(fn);
    if (users++ === 0) {
      shared = new EventSource(`/api/stream?topics=${TOPICS.join(",")}`);
      for (const t of TOPICS) shared.addEventListener(t, (m) => {
        const data = JSON.parse((m as MessageEvent).data);
        for (const l of listeners.get(t)!) l(data);
      });
    }
    return () => {
      listeners.get(topic)!.delete(fn);
      if (--users === 0) {
        shared?.close();
        shared = null;
      }
    };
  }, [topic]);
}
