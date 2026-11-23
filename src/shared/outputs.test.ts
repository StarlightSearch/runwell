import { expect, it } from "vitest";
import { mimeOf, outputKind } from "./outputs";

it("kinds by extension", () => {
  expect(outputKind("a/b.MP4")).toBe("video");
  expect(outputKind("x.tsx")).toBe("text");
  expect(outputKind("x.bin")).toBe("other");
  expect(outputKind("deck.pdf")).toBe("pdf");
  expect(outputKind("page.html")).toBe("html");
  expect(outputKind("README.md")).toBe("markdown");
  expect(outputKind("cover.webp")).toBe("image");
  expect(outputKind("voice.mp3")).toBe("audio");
  expect(outputKind("Makefile")).toBe("other");
});
it("mime types", () => {
  expect(mimeOf("a.mp4")).toBe("video/mp4");
  expect(mimeOf("a.html")).toBe("text/html; charset=utf-8");
  expect(mimeOf("a.unknown")).toBe("application/octet-stream");
});
