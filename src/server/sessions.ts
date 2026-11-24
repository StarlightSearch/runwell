/**
 * Reads a Claude Code session log (`~/.claude/projects/<encoded>/<session>.jsonl`, spike 3) into run
 * events, and finds where skills were used. Only user, assistant and system lines are read: other line
 * types (one of them holds the person's email and full request context) are never copied. Subagents
 * live in `<session>/subagents/agent-<id>.jsonl`, tied to their call by `agent-<id>.meta.json`.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { RunEvent } from "../shared/events";
import { SUBAGENT_TOOLS } from "../shared/graph/from-events";

const MAX_LINE = 5 * 1024 * 1024;
const MAX_RESULT = 20_000;
const GAP_MS = 30 * 60 * 1000;
const READ = new Set(["user", "assistant", "system"]);
/** Line types Claude Code writes that are not conversation: skipped silently, never read. */
const KNOWN_OTHER = new Set([
  "attachment", "queue-operation", "file-history-snapshot", "file-history-delta", "api-request-shape", "api-request-blob", "api-request",
  "last-prompt", "session-owner", "derived-from", "data-flow-records", "atis-latch", "tools-used", "cost-state", "summary", "progress",
]);

export type LogEvent = RunEvent & { line: number };
export interface SkillMark {
  line: number;
  at: number;
  skillRef: string;
  /** null for a Skill tool call: the brief is the user message before it. */
  brief: string | null;
}
export interface SessionLog {
  cwd: string | null;
  sessionId: string | null;
  events: LogEvent[];
  userTurns: { at: number; line: number; text: string }[];
  marks: SkillMark[];
  lastLine: number;
  skipped: number;
}

/** Lines of a file without holding it all in memory; a line over 5 MB is reported as null. */
function* lines(file: string): Generator<string | null> {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(1024 * 1024);
  let carry: Buffer[] = [];
  let carryLen = 0;
  let tooLong = false;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      let start = 0;
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 10) continue;
        const piece = buf.subarray(start, i);
        if (!tooLong && carryLen + piece.length <= MAX_LINE) yield Buffer.concat([...carry, piece]).toString("utf8");
        else yield null;
        carry = [];
        carryLen = 0;
        tooLong = false;
        start = i + 1;
      }
      const rest = buf.subarray(start, n);
      if (carryLen + rest.length > MAX_LINE) {
        tooLong = true;
        carry = [];
        carryLen = 0;
      } else if (!tooLong) {
        carry.push(Buffer.from(rest));
        carryLen += rest.length;
      }
    }
    if (tooLong) yield null;
    else if (carryLen) yield Buffer.concat(carry).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

