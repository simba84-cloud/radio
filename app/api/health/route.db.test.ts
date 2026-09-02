import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { pool } from "@/lib/db";

describe("GET /api/health", () => {
  test("reports the database up, with its clock", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({ ok: true, db: "up" });
    expect(Number.isNaN(Date.parse(body.now))).toBe(false);
  });

  test("503s with a described error when the query fails", async () => {
    const spy = vi
      .spyOn(pool, "query")
      .mockRejectedValueOnce(new Error("connection terminated"));

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      db: "down",
      error: "connection terminated",
    });

    spy.mockRestore();
  });

  /**
   * pg throws an AggregateError (one entry per resolved address) whose own
   * .message is empty — the reason describe() recurses instead of reading it.
   */
  test("unwraps an empty-message AggregateError into its causes", async () => {
    const causes = [
      Object.assign(new Error(""), {
        code: "ECONNREFUSED",
        address: "127.0.0.1",
        port: 55432,
      }),
      Object.assign(new Error(""), {
        code: "ECONNREFUSED",
        address: "::1",
        port: 55432,
      }),
    ];
    const spy = vi
      .spyOn(pool, "query")
      .mockRejectedValueOnce(new AggregateError(causes, ""));

    const response = await GET();
    expect(response.status).toBe(503);

    const { error } = await response.json();
    expect(error).toBe(
      "ECONNREFUSED (127.0.0.1:55432); ECONNREFUSED (::1:55432)",
    );

    spy.mockRestore();
  });

  test("falls back to a string for a non-Error rejection", async () => {
    const spy = vi.spyOn(pool, "query").mockRejectedValueOnce("boom");

    const response = await GET();
    expect(await response.json()).toMatchObject({ error: "boom" });

    spy.mockRestore();
  });
});
