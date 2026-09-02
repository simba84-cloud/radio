import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { query } from "@/lib/db";
import { rateTrack, ratingSummary, trackRatingKey } from "@/lib/ratings";

const ARTIST = "Led Zeppelin";
const TITLE = "Kashmir";
const KEY = trackRatingKey(ARTIST, TITLE);

const listener = () => randomUUID();

async function rowCount(): Promise<number> {
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from track_ratings",
  );
  return row.n;
}

describe("ratingSummary", () => {
  test("is zeroed for a track nobody has rated", async () => {
    expect(await ratingSummary(KEY, listener())).toEqual({
      up: 0,
      down: 0,
      mine: null,
    });
  });

  test("counts up and down separately", async () => {
    await rateTrack(ARTIST, TITLE, listener(), 1);
    await rateTrack(ARTIST, TITLE, listener(), 1);
    await rateTrack(ARTIST, TITLE, listener(), -1);

    const summary = await ratingSummary(KEY, null);
    expect(summary.up).toBe(2);
    expect(summary.down).toBe(1);
  });

  test("reports the caller's own vote, and null for an anonymous caller", async () => {
    const me = listener();
    await rateTrack(ARTIST, TITLE, me, -1);

    expect((await ratingSummary(KEY, me)).mine).toBe(-1);
    expect((await ratingSummary(KEY, listener())).mine).toBeNull();
    expect((await ratingSummary(KEY, null)).mine).toBeNull();
  });

  test("does not leak votes between tracks", async () => {
    await rateTrack(ARTIST, TITLE, listener(), 1);
    await rateTrack("Talk Talk", "Ascension Day", listener(), 1);

    expect((await ratingSummary(KEY, null)).up).toBe(1);
  });
});

describe("rateTrack", () => {
  test("accepts a first vote and returns the updated tally", async () => {
    const { accepted, summary } = await rateTrack(ARTIST, TITLE, listener(), 1);
    expect(accepted).toBe(true);
    expect(summary).toMatchObject({ up: 1, down: 0 });
  });

  test("rejects a second vote from the same listener", async () => {
    const me = listener();
    expect((await rateTrack(ARTIST, TITLE, me, 1)).accepted).toBe(true);

    const second = await rateTrack(ARTIST, TITLE, me, 1);
    expect(second.accepted).toBe(false);
    // The rejection still carries the truth, so the UI can settle on it.
    expect(second.summary).toMatchObject({ up: 1, down: 0, mine: 1 });
    expect(await rowCount()).toBe(1);
  });

  test("rejects a change of mind, keeping the original vote", async () => {
    const me = listener();
    await rateTrack(ARTIST, TITLE, me, 1);

    const flip = await rateTrack(ARTIST, TITLE, me, -1);
    expect(flip.accepted).toBe(false);
    expect(flip.summary).toMatchObject({ up: 1, down: 0, mine: 1 });
  });

  test("counts two different listeners", async () => {
    await rateTrack(ARTIST, TITLE, listener(), 1);
    const second = await rateTrack(ARTIST, TITLE, listener(), 1);
    expect(second.summary.up).toBe(2);
  });

  test("lets one listener rate two different tracks", async () => {
    const me = listener();
    expect((await rateTrack(ARTIST, TITLE, me, 1)).accepted).toBe(true);
    expect((await rateTrack("Slowdive", "Alison", me, 1)).accepted).toBe(true);
  });

  test("stores artist and title verbatim, but keys on the normalized pair", async () => {
    await rateTrack("  Led   Zeppelin ", "KASHMIR", listener(), 1);
    const [row] = await query<{ artist: string; track_key: string }>(
      "select artist, track_key from track_ratings",
    );
    expect(row.artist).toBe("  Led   Zeppelin ");
    expect(row.track_key).toBe(KEY);
  });

  test("pools votes for spellings that normalize together", async () => {
    // The feed's double space must not split one song's tally.
    await rateTrack("David Bowie", "Heroes  (2017 Remaster)", listener(), 1);
    await rateTrack("david bowie", "Heroes (2017 Remaster)", listener(), 1);

    const summary = await ratingSummary(
      trackRatingKey("David Bowie", "Heroes (2017 Remaster)"),
      null,
    );
    expect(summary.up).toBe(2);
    expect(await rowCount()).toBe(2);
  });
});

/**
 * The reason this suite talks to a real Postgres. One vote per listener is a
 * UNIQUE constraint, not a read-then-write — a check-then-insert would let both
 * of two concurrent clicks through, and mocking `pg` would never show it.
 */
describe("concurrency", () => {
  test("two simultaneous votes from one listener: exactly one lands", async () => {
    const me = listener();
    const results = await Promise.all([
      rateTrack(ARTIST, TITLE, me, 1),
      rateTrack(ARTIST, TITLE, me, -1),
    ]);

    expect(results.filter((r) => r.accepted)).toHaveLength(1);
    expect(await rowCount()).toBe(1);
  });

  test("holds under a burst of ten from the same listener", async () => {
    const me = listener();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateTrack(ARTIST, TITLE, me, 1)),
    );

    expect(results.filter((r) => r.accepted)).toHaveLength(1);
    expect(await rowCount()).toBe(1);
  });

  test("concurrent votes from different listeners all land", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => rateTrack(ARTIST, TITLE, listener(), 1)),
    );

    expect(results.filter((r) => r.accepted)).toHaveLength(8);
    expect((await ratingSummary(KEY, null)).up).toBe(8);
  });
});
