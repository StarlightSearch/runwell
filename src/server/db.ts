/**
 * SQLite through Node's built-in `node:sqlite` when it exists, else the WebAssembly build
 * `node-sqlite3-wasm`. Neither needs a compiler at install time.
 */
import { MIGRATIONS, SCHEMA_VERSION } from "./schema";

export type Param = string | number | null;
export interface Db {
  run(sql: string, ...params: Param[]): void;
  get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[];
  exec(sql: string): void;
  tx<T>(fn: () => T): T;
  close(): void;
}
export type Backend = "node" | "wasm";

export async function hasNodeSqlite(): Promise<boolean> {
  try {
    const m = await import("node:sqlite");
    return typeof m.DatabaseSync === "function";
  } catch {
    return false;
  }
}

/** Plain objects: node:sqlite returns null-prototype rows, which compare oddly in tests and JSON. */
const plain = <T>(row: unknown): T => (row && typeof row === "object" ? ({ ...(row as object) } as T) : (row as T));

function withTx(db: Omit<Db, "tx">): Db {
  let depth = 0;
  return {
    ...db,
    tx<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec("BEGIN");
      depth++;
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      } finally {
        depth--;
      }
    },
  };
}

export async function openDbWith(backend: Backend, file: string): Promise<Db> {
  if (backend === "node") {
    const { DatabaseSync } = await import("node:sqlite");
    const d = new DatabaseSync(file);
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    return withTx({
      run: (sql, ...p) => void d.prepare(sql).run(...p),
      get: <T>(sql: string, ...p: Param[]) => plain<T | undefined>(d.prepare(sql).get(...p)),
      all: <T>(sql: string, ...p: Param[]) => d.prepare(sql).all(...p).map((r) => plain<T>(r)),
      exec: (sql) => d.exec(sql),
      close: () => d.close(),
    });
  }
  const { Database } = (await import("node-sqlite3-wasm")).default as typeof import("node-sqlite3-wasm");
  const d = new Database(file);
  d.exec("PRAGMA busy_timeout = 3000;");
  return withTx({
    run: (sql, ...p) => void d.run(sql, p),
    get: <T>(sql: string, ...p: Param[]) => plain<T | undefined>(d.get(sql, p) ?? undefined),
    all: <T>(sql: string, ...p: Param[]) => d.all(sql, p).map((r) => plain<T>(r)),
    exec: (sql) => d.exec(sql),
    close: () => d.close(),
  });
}

export async function openDb(file: string): Promise<Db> {
  return openDbWith((await hasNodeSqlite()) ? "node" : "wasm", file);
}

/** Applies every migration above the file's `user_version`. */
export function migrate(db: Db): void {
  const current = db.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v}`);
    });
  }
}
