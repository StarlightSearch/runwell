import { describe, expect, it } from "vitest";
import { readWorkflowMap } from "./workflow-map";

/** The earnings report as the builder wrote it, with "3.2 Review the draft" running three reviewers at once. */
const reviewers = [
  { name: "Financial Expert", role: "Checks every figure against the transcript and fundamentals." },
  { name: "Risk Analyst", role: "Checks the risk analysis is complete and realistic." },
  { name: "Persuasiveness Expert", role: "Checks clarity and conviction." },
];

function earningsMap(review: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    steps: [
      { title: "1. Read the transcript", detail: "Read the whole call and record sources.", kind: "action" },
      { title: "2. Pull fundamentals", detail: "EDGAR first, then the company release.", kind: "action" },
      {
        title: "3. Draft, review, revise",
        detail: "Up to 3 passes until all three reviewers accept.",
        kind: "loop",
        maxPasses: 3,
        children: [
          { title: "3.1 Write the draft", detail: "Nine sections, sourced claims only.", kind: "action" },
          { title: "3.2 Review the draft", detail: "Financial, risk and persuasiveness reviews.", kind: "action", ...review },
          { title: "3.3 Check verdicts", detail: "Exit on three accepts or after pass 3.", kind: "action" },
        ],
      },
      { title: "4. Grade and publish", detail: "Score out of 100, write report and output.json.", kind: "action" },
    ],
  };
}

function skill(map: unknown, reviewText = "Send the draft to the Financial Expert, the Risk Analyst and the Persuasiveness Expert at the same time."): string {
  return [
    "# Earnings report",
    "## Steps",
    "### 1. Read the transcript",
    "### 2. Pull fundamentals",
    "### 3. Draft, review, revise",
    "#### 3.1 Write the draft",
    "#### 3.2 Review the draft",
    reviewText,
    "#### 3.3 Check verdicts",
    "### 4. Grade and publish",
    "## Workflow map",
    "```pulsar-workflow",
    JSON.stringify(map),
    "```",
  ].join("\n");
}

describe("readWorkflowMap: subagents in parallel", () => {
  it("reads a step's parallel subagents, inside a loop", () => {
    const r = readWorkflowMap(skill(earningsMap({ agents: reviewers })));
    expect(r.status).toBe("valid");
    if (r.status !== "valid") return;
    const review = r.map.steps[2].children?.[1];
    expect(review?.id).toBe("s3.2");
    expect(review?.agents?.map((a) => a.name)).toEqual(["Financial Expert", "Risk Analyst", "Persuasiveness Expert"]);
  });

  it("keeps a map without agents as it was", () => {
    const r = readWorkflowMap(skill(earningsMap({})));
    expect(r.status).toBe("valid");
    if (r.status !== "valid") return;
    expect(r.map.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(r.map.steps[2]).toMatchObject({ kind: "loop", maxPasses: 3 });
    expect(r.map.steps[2].children?.every((c) => c.agents === undefined)).toBe(true);
  });

  it("refuses an agent the steps never mention", () => {
    const r = readWorkflowMap(skill(earningsMap({ agents: reviewers }), "Send the draft to three reviewers."));
    expect(r).toEqual({ status: "invalid", errors: expect.arrayContaining(['the steps never mention "Financial Expert"']) });
  });

  it("refuses an agent name over 40 characters", () => {
    const long = "A reviewer whose name runs on far too long";
    const r = readWorkflowMap(skill(earningsMap({ agents: [{ name: long, role: "x" }] }), `Ask ${long}.`));
    expect(r.status).toBe("invalid");
  });
});

const WITH_RESULT_BLOCK = skill({ ...earningsMap({}), result: [{ type: "stats", about: "Scores", labels: ["Score"] }] });

describe("readWorkflowMap: Runwell additions", () => {
  it("ignores a result layout: only steps are returned", () => {
    const r = readWorkflowMap(WITH_RESULT_BLOCK);
    expect(r.status).toBe("valid");
    expect(Object.keys((r as { map: object }).map)).toEqual(["steps"]);
  });
  it("reports an invalid block with a reason and never throws", () => {
    expect(readWorkflowMap("## A\n```pulsar-workflow\n{not json\n```\n")).toEqual({ status: "invalid", errors: ["the map is not valid JSON"] });
  });
  it("reads a heading with 4,000 spaces in under 100 ms", () => {
    const t = performance.now();
    readWorkflowMap(`## a${" ".repeat(4000)}b\n`);
    expect(performance.now() - t).toBeLessThan(100);
  });
  it("returns none when there is no map", () => {
    expect(readWorkflowMap("# Just a skill\nDo the thing.")).toEqual({ status: "none" });
  });
});
