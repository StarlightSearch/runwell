import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graphOf } from "../shared/graph/from-events";
import { findSkillUses, readSessionLog } from "./sessions";

const FIXTURE = join(__dirname, "../../test/fixtures/sessions/-home-user-project/00000000-0000-4000-8000-000000000001.jsonl");
const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 10, min)).toISOString();
const cmd = (name: string, args: string, min: number) => ({ type: "user", cwd: "/p", timestamp: t(min), message: { role: "user", content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>` } });
const said = (text: string, min: number) => ({ type: "user", cwd: "/p", timestamp: t(min), message: { role: "user", content: text } });
const tool = (id: string, name: string, input: object, min: number) => ({ type: "assistant", cwd: "/p", timestamp: t(min), message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (id: string, min: number, isError = false) => ({ type: "user", cwd: "/p", timestamp: t(min), message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok", is_error: isError }] } });
function log(lines: (object | string)[]) {
  const f = join(mkdtempSync(join(tmpdir(), "runwell-log-")), "s.jsonl");
  writeFileSync(f, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"));
  return f;
}

describe("readSessionLog", () => {
  it("reads the fixture: cwd, events with times, and the subagent's own events from its file", () => {
    const l = readSessionLog(FIXTURE);
    expect(l.sessionId).toMatch(/^00000000-0000-4000-8000-0000000000\d\d$/);
    expect(l.cwd).toBe("/home/user/project");
    const agentStart = l.events.find((e) => e.t === "tool.start" && e.name === "Agent")!;
    const inner = l.events.filter((e) => e.t === "tool.start" && e.agentId === (agentStart as { id: string }).id);
    expect(inner.length).toBeGreaterThan(0);
    expect(l.events.filter((e) => e.t === "tool.start" && e.name === "Write")).toHaveLength(2);
    expect(l.skipped).toBe(0);
    const g = graphOf(l.events, null, false);
    expect(g.nodes.filter((n) => n.kind === "agent")).toHaveLength(1);
  });

  it("skips a truncated last line, a non-JSON line and an unknown line type, without throwing", () => {
    const f = log([cmd("a", "x", 0), "not json", JSON.stringify({ type: "brand_new_kind" }), tool("w", "Write", { file_path: "/p/a" }, 1), '{"type":"assistant","message":{"con']);
    const l = readSessionLog(f);
    expect(l.skipped).toBe(3);
    expect(l.events.some((e) => e.t === "tool.start")).toBe(true);
  });
});

describe("findSkillUses", () => {
  it("the fixture yields one use with its ref, brief and line range", () => {
    const uses = findSkillUses(readSessionLog(FIXTURE));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ skillRef: "runwell-fixture", brief: "colour list", startLine: 1, endLine: 11 });
  });

  it("two skill starts give two uses, the first ending where the second starts", () => {
    const f = log([cmd("a", "first", 0), tool("w1", "Write", { file_path: "/p/1" }, 1), result("w1", 1), cmd("b", "second", 2), tool("w2", "Write", { file_path: "/p/2" }, 3), result("w2", 3)]);
    const uses = findSkillUses(readSessionLog(f));
    expect(uses.map((u) => [u.skillRef, u.brief, u.startLine, u.endLine])).toEqual([["a", "first", 1, 3], ["b", "second", 4, 6]]);
  });

  it("a later user turn over 30 minutes after the last event ends a use", () => {
    const f = log([cmd("a", "x", 0), tool("w1", "Write", { file_path: "/p/1" }, 1), result("w1", 1), said("something else", 40), tool("w2", "Write", { file_path: "/p/2" }, 41)]);
    expect(findSkillUses(readSessionLog(f)).map((u) => [u.startLine, u.endLine])).toEqual([[1, 3]]);
  });

  it("a Skill tool call starts a use, with the preceding user message as the brief", () => {
    const f = log([said("please make the deck", 0), tool("s1", "Skill", { skill: "pptx" }, 1), result("s1", 1), tool("w1", "Write", { file_path: "/p/d.pptx" }, 2)]);
    expect(findSkillUses(readSessionLog(f))[0]).toMatchObject({ skillRef: "pptx", brief: "please make the deck", startLine: 2 });
  });
});
