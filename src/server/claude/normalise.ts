/**
 * One `claude -p --output-format stream-json` line in, zero or more RunEvents out (spike 3):
 * subagent events are tied by `parent_tool_use_id`, nested agents fold into their top-level call,
 * and time comes from each line's `timestamp` when it has one.
 */
import type { RunEvent } from "../../shared/events";
import { SUBAGENT_TOOLS } from "../../shared/graph/from-events";
import { SIGNED_OUT, isAuthError } from "./auth";

const MAX_RESULT = 20_000;
const HIDDEN_TOOLS = new Set(["mcp__runwell__runwell_step", "mcp__runwell__runwell_permission"]);
const KNOWN_TYPES = new Set(["assistant", "user", "result", "system", "rate_limit_event", "stream_event"]);

type Block = { type?: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean };

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && typeof (c as Block).text === "string" ? (c as Block).text : "")).join("");
  return content === undefined || content === null ? "" : JSON.stringify(content);
}
const cut = (s: string) => (s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}… (cut)` : s);

export function createNormaliser(now: () => number) {
  let skipped = 0;
  let session: string | null = null;
  const open = new Set<string>();
  const hidden = new Set<string>();
  /** A subagent call id -> its top-level subagent call id. */
  const topOf = new Map<string, string>();

  const timeOf = (d: { timestamp?: unknown }) => {
    const t = typeof d.timestamp === "string" ? Date.parse(d.timestamp) : Number.NaN;
    return Number.isFinite(t) ? t : now();
  };
  const agentOf = (parent: unknown): string | null => (typeof parent === "string" && parent ? (topOf.get(parent) ?? parent) : null);

  function push(raw: string): RunEvent[] {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return [];
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line);
    } catch {
      skipped++;
      return [];
    }
    if (!d || typeof d !== "object" || typeof d.type !== "string" || !KNOWN_TYPES.has(d.type)) {
      skipped++;
      return [];
    }
    if (typeof d.session_id === "string" && !session) session = d.session_id;
    const out: RunEvent[] = [];
    const at = timeOf(d);
    const agentId = agentOf(d.parent_tool_use_id);
    const content = ((d.message as { content?: unknown } | undefined)?.content ?? []) as Block[];

    if (d.type === "assistant" && Array.isArray(content)) {
      if (typeof d.error === "string" && isAuthError(d.error)) return [];
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) out.push({ t: "text", at, agentId, text: b.text });
        else if (b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
          if (HIDDEN_TOOLS.has(b.name)) {
            hidden.add(b.id);
            continue;
          }
          if (SUBAGENT_TOOLS.has(b.name) && agentId !== null) topOf.set(b.id, agentId);
          open.add(b.id);
          out.push({ t: "tool.start", at, id: b.id, agentId, name: b.name, input: b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {} });
        }
      }
    } else if (d.type === "user" && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
        if (hidden.delete(b.tool_use_id)) continue;
        if (!open.delete(b.tool_use_id)) continue;
        out.push({ t: "tool.end", at, id: b.tool_use_id, ok: b.is_error !== true, result: cut(resultText(b.content)) });
      }
    } else if (d.type === "result") {
      const isError = d.is_error === true;
      const text = typeof d.result === "string" ? d.result : "";
      const error = !isError ? null : isAuthError(text) ? SIGNED_OUT : text || (typeof d.subtype === "string" ? d.subtype : "The run failed");
      out.push({ t: "result", at, ok: !isError, error });
    }
    return out;
  }

  return {
    push,
    end(): RunEvent[] {
      const at = now();
      const out: RunEvent[] = [...open].map((id) => ({ t: "tool.end", at, id, ok: false, result: "The run ended before this finished" }) as RunEvent);
      open.clear();
      return out;
    },
    skipped: () => skipped,
    sessionId: () => session,
  };
}
