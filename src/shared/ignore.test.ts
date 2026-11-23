import { expect, it } from "vitest";
import { DEFAULT_IGNORED, isIgnored } from "./ignore";

it("matches patterns whole-string with * as any run", () => {
  expect(isIgnored("superpowers:brainstorming", ["superpowers:*"])).toBe(true);
  expect(isIgnored("motion-ad", ["motion"])).toBe(false);
  expect(isIgnored("motion-ad", ["motion*"])).toBe(true);
  expect(isIgnored("Motion-ad", ["motion*"])).toBe(false);
  expect(isIgnored("a.b", ["a?b"])).toBe(false);
  expect(isIgnored("runwell:improver", DEFAULT_IGNORED)).toBe(true);
});
