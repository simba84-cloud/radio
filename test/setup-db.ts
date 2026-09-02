import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

/**
 * Harness for tests that run against a real Postgres.
 *
 * `lib/db.ts` reads DATABASE_URL at module load and caches the Pool on
 * globalThis, so the variable has to be set here — in a setupFile, which runs
 * before the test module's imports — rather than inside a test.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://radio:radio@localhost:55432/radio_test";

/**
 * Refuse to touch anything but the test database. These tests TRUNCATE, and a
 * stray DATABASE_URL in the environment would otherwise point that at dev data.
 */
const databaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
if (databaseName !== "radio_test") {
  throw new Error(
    `Refusing to run destructive tests against database "${databaseName}". ` +
      `The DB suite only runs against "radio_test" — check TEST_DATABASE_URL.`,
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;

/** Applies db/init/*.sql in filename order, exactly as the container does. */
async function migrate(): Promise<void> {
  const dir = join(process.cwd(), "db", "init");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    for (const file of files) {
      await client.query(readFileSync(join(dir, file), "utf8"));
    }
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  try {
    await migrate();
  } catch (err) {
    throw new Error(
      `Could not prepare ${TEST_DATABASE_URL}. Is the database up ` +
        `(npm run db:up) and does radio_test exist ` +
        `(npm run db:test:create)?\n${(err as Error).message}`,
    );
  }
});

beforeEach(async () => {
  const { query } = await import("@/lib/db");
  await query("truncate track_ratings restart identity");
});

afterAll(async () => {
  // Without this the pool keeps a socket open and vitest never exits.
  const { pool } = await import("@/lib/db");
  await pool.end();
});
