// `tauri-plugin-sql` (v2.4) wraps SQLite in a multi-connection sqlx Pool.
// Every `db.execute()` call acquires a different connection, which means a
// manual `BEGIN ... COMMIT` pattern across multiple `execute` calls is
// fundamentally unsafe (the BEGIN sits on connection A while the INSERTs run
// on connections B/C/D, and the result is intermittent `SQLITE_BUSY` errors).
//
// We can't change the pool from JS, so the next-best thing is to serialize
// our multi-statement write batches at the JS layer. Combined with WAL mode
// (which is set persistently in the SQLite file header), this eliminates the
// "database is locked" errors.

let chain: Promise<unknown> = Promise.resolve();

/** Run a write batch with exclusive access to the DB layer. */
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  // Keep the chain alive even on rejection so a single failure does not
  // permanently break subsequent saves.
  chain = next.catch(() => undefined);
  return next;
}
