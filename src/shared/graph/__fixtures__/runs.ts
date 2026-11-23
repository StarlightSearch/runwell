// Ported from Pulsar (Starlight), released here under the MIT license.
/** Hand-written runs (made-up content) in the shapes real runs have. */
import type { OverviewStep } from "../source-types";
import { assistant, step, subagent, text, todo, user, call } from "./helpers";

const action = (id: string, title: string, extra: Partial<OverviewStep> = {}): OverviewStep => ({ id, title, detail: "", kind: "action", ...extra });

/* An evaluation: fixed checklist e1-e5, no overview, six parallel agents under e2 (four still working). */
const EVAL_IDS = ["e1", "e2", "e3", "e4", "e5"];
export const evaluation = {
  overviewSteps: null,
  steps: [
    step("e1", "Write test requests", 0, "done"),
    step("e2", "Run with the skill", 0, "running"),
    step("e3", "Run without it", 0, "pending"),
    step("e4", "Grade the answers", 0, "pending"),
    step("e5", "Summarize", 0, "pending"),
  ],
  messages: [
    user("u1", "Evaluate the skill"),
    assistant("a1", [
      todo(EVAL_IDS, { e1: "in_progress" }),
      text("Writing three test requests."),
      call("write", { path: "evals/evals.json", content: "{}" }),
      todo(EVAL_IDS, { e1: "completed", e2: "in_progress" }),
      subagent("Test 1 with skill", "Answer request 1 using the skill", "done", { result: "Answer 1" }),
      subagent("Test 2 with skill", "Answer request 2 using the skill", "done", { result: "Answer 2" }),
      subagent("Test 3 with skill", "Answer request 3 using the skill", "executing"),
      subagent("Test 1 baseline", "Answer request 1 without the skill", "executing"),
      subagent("Test 2 baseline", "Answer request 2 without the skill", "executing"),
      subagent("Test 3 baseline", "Answer request 3 without the skill", "executing"),
    ], true),
  ],
  live: true,
};

/* A contract review: loop s5 with three children, mid-run. */
const CONTRACT_IDS = ["s1", "s2", "s3", "s4", "s5", "s5.1", "s5.2", "s5.3", "s6"];
export const contractOverview: OverviewStep[] = [
  action("s1", "Read the contract"),
  action("s2", "List the parties"),
  action("s3", "Extract the obligations"),
  action("s4", "Check the dates"),
  {
    ...action("s5", "Review each clause"),
    kind: "loop",
    children: [action("s5.1", "Read the clause"), action("s5.2", "Flag the risks"), action("s5.3", "Suggest wording")],
  },
  action("s6", "Write the memo"),
];
export const contractReview = {
  overviewSteps: contractOverview,
  steps: [
    step("s1", "Read the contract", 0, "done"),
    step("s2", "List the parties", 0, "done"),
    step("s3", "Extract the obligations", 0, "done"),
    step("s4", "Check the dates", 0, "done"),
    step("s5", "Review each clause", 0, "running"),
    step("s5.1", "Read the clause", 1, "done"),
    step("s5.2", "Flag the risks", 1, "running"),
    step("s5.3", "Suggest wording", 1, "pending"),
    step("s6", "Write the memo", 0, "pending"),
  ],
  messages: [
    user("u1", "Review contract.pdf"),
    assistant("a1", [
      todo(CONTRACT_IDS, { s1: "completed", s2: "completed", s3: "completed", s4: "completed", s5: "in_progress", "s5.1": "in_progress" }),
      call("read", { path: "contract.pdf" }),
      todo(CONTRACT_IDS, { s1: "completed", s2: "completed", s3: "completed", s4: "completed", s5: "in_progress", "s5.1": "completed", "s5.2": "in_progress" }),
    ], true),
  ],
  live: true,
};

/* A log watch with a decision step, finished. */
export const logWatchOverview: OverviewStep[] = [
  action("s1", "Fetch the logs"),
  action("s2", "Count the errors"),
  {
    ...action("s3", "Decide whether to alert"),
    kind: "decision",
    branches: [
      { when: "more than 10 errors", then: "send an alert" },
      { when: "otherwise", then: "stop and report" },
    ],
  },
  action("s4", "Write the report"),
];
export const logWatch = {
  overviewSteps: logWatchOverview,
  steps: [
    step("s1", "Fetch the logs", 0, "done"),
    step("s2", "Count the errors", 0, "done"),
    step("s3", "Decide whether to alert", 0, "done"),
    step("s4", "Write the report", 0, "done"),
  ],
  messages: [
    user("u1", "Watch the logs"),
    assistant("a1", [todo(["s1", "s2", "s3", "s4"], { s1: "completed", s2: "completed", s3: "completed", s4: "completed" })]),
  ],
  live: false,
};

