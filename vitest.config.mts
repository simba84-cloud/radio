import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Three projects, because the suite needs two different environments and two
 * different setups:
 *
 *  unit   — pure functions. No I/O, no DOM, runs in milliseconds.
 *  db     — the ratings invariants, against a real Postgres. The guarantee
 *           under test is a UNIQUE constraint, so mocking `pg` would only
 *           test the mock. Serialized: every file shares one table.
 *  client — components and hooks in jsdom.
 *
 * `.db.test.ts` is the marker that routes a file to the db project, wherever
 * it lives — route handlers are DB tests too, since they call through to the
 * real queries.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          exclude: ["**/*.db.test.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "db",
          environment: "node",
          include: ["**/*.db.test.ts"],
          setupFiles: ["./test/setup-db.ts"],
          // One table, shared across files: don't let them truncate each other.
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "client",
          environment: "jsdom",
          include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
          exclude: ["**/*.db.test.ts"],
          setupFiles: ["./test/setup-client.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/components/**/*.ts", "app/api/**/*.ts"],
      // Thresholds only where they mean something. A global number would push
      // toward writing the low-value tests this suite deliberately skips.
      thresholds: {
        "lib/**": { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
});
