import { describe, expect, it } from "vitest";
import { baseAgentName, matchesDeclared, normalizeAgentName } from "./names";

describe("normalizeAgentName", () => {
  it("lowercases, collapses spaces and strips a trailing version, pass, round or count", () => {
    expect(normalizeAgentName("Clarity Reviewer for bike lock tagline")).toBe("clarity reviewer for bike lock tagline");
    expect(normalizeAgentName("Clarity Reviewer for bike lock tagline v2")).toBe("clarity reviewer for bike lock tagline");
    expect(normalizeAgentName("  Brand   Reviewer V3 ")).toBe("brand reviewer");
    expect(normalizeAgentName("Financial Expert - pass 3")).toBe("financial expert");
    expect(normalizeAgentName("Risk Analyst, round 2")).toBe("risk analyst");
    expect(normalizeAgentName("Risk Analyst: version 2")).toBe("risk analyst");
  });

  it("keeps #n and (n) ordinals: they tell parallel agents apart", () => {
    expect(normalizeAgentName("Helper #1")).toBe("helper #1");
    expect(normalizeAgentName("Helper #2")).not.toBe(normalizeAgentName("Helper #1"));
    expect(normalizeAgentName("Financial Expert (2)")).toBe("financial expert (2)");
    expect(normalizeAgentName("Helper 2")).toBe("helper 2");
  });

  it("keeps numbers that are part of the name", () => {
    expect(normalizeAgentName("Test 3 baseline")).toBe("test 3 baseline");
    expect(normalizeAgentName("Test 3")).toBe("test 3");
    expect(normalizeAgentName("Review of draft")).toBe("review of draft");
  });
});

describe("baseAgentName", () => {
  it("strips the trailing version but keeps the casing", () => {
    expect(baseAgentName("Clarity Reviewer for bike lock tagline v2")).toBe("Clarity Reviewer for bike lock tagline");
    expect(baseAgentName("Fact checker")).toBe("Fact checker");
  });
});

describe("matchesDeclared", () => {
  it("matches a runtime name that equals or starts with the declared name at a word boundary, case-insensitively", () => {
    expect(matchesDeclared("Clarity Reviewer for bike lock tagline v3", "Clarity Reviewer")).toBe(true);
    expect(matchesDeclared("financial expert", "Financial Expert")).toBe(true);
    expect(matchesDeclared("Risk Analyst: second look", "Risk Analyst")).toBe(true);
    expect(matchesDeclared("Second-opinion Risk Analyst", "Risk Analyst")).toBe(false);
    expect(matchesDeclared("Junior Risk Analyst helper for filings", "Risk Analyst")).toBe(false);
    expect(matchesDeclared("Risk Analysts", "Risk Analyst")).toBe(false);
    expect(matchesDeclared("Brand Reviewer for bike lock tagline", "Clarity Reviewer")).toBe(false);
    expect(matchesDeclared("Anything", "  ")).toBe(false);
  });
});
