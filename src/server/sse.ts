/** A tiny publish/subscribe hub the SSE route reads from. */
export interface Hub {
  publish(topic: string, data: unknown): void;
  subscribe(topics: string[], send: (topic: string, data: unknown) => void): () => void;
  clients(): number;
}

export function createHub(): Hub {
  const subs = new Set<{ topics: Set<string>; send: (topic: string, data: unknown) => void }>();
  return {
    publish(topic, data) {
      for (const s of subs) {
        if (!s.topics.has(topic)) continue;
        try {
          s.send(topic, data);
        } catch {
          /* a closed client is removed by its own unsubscribe */
        }
      }
    },
    subscribe(topics, send) {
      const sub = { topics: new Set(topics), send };
      subs.add(sub);
      return () => void subs.delete(sub);
    },
    clients: () => subs.size,
  };
}
