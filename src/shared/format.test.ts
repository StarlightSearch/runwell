import { expect, it } from "vitest";
import { formatAgo, formatBytes, formatDate, formatDateTime, formatDuration } from "./format";

it("dates are dd/mm/yyyy", () => {
  expect(formatDate(Date.UTC(2026, 10, 23, 12))).toBe("23/11/2026");
  expect(formatDateTime(new Date(2026, 10, 3, 14, 5).getTime())).toBe("03/11/2026 14:05");
});
it("durations", () => {
  expect(formatDuration(32_000)).toBe("32s");
  expect(formatDuration(110_000)).toBe("1m 50s");
  expect(formatDuration(3_840_000)).toBe("1h 04m");
  expect(formatDuration(400)).toBe("0s");
});
it("ago", () => {
  const now = new Date(2026, 10, 23, 12).getTime();
  expect(formatAgo(now - 20_000, now)).toBe("just now");
  expect(formatAgo(now - 5 * 60_000, now)).toBe("5 min ago");
  expect(formatAgo(now - 3 * 3_600_000, now)).toBe("3 hours ago");
  expect(formatAgo(now - 3 * 86_400_000, now)).toBe("3 days ago");
  expect(formatAgo(now - 40 * 86_400_000, now)).toBe(formatDate(now - 40 * 86_400_000));
});
it("bytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(129 * 1024 * 1024)).toBe("129 MB");
});
