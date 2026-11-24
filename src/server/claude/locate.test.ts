import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_CLAUDE } from "../../../test/fake-claude";
import { checkSignedIn, claudeState, claudeVersion, isAuthError, locateClaude, NOT_FOUND, SIGNED_OUT } from "./auth";

const dir = () => mkdtempSync(join(tmpdir(), "workflows-loc-"));
function exe(folder: string, name = "claude", body = `#!/bin/sh\necho hi\n`, mode = 0o755) {
  mkdirSync(folder, { recursive: true });
  const f = join(folder, name);
  writeFileSync(f, body);
  chmodSync(f, mode);
  return f;
}

describe("locateClaude", () => {
  it("a configured path wins", () => {
    const a = exe(dir());
    const b = exe(dir());
    expect(locateClaude({ configured: a, env: { PATH: join(b, "..") }, home: dir() })).toBe(a);
  });
  it("follows PATH order", () => {
    const one = dir();
    const two = dir();
    exe(one);
    exe(two);
    expect(locateClaude({ configured: null, env: { PATH: `${two}:${one}` }, home: dir() })).toBe(join(two, "claude"));
  });
  it("skips a candidate that is not executable", () => {
    const one = dir();
    const two = dir();
    exe(one, "claude", "x", 0o644);
    exe(two);
    expect(locateClaude({ configured: null, env: { PATH: `${one}:${two}` }, home: dir() })).toBe(join(two, "claude"));
  });
  it("checks the known install folders under home", () => {
    const home = dir();
    const f = exe(join(home, ".local/bin"));
    expect(locateClaude({ configured: null, env: { PATH: "" }, home })).toBe(f);
  });
  it("gives null when nothing is found", () => {
    expect(locateClaude({ configured: "/nonexistent/claude", env: { PATH: "/nonexistent" }, home: dir() })).toBeNull();
  });
});

describe("version and sign-in", () => {
  it("reads the version", async () => {
    expect(await claudeVersion(FAKE_CLAUDE)).toBe("2.1.330");
  });
  it("reads signed in and signed out", async () => {
    expect(await checkSignedIn(FAKE_CLAUDE, { ...process.env, FAKE_CLAUDE_AUTH: "in" })).toBe("in");
    expect(await checkSignedIn(FAKE_CLAUDE, { ...process.env, FAKE_CLAUDE_AUTH: "out" })).toBe("out");
  });
  it("a binary that hangs is unknown, within the timeout", async () => {
    const hang = exe(dir(), "claude", "#!/bin/sh\nsleep 30\n");
    const t = Date.now();
    expect(await checkSignedIn(hang, process.env, 300)).toBe("unknown");
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it("an unrecognised answer is unknown", async () => {
    expect(await checkSignedIn(exe(dir(), "claude", "#!/bin/sh\necho nonsense\n"))).toBe("unknown");
  });
  it("adds no credential to the child's environment", async () => {
    const spy = exe(dir(), "claude", '#!/bin/sh\nenv | grep -c "^ANTHROPIC_\\|^CLAUDE_CODE_OAUTH" > "$SPY_OUT"\necho \'{"loggedIn":true}\'\n');
    const out = join(dir(), "count");
    expect(await checkSignedIn(spy, { ...process.env, SPY_OUT: out })).toBe("in");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(out, "utf8").trim()).toBe(String(Object.keys(process.env).filter((k) => /^ANTHROPIC_|^CLAUDE_CODE_OAUTH/.test(k)).length));
  });
  it("recognises the signed-out stream errors", () => {
    expect(isAuthError("authentication_failed")).toBe(true);
    expect(isAuthError("Not logged in · Please run /login")).toBe(true);
    expect(isAuthError("rate limited")).toBe(false);
  });
});

describe("claudeState", () => {
  it("not found gives the install message", async () => {
    expect(await claudeState({ configured: null, env: { PATH: "" }, home: dir() })).toMatchObject({ found: false, message: NOT_FOUND });
  });
  it("found and signed out gives the sign-in message and mods support", async () => {
    const s = await claudeState({ configured: FAKE_CLAUDE, env: { ...process.env, FAKE_CLAUDE_AUTH: "out" } as NodeJS.ProcessEnv, home: dir() });
    expect(s).toMatchObject({ found: true, path: FAKE_CLAUDE, version: "2.1.330", signedIn: "out", modsSupported: true, message: SIGNED_OUT });
  });
});
