import Database from "@tauri-apps/plugin-sql";
import { migrations } from "@/lib/db/migrations";
import { seedReferenceData } from "@/lib/db/seed";
import { purgeExpiredTransientData } from "@/lib/db/cleanup";

let cached: Promise<InstanceType<typeof Database>> | null = null;

export async function getDb(): Promise<InstanceType<typeof Database>> {
  if (!cached) {
    cached = (async () => {
      const db = await Database.load("sqlite:paperplate.db");
      // Pragmas that prevent the SQLITE_BUSY errors we were hitting on
      // concurrent reads + writes. WAL lets readers and writers coexist
      // without blocking each other, busy_timeout retries instead of
      // failing immediately, and synchronous=NORMAL is the standard pair
      // for WAL on a single-user desktop app.
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA synchronous = NORMAL");
      await db.execute("PRAGMA busy_timeout = 5000");
      await db.execute("PRAGMA foreign_keys = ON");
      await applyMigrations(db);
      await seedReferenceData(db);
      // Best-effort retention pass on transient/cache data. Errors here
      // must not block the app from booting — they're logged for triage
      // but not surfaced to the user.
      try {
        await purgeExpiredTransientData(db);
      } catch (err) {
        console.warn("transient data cleanup skipped", err);
      }
      return db;
    })();
  }
  return cached;
}

async function applyMigrations(db: InstanceType<typeof Database>) {
  const rows = await db.select<Array<{ user_version: number }>>(
    "PRAGMA user_version",
  );
  const current = rows[0]?.user_version ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    for (const stmt of m.statements) {
      await db.execute(stmt);
    }
    await db.execute(`PRAGMA user_version = ${m.version}`);
  }
}

export async function resetDbCache() {
  cached = null;
}
