import { describe, expect, test } from "vitest";
import { isRatingValue, trackRatingKey } from "@/lib/ratings";

/**
 * These are pure, but they are the highest-consequence pure functions in the
 * project: trackRatingKey decides whether two plays of the same song share a
 * tally. When it is wrong nothing errors — the votes just scatter.
 */
describe("trackRatingKey", () => {
  test("collapses the feed's incidental double spaces", () => {
    // Straight from a live request: "Heroes  (2017 Remaster)".
    expect(trackRatingKey("David Bowie", "Heroes  (2017 Remaster)")).toBe(
      trackRatingKey("David Bowie", "Heroes (2017 Remaster)"),
    );
  });

  test("ignores case and surrounding whitespace", () => {
    expect(trackRatingKey("  Led Zeppelin ", "KASHMIR")).toBe(
      trackRatingKey("led zeppelin", "kashmir"),
    );
  });

  test("treats tabs and newlines as whitespace too", () => {
    expect(trackRatingKey("Talk\tTalk", "Ascension\nDay")).toBe(
      trackRatingKey("Talk Talk", "Ascension Day"),
    );
  });

  test("normalizes compatibility and composed forms (NFKC)", () => {
    // Composed "é" vs "e" + combining acute — the same song either way.
    expect(trackRatingKey("Beyoncé", "Halo")).toBe(
      trackRatingKey("Beyoncé", "Halo"),
    );
    // Fullwidth characters fold to ASCII under NFKC.
    expect(trackRatingKey("ＡＩＲ", "Next Door")).toBe(
      trackRatingKey("AIR", "Next Door"),
    );
  });

  test("keeps genuinely different tracks apart", () => {
    expect(trackRatingKey("A", "B")).not.toBe(trackRatingKey("A", "C"));
    expect(trackRatingKey("A", "B")).not.toBe(trackRatingKey("C", "B"));
  });

  test("JSON encoding stops a separator collision", () => {
    // The reason the pair is JSON-encoded rather than joined: an artist
    // containing the separator must not be able to impersonate another pair.
    expect(trackRatingKey('a", "b', "c")).not.toBe(
      trackRatingKey("a", 'b", "c'),
    );
  });

  test("is a stable, parseable [artist, title] pair", () => {
    expect(trackRatingKey("Led Zeppelin", "Kashmir")).toBe(
      '["led zeppelin","kashmir"]',
    );
    expect(JSON.parse(trackRatingKey("A B", "C D"))).toEqual(["a b", "c d"]);
  });
});

describe("isRatingValue", () => {
  test("accepts only 1 and -1", () => {
    expect(isRatingValue(1)).toBe(true);
    expect(isRatingValue(-1)).toBe(true);
  });

  test("rejects everything else, including near-misses", () => {
    for (const value of [0, 2, -2, "1", null, undefined, {}, [], NaN, true]) {
      expect(isRatingValue(value)).toBe(false);
    }
  });
});
