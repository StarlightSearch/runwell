import { describe, expect, it } from "vitest";
import { withoutNumber } from "./graph-canvas";

describe("withoutNumber", () => {
  it("drops a leading number that matches the tile, and nothing else", () => {
    expect(withoutNumber("1. Read the brief", "1")).toBe("Read the brief");
    expect(withoutNumber("2.1 Write the draft", "2.1")).toBe("Write the draft");
    expect(withoutNumber("3) Publish", "3")).toBe("Publish");
    expect(withoutNumber("2.1 Write the draft", "2")).toBe("2.1 Write the draft");
    expect(withoutNumber("Install LiteParse", "3")).toBe("Install LiteParse");
    expect(withoutNumber("100 ways", "1")).toBe("100 ways");
  });
});
