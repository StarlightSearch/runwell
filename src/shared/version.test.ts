import { expect, it } from "vitest";
import { VERSION } from "./version";
it("has a version string", () => expect(VERSION).toMatch(/^\d+\.\d+\.\d+/));
