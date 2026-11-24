import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORED, isIgnored, marketplacePattern, pluginPattern } from "./ignore";

it("matches patterns whole-string with * as any run", () => {
  expect(isIgnored("superpowers:brainstorming", ["superpowers:*"])).toBe(true);
  expect(isIgnored("motion-ad", ["motion"])).toBe(false);
  expect(isIgnored("motion-ad", ["motion*"])).toBe(true);
  expect(isIgnored("Motion-ad", ["motion*"])).toBe(false);
  expect(isIgnored("a.b", ["a?b"])).toBe(false);
  expect(isIgnored("workflows:improver", DEFAULT_IGNORED)).toBe(true);
});

describe("ignoring a whole marketplace", () => {
  it("@name matches every skill of a plugin from that marketplace, and nothing without one", () => {
    expect(isIgnored("superpowers:brainstorming", ["@claude-plugins-official"], "claude-plugins-official")).toBe(true);
    expect(isIgnored("superpowers:brainstorming", ["@claude-*"], "claude-plugins-official")).toBe(true);
    expect(isIgnored("superpowers:brainstorming", ["@other"], "claude-plugins-official")).toBe(false);
    expect(isIgnored("motion-ad", ["@claude-plugins-official"], null)).toBe(false);
    expect(isIgnored("@claude-plugins-official", ["@claude-plugins-official"], null)).toBe(false);
  });
  it("the plugin and marketplace patterns", () => {
    expect(pluginPattern("superpowers")).toBe("superpowers:*");
    expect(marketplacePattern("mkt")).toBe("@mkt");
    expect(isIgnored("superpowers:x", [pluginPattern("superpowers")])).toBe(true);
  });
});
