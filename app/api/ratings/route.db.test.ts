import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * next/headers' cookies() throws outside a request scope, so the route gets a
 * jar it can read and write. Hoisted, because vi.mock is.
 */
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

const { GET, POST } = await import("@/app/api/ratings/route");

const LISTENER_COOKIE = "rc_listener";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const get = (params: Record<string, string>) =>
  GET(
    new Request(
      `http://localhost/api/ratings?${new URLSearchParams(params)}`,
    ),
  );

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const track = { artist: "Led Zeppelin", title: "Kashmir" };

beforeEach(() => jar.clear());

describe("GET /api/ratings", () => {
  test("returns the tally for a track", async () => {
    await post({ ...track, rating: 1 });
    jar.clear(); // a different listener

    const response = await get(track);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ up: 1, down: 0, mine: null });
  });

  test("reports this listener's own vote", async () => {
    await post({ ...track, rating: -1 });

    expect(await (await get(track)).json()).toMatchObject({ mine: -1 });
  });

  test("400s without artist or title", async () => {
    expect((await get({ artist: "A" })).status).toBe(400);
    expect((await get({ title: "B" })).status).toBe(400);
    expect((await get({})).status).toBe(400);
  });

  test("400s on blank-but-present values", async () => {
    expect((await get({ artist: "   ", title: "B" })).status).toBe(400);
  });

  /**
   * The cookie value is interpolated into a ::uuid cast, so a malformed one
   * must be rejected in the route rather than raising in Postgres.
   */
  test("ignores a malformed listener cookie instead of erroring", async () => {
    for (const bad of ["not-a-uuid", "'; drop table track_ratings; --", ""]) {
      jar.set(LISTENER_COOKIE, bad);
      const response = await get(track);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mine: null });
    }
  });
});

describe("POST /api/ratings", () => {
  test("accepts a first vote with 201 and the new tally", async () => {
    const response = await post({ ...track, rating: 1 });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      up: 1,
      down: 0,
      mine: 1,
      accepted: true,
    });
  });

  test("issues an httpOnly uuid cookie on the first vote", async () => {
    await post({ ...track, rating: 1 });
    expect(jar.get(LISTENER_COOKIE)).toMatch(UUID);
  });

  test("reuses an existing listener cookie rather than reissuing", async () => {
    await post({ ...track, rating: 1 });
    const first = jar.get(LISTENER_COOKIE);

    await post({ artist: "Slowdive", title: "Alison", rating: 1 });
    expect(jar.get(LISTENER_COOKIE)).toBe(first);
  });

  test("409s on a repeat vote, still returning the authoritative tally", async () => {
    await post({ ...track, rating: 1 });

    const response = await post({ ...track, rating: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      up: 1,
      down: 0,
      mine: 1,
      accepted: false,
    });
  });

  test("409s on a change of mind and keeps the original vote", async () => {
    await post({ ...track, rating: 1 });

    const response = await post({ ...track, rating: -1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ up: 1, down: 0, mine: 1 });
  });

  test("400s on a rating that isn't 1 or -1", async () => {
    for (const rating of [0, 2, "1", null, undefined]) {
      expect((await post({ ...track, rating })).status).toBe(400);
    }
  });

  test("400s on a missing track or invalid JSON body", async () => {
    expect((await post({ rating: 1 })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
  });

  test("a malformed cookie earns a fresh id rather than an error", async () => {
    jar.set(LISTENER_COOKIE, "not-a-uuid");

    const response = await post({ ...track, rating: 1 });
    expect(response.status).toBe(201);
    expect(jar.get(LISTENER_COOKIE)).toMatch(UUID);
  });
});