/* An earnings run: three declared reviewers on loop child s3.2, two passes. */
export const REVIEWERS = [
  { name: "Financial Expert", role: "Checks the numbers as a reviewer" },
  { name: "Risk Analyst", role: "Looks for risks as a reviewer" },
  { name: "Persuasiveness Expert", role: "Judges the argument as a reviewer" },
];
export const earningsOverview: OverviewStep[] = [
  action("s1", "Gather the filings"),
  action("s2", "Write the draft"),
  {
    ...action("s3", "Review until accepted"),
    kind: "loop",
    maxPasses: 3,
    children: [action("s3.1", "Revise the draft"), action("s3.2", "Review the draft", { agents: REVIEWERS })],
  },
  action("s4", "Write the final report"),
];
export const E_IDS = ["s1", "s2", "s3", "s3.1", "s3.2", "s4"];
const T0 = Date.UTC(2026, 10, 9, 9, 0, 0);
export const EARNINGS_T0 = T0;
export const earnings = {
  overviewSteps: earningsOverview,
  steps: [
    step("s1", "Gather the filings", 0, "done", { startedAt: new Date(T0).toISOString(), finishedAt: new Date(T0 + 60_000).toISOString() }),
    step("s2", "Write the draft", 0, "done"),
    step("s3", "Review until accepted", 0, "done"),
    step("s3.1", "Revise the draft", 1, "done"),
    step("s3.2", "Review the draft", 1, "done"),
    step("s4", "Write the final report", 0, "done"),
  ],
  messages: [
    user("u1", "Grade the Q3 earnings"),
    assistant("a1", [
      todo(E_IDS, { s1: "in_progress" }),
      call("read", { path: "filings/q3.pdf" }),
      todo(E_IDS, { s1: "completed", s2: "in_progress" }),
      call("write", { path: "drafts/v1.md", content: "draft" }),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "in_progress" }),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("financial expert", "Review drafts/v1.md for the numbers", "done", {
        result: "The margins are wrong.\n\n**Verdict: reject**",
        startedAt: T0 + 120_000,
        endedAt: T0 + 180_000,
      }),
      subagent("Risk Analyst", "Review drafts/v1.md for risks", "done", { result: "Missing the debt risk.\nVerdict: Reject" }),
      subagent("Persuasiveness Expert", "Review drafts/v1.md for the argument", "done", { result: "Reads well.\nVerdict: accept" }),
    ]),
    user("u2", "continue"),
    assistant("a2", [
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "in_progress", "s3.2": "completed" }),
      call("write", { path: "drafts/v2.md", content: "draft 2" }),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "in_progress", "s3.1": "completed", "s3.2": "in_progress" }),
      subagent("Financial Expert", "Review drafts/v2.md for the numbers", "done", {
        blocks: [call("read", { path: "drafts/v2.md" }), text("Numbers check out.\nVerdict: accept")],
      }),
      subagent("Risk Analyst", "Review drafts/v2.md for risks", "done", { result: "Covered.\nVerdict: accept" }),
      subagent("Persuasiveness Expert", "Review drafts/v2.md for the argument", "done", { result: "Still good.\nVerdict: accept" }),
      subagent("Fact checker", "Check the quotes in drafts/v2.md", "done", { result: "Quotes fine.\nVerdict: accept" }),
      todo(E_IDS, { s1: "completed", s2: "completed", s3: "completed", "s3.1": "completed", "s3.2": "completed", s4: "in_progress" }, { startedAt: T0 + 600_000, endedAt: T0 + 600_100 }),
      call("write", { path: "report.md", content: "final" }),
      todo(
        E_IDS,
        { s1: "completed", s2: "completed", s3: "completed", "s3.1": "completed", "s3.2": "completed", s4: "completed" },
        { startedAt: T0 + 900_000, endedAt: T0 + 900_100 },
        { s4: ["report.md"] },
      ),
      text("The report is in report.md."),
    ]),
  ],
  live: false,
};
