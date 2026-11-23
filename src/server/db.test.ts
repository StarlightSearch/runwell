import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasNodeSqlite, migrate, openDbWith, type Backend } from "./db";
import { SCHEMA_VERSION } from "./schema";

const file = () => join(mkdtempSync(join(tmpdir(), "runwell-db-")), "runwell.db");
const nodeOk = await hasNodeSqlite();

describe.each(["node", "wasm"] as Backend[])("db (%s)", (backend) => {
  const maybe = backend === "node" && !nodeOk ? it.skip : it;

  maybe("migrates once; a second migrate is a no-op", async () => {
    const db = await openDbWith(backend, file());
    migrate(db);
    migrate(db);
    expect(db.get<{ user_version: number }>("PRAGMA user_version")!.user_version).toBe(SCHEMA_VERSION);
    db.close();
  });

  maybe("inserts and reads back a run row", async () => {
    const db = await openDbWith(backend, file());
    migrate(db);
    db.run("INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", "r1", "personal:a", "a", 1, "button", "queued", 123);
    expect(db.get("SELECT id, n, status, created_at FROM runs WHERE id = ?", "r1")).toEqual({ id: "r1", n: 1, status: "queued", created_at: 123 });
    expect(db.all("SELECT id FROM runs")).toEqual([{ id: "r1" }]);
    db.close();
  });

  maybe("tx rolls back on throw", async () => {
    const db = await openDbWith(backend, file());
    migrate(db);
    expect(() => db.tx(() => {
      db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", "s1", 1);
      throw new Error("boom");
    })).toThrow("boom");
    expect(db.all("SELECT * FROM auth_sessions")).toEqual([]);
    db.tx(() => db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", "s2", 2));
    expect(db.all("SELECT id FROM auth_sessions")).toEqual([{ id: "s2" }]);
    db.close();
  });

  maybe("persists across reopen", async () => {
    const f = file();
    const a = await openDbWith(backend, f);
    migrate(a);
    a.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", "s1", 1);
    a.close();
    const b = await openDbWith(backend, f);
    migrate(b);
    expect(b.all("SELECT id FROM auth_sessions")).toEqual([{ id: "s1" }]);
    b.close();
  });
});
