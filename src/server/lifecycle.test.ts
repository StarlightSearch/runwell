import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { acquire, decide, idleWatch, probe, readServerInfo } from "./lifecycle";
import { paths } from "./paths";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";

const home = () => paths(mkdtempSync(join(tmpdir(), "workflows-life-")));

describe("decide", () => {
  it.each([
    [null, "0.1.0", "start"],
    [{ version: "0.1.0", activeRuns: 0 }, "0.1.0", "reuse"],
    [{ version: "0.1.0", activeRuns: 0 }, "0.2.0", "replace"],
    [{ version: "0.1.0", activeRuns: 1 }, "0.2.0", "reuse"],
    [{ version: "0.3.0", activeRuns: 0 }, "0.2.0", "reuse"],
    [{ version: "0.10.0", activeRuns: 0 }, "0.9.0", "reuse"],
  ] as const)("%o vs %s -> %s", (existing, mine, want) => expect(decide(existing, mine)).toBe(want));
});

describe("acquire", () => {
  it("exactly one of two racing acquires wins", async () => {
    const p = home();
    const got = await Promise.all([acquire(p, 0), acquire(p, 0)]);
    expect(got.filter(Boolean)).toHaveLength(1);
    got.forEach((g) => g?.release());
  });

  it("takes over a lock whose pid is dead", async () => {
    const p = home();
    writeFileSync(p.lock, JSON.stringify({ pid: 2 ** 22 + 12345 }));
    const got = await acquire(p, 0);
    expect(got).not.toBeNull();
    got!.release();
  });

  it("takes over a lock whose pid now belongs to an unrelated live process", async () => {
    const p = home();
    const other = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      writeFileSync(p.lock, JSON.stringify({ pid: other.pid }));
      const got = await acquire(p, 0);
      expect(got).not.toBeNull();
      got!.release();
    } finally {
      other.kill();
    }
  });

  it("probe ignores a server on that port with a different pid", async () => {
    const srv = createHttpServer((_q, r) => r.end(JSON.stringify({ ok: true, version: "0.1.0", activeRuns: 0, pid: 424242 })));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    expect(await probe({ pid: 1, port, token: "t", version: "0.1.0" })).toBeNull();
    expect(await probe({ pid: 424242, port, token: "t", version: "0.1.0" })).toMatchObject({ ok: true });
    srv.close();
  });

  it("picks another port when the wanted one is taken, and writes server.json mode 600 with a token", async () => {
    const p = home();
    const busy = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => busy.once("listening", r));
    const port = (busy.address() as { port: number }).port;
    const got = await acquire(p, port);
    expect(got!.info.port).not.toBe(port);
    expect(got!.info.token).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(p.serverJson).mode & 0o777).toBe(0o600);
    expect(readServerInfo(p)).toEqual(got!.info);
    got!.release();
    busy.close();
  });

  it("release removes the lock so the next acquire succeeds", async () => {
    const p = home();
    const a = await acquire(p, 0);
    a!.release();
    const b = await acquire(p, 0);
    expect(b).not.toBeNull();
    b!.release();
  });
});

describe("idleWatch", () => {
  it("fires once after idleMs with no touch, never while busy", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    let now = 0;
    let busy = false;
    const onIdle = vi.fn();
    const w = idleWatch({ idleMs: 1000, isBusy: () => busy, onIdle, now: () => now });
    now = 600; vi.advanceTimersByTime(600);
    w.touch();
    now = 1500; vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    busy = true;
    now = 5000; vi.advanceTimersByTime(3500);
    expect(onIdle).not.toHaveBeenCalled();
    busy = false;
    now = 7000; vi.advanceTimersByTime(2000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    now = 9000; vi.advanceTimersByTime(2000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    w.stop();
    vi.useRealTimers();
  });
});
