import { describe, expect, it } from "vitest";
import { isRunwellFolder } from "./paths";

describe("isRunwellFolder", () => {
  it("matches the data folder, anything inside it, and draw folders; nothing else", () => {
    expect(isRunwellFolder("/home/u/.runwell", "/home/u/.runwell")).toBe(true);
    expect(isRunwellFolder("/home/u/.runwell/runs/abc/work", "/home/u/.runwell")).toBe(true);
    expect(isRunwellFolder("/tmp/runwell-draw-84lM4M", "/home/u/.runwell")).toBe(true);
    expect(isRunwellFolder("/home/u/.runwell-old", "/home/u/.runwell")).toBe(false);
    expect(isRunwellFolder("/home/u/code/runwell", "/home/u/.runwell")).toBe(false);
    expect(isRunwellFolder("/tmp/runwell-draw-x/sub", "/home/u/.runwell")).toBe(false);
  });
});
