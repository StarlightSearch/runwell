import { expect, it } from "vitest";
import { parseSkillMd } from "./skill-md";

it("reads name and a folded description", () => {
  expect(parseSkillMd("---\nname: motion-ad\ndescription: >\n  15s ads,\n  rendered\n---\n# x")).toEqual({ name: "motion-ad", description: "15s ads, rendered", warning: null });
});
it("reads quoted values and a literal block", () => {
  expect(parseSkillMd("---\nname: \"seo audit\"\ndescription: |\n  line one\n  line two\n---\n")).toEqual({ name: "seo audit", description: "line one\nline two", warning: null });
  expect(parseSkillMd("---\nname: 'x'\ndescription: plain words: with a colon\n---\n").description).toBe("plain words: with a colon");
});
it("gives nulls and a warning when there is no header", () => {
  expect(parseSkillMd("no header")).toEqual({ name: null, description: null, warning: "Could not read this skill's header" });
});
it("gives a warning for an unclosed header", () => {
  expect(parseSkillMd("---\nname: a\n").warning).toBe("Could not read this skill's header");
});
it("handles Windows line endings", () => {
  expect(parseSkillMd("---\r\nname: a\r\ndescription: b\r\n---\r\n").name).toBe("a");
});
it("returns a 2 MB input in under 200 ms", () => {
  const big = "---\nname: big\ndescription: " + "x".repeat(2_000_000) + "\n---\n";
  const t = performance.now();
  parseSkillMd(big);
  expect(performance.now() - t).toBeLessThan(200);
});
