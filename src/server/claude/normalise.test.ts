import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../shared/events";
import { FIXTURES } from "../../../test/fake-claude";
import { createNormaliser } from "./normalise";

const feed = (name: string) => {
  const n = createNormaliser(() => 42);
  const out: RunEvent[] = [];
  for (const line of readFileSync(join(FIXTURES, `${name}.jsonl`), "utf8").split("\n")) if (!line.includes('"__fake"')) out.push(...n.push(line));
  out.push(...n.end());
  return { out, n };
};

describe("normaliser", () => {
  it("happy: text, paired tool calls, a final ok result", () => {
    const { out, n } = feed("happy");
    expect(out.some((e) => e.t === "text")).toBe(true);
    const starts = out.filter((e) => e.t === "tool.start");
    const ends = out.filter((e) => e.t === "tool.end");
    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ends.map((e) => (e as { id: string }).id))).toEqual(new Set(starts.map((e) => (e as { id: string }).id)));
    expect(out.at(-1)).toMatchObject({ t: "result", ok: true, error: null });
    expect(n.sessionId()).toBe("00000000-0000-4000-8000-000000000001");
    const ts = out.find((e) => e.t === "tool.start")!;
    expect(ts.at).toBeGreaterThan(1_700_000_000_000);
  });

  it("subagents: inner events carry their agent's call id, for parallel agents too", () => {
    const { out } = feed("subagents");
    const agents = out.filter((e): e is Extract<RunEvent, { t: "tool.start" }> => e.t === "tool.start" && e.name === "Agent" && e.agentId === null);
    expect(agents).toHaveLength(3);
    const inner = out.filter((e): e is Extract<RunEvent, { t: "tool.start" }> => e.t === "tool.start" && e.agentId !== null);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(agents.map((a) => a.id));
    for (const e of inner) expect(ids.has(e.agentId!)).toBe(true);
    expect(new Set(inner.map((e) => e.agentId)).size).toBe(3);
    const failed = out.find((e) => e.t === "tool.end" && !e.ok);
    expect(failed).toBeDefined();
  });

  it("a nested agent's events carry the top-level agent's id", () => {
    const n = createNormaliser(() => 1);
    const asst = (content: unknown[], parent: string | null) => JSON.stringify({ type: "assistant", parent_tool_use_id: parent, message: { content } });
    const ev = [
      ...n.push(asst([{ type: "tool_use", id: "A1", name: "Agent", input: { description: "Outer", prompt: "x" } }], null)),
      ...n.push(asst([{ type: "tool_use", id: "A2", name: "Agent", input: { description: "Inner", prompt: "y" } }], "A1")),
      ...n.push(asst([{ type: "tool_use", id: "R1", name: "Read", input: { file_path: "/a" } }], "A2")),
    ];
    expect(ev.map((e) => (e as { agentId: string | null }).agentId)).toEqual([null, "A1", "A1"]);
  });

  it("failure: ends not ok with an error", () => {
    const { out } = feed("failure");
    const r = out.at(-1)!;
    expect(r).toMatchObject({ t: "result", ok: false });
    expect((r as { error: string }).error.length).toBeGreaterThan(0);
  });

  it("signed out: ends with the sign-in message", () => {
    expect(feed("signed-out").out.at(-1)).toMatchObject({ t: "result", ok: false, error: "Run `claude` in a terminal and sign in." });
  });

  it("skips bad and unknown lines, counting all but blanks", () => {
    const n = createNormaliser(() => 1);
    expect(n.push("{not json")).toEqual([]);
    expect(n.push("")).toEqual([]);
    expect(n.push(JSON.stringify({ type: "something_new", x: 1 }))).toEqual([]);
    expect(n.skipped()).toBe(2);
  });

  it("parses a line with a trailing \\r", () => {
    const n = createNormaliser(() => 1);
    expect(n.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }) + "\r")).toEqual([{ t: "text", at: 1, agentId: null, text: "hi" }]);
  });

  it("drops workflows_step and workflows_permission calls; keeps AskUserQuestion", () => {
    const n = createNormaliser(() => 1);
    const asst = (name: string, id: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
    const res = (id: string) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } });
    expect([...n.push(asst("mcp__workflows__workflows_step", "s")), ...n.push(res("s"))]).toEqual([]);
    expect([...n.push(asst("mcp__workflows__workflows_permission", "p")), ...n.push(res("p"))]).toEqual([]);
    expect(n.push(asst("AskUserQuestion", "q"))).toHaveLength(1);
  });

  it("cuts a 5 MB tool result", () => {
    const n = createNormaliser(() => 1);
    n.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "b", name: "Bash", input: {} }] } }));
    const [e] = n.push(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "b", content: "x".repeat(5_000_000) }] } }));
    expect((e as { result: string }).result.length).toBeLessThan(20_100);
    expect((e as { result: string }).result.endsWith("… (cut)")).toBe(true);
  });

  it("end closes calls still open", () => {
    const n = createNormaliser(() => 7);
    n.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "b", name: "Bash", input: {} }] } }));
    expect(n.end()).toEqual([{ t: "tool.end", at: 7, id: "b", ok: false, result: "The run ended before this finished" }]);
  });
});