type Block = { type?: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean };
const textOf = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (c && typeof (c as Block).text === "string" ? (c as Block).text : "")).join("") : "";
const cut = (s: string) => (s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}… (cut)` : s);
const timeOf = (d: { timestamp?: unknown }, fallback: number) => {
  const t = typeof d.timestamp === "string" ? Date.parse(d.timestamp) : Number.NaN;
  return Number.isFinite(t) ? t : fallback;
};

/** Maps one log entry's conversation content to events. */
function mapEntry(d: Record<string, unknown>, at: number, agentId: string | null, line: number, out: LogEvent[]): void {
  const content = (d.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return;
  for (const b of content as Block[]) {
    if (d.type === "assistant") {
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) out.push({ t: "text", at, agentId, text: b.text, line });
      else if (b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string" && !b.name.startsWith("mcp__workflows__")) {
        out.push({ t: "tool.start", at, id: b.id, agentId, name: b.name, input: b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {}, line });
      }
    } else if (d.type === "user" && b?.type === "tool_result" && typeof b.tool_use_id === "string") {
      out.push({ t: "tool.end", at, id: b.tool_use_id, ok: b.is_error !== true, result: cut(textOf(b.content)), line });
    }
  }
}

const COMMAND = /<command-name>\/?([^<\s]+)<\/command-name>/;
const ARGS = /<command-args>([\s\S]*?)<\/command-args>/;

export function readSessionLog(file: string): SessionLog {
  const log: SessionLog = { cwd: null, sessionId: null, events: [], userTurns: [], marks: [], lastLine: 0, skipped: 0 };
  let n = 0;
  let lastAt = 0;
  try {
    for (const raw of lines(file)) {
      n++;
      if (raw === null) {
        log.skipped++;
        continue;
      }
      if (!raw.trim()) continue;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(raw);
      } catch {
        log.skipped++;
        continue;
      }
      const type = typeof d.type === "string" ? d.type : "";
      if (!READ.has(type)) {
        if (!KNOWN_OTHER.has(type)) log.skipped++;
        continue;
      }
      if (!log.cwd && typeof d.cwd === "string") log.cwd = d.cwd;
      if (!log.sessionId && typeof d.sessionId === "string") log.sessionId = d.sessionId;
      const at = timeOf(d, lastAt);
      lastAt = at;
      log.lastLine = n;
      mapEntry(d, at, null, n, log.events);
      if (type === "user" && d.isMeta !== true) {
        const content = (d.message as { content?: unknown } | undefined)?.content;
        const isToolResult = Array.isArray(content) && (content as Block[]).some((b) => b?.type === "tool_result");
        if (!isToolResult) {
          const text = textOf(content);
          const cmd = COMMAND.exec(text);
          if (cmd) log.marks.push({ line: n, at, skillRef: cmd[1]!, brief: (ARGS.exec(text)?.[1] ?? "").trim() });
          if (text.trim()) log.userTurns.push({ at, line: n, text });
        }
      }
      if (type === "assistant") {
        const content = (d.message as { content?: unknown } | undefined)?.content;
        for (const b of (Array.isArray(content) ? content : []) as Block[]) {
          if (b?.type !== "tool_use" || b.name !== "Skill") continue;
          const input = (b.input ?? {}) as Record<string, unknown>;
          const ref = [input.skill, input.command, input.name].find((x): x is string => typeof x === "string" && !!x);
          if (ref) log.marks.push({ line: n, at, skillRef: ref.replace(/^\//, ""), brief: typeof input.args === "string" && input.args.trim() ? input.args.trim() : null });
        }
      }
    }
  } catch {
    /* an unreadable file reads as what was read so far */
  }
  if (!log.sessionId) log.sessionId = basename(file, ".jsonl");
  addSubagents(file, log);
  return log;
}

/** Reads each subagent's own file and adds its events, tied to the call that started it. */
function addSubagents(file: string, log: SessionLog): void {
  const dir = join(dirname(file), basename(file, ".jsonl"), "subagents");
  if (!existsSync(dir)) return;
  const callLine = new Map<string, number>();
  for (const e of log.events) if (e.t === "tool.start" && SUBAGENT_TOOLS.has(e.name)) callLine.set(e.id, e.line);
  const metas: { file: string; toolUseId: string; depth: number }[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".meta.json")) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8")) as { toolUseId?: unknown; spawnDepth?: unknown };
      if (typeof m.toolUseId === "string") metas.push({ file: join(dir, f.replace(/\.meta\.json$/, ".jsonl")), toolUseId: m.toolUseId, depth: typeof m.spawnDepth === "number" ? m.spawnDepth : 1 });
    } catch {
      /* skip a broken link */
    }
  }
  const topOf = new Map<string, string>();
  for (const m of metas.sort((a, b) => a.depth - b.depth)) {
    const top = topOf.get(m.toolUseId) ?? m.toolUseId;
    const line = callLine.get(top) ?? callLine.get(m.toolUseId);
    if (line === undefined || !existsSync(m.file)) continue;
    const inner: LogEvent[] = [];
    let lastAt = 0;
    for (const raw of lines(m.file)) {
      if (raw === null || !raw.trim()) continue;
      try {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (!READ.has(String(d.type))) continue;
        const at = timeOf(d, lastAt);
        lastAt = at;
        mapEntry(d, at, top, line, inner);
      } catch {
        log.skipped++;
      }
    }
    for (const e of inner) {
      if (e.t === "tool.start" && SUBAGENT_TOOLS.has(e.name)) {
        topOf.set(e.id, top);
        callLine.set(e.id, line);
      }
    }
    log.events.push(...inner);
  }
  log.events.sort((a, b) => a.line - b.line || a.at - b.at);
}

export interface SkillUse {
  skillRef: string;
  brief: string;
  startLine: number;
  endLine: number;
  startedAt: number;
  endedAt: number;
}

/** Where each skill use starts and ends (0.1's rule: next skill start, end of log, or an unrelated user turn). */
export function findSkillUses(log: SessionLog): SkillUse[] {
  const marks = [...log.marks].sort((a, b) => a.line - b.line);
  const lastEventBefore = (line: number) => {
    let at = 0;
    for (const e of log.events) if (e.line < line && e.at > at) at = e.at;
    for (const u of log.userTurns) if (u.line < line && u.at > at) at = u.at;
    return at;
  };
  return marks.map((m, i) => {
    const nextStart = marks[i + 1]?.line ?? Number.POSITIVE_INFINITY;
    let end = Math.min(nextStart - 1, log.lastLine);
    for (const u of log.userTurns) {
      if (u.line <= m.line || u.line > end) continue;
      const otherCommand = COMMAND.exec(u.text);
      const unrelated = (otherCommand && otherCommand[1] !== m.skillRef) || u.at - lastEventBefore(u.line) > GAP_MS;
      if (unrelated) {
        end = u.line - 1;
        break;
      }
    }
    const brief = m.brief ?? [...log.userTurns].reverse().find((u) => u.line < m.line)?.text ?? "";
    const inRange = log.events.filter((e) => e.line >= m.line && e.line <= end);
    return {
      skillRef: m.skillRef,
      brief: brief.trim().slice(0, 2000),
      startLine: m.line,
      endLine: end,
      startedAt: m.at,
      endedAt: inRange.reduce((x, e) => Math.max(x, e.at), m.at),
    };
  });
}
