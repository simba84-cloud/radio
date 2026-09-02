import { describe, expect, test } from "vitest";
import {
  formatDuration,
  previousTracks,
  sourceQuality,
  trackKey,
  type TrackMetadata,
} from "@/lib/radio";

describe("previousTracks", () => {
  test("flattens prev_artist_N / prev_title_N into a list, in order", () => {
    const meta: TrackMetadata = {
      prev_artist_1: "Nina Simone",
      prev_title_1: "Sinnerman",
      prev_artist_2: "Talk Talk",
      prev_title_2: "Ascension Day",
    };
    expect(previousTracks(meta)).toEqual([
      { artist: "Nina Simone", title: "Sinnerman" },
      { artist: "Talk Talk", title: "Ascension Day" },
    ]);
  });

  test("skips a pair the feed only half-filled", () => {
    const meta: TrackMetadata = {
      prev_artist_1: "Nina Simone",
      prev_title_1: "Sinnerman",
      prev_artist_2: "Talk Talk", // no matching title
      prev_artist_3: "Slowdive",
      prev_title_3: "Alison",
    };
    expect(previousTracks(meta)).toEqual([
      { artist: "Nina Simone", title: "Sinnerman" },
      { artist: "Slowdive", title: "Alison" },
    ]);
  });

  test("reads at most five, and tolerates a null feed", () => {
    const meta = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        [`prev_artist_${i + 1}`, `Artist ${i + 1}`],
        [`prev_title_${i + 1}`, `Title ${i + 1}`],
      ]).flat(),
    ) as TrackMetadata;

    expect(previousTracks(meta)).toHaveLength(5);
    expect(previousTracks(null)).toEqual([]);
    expect(previousTracks({})).toEqual([]);
  });
});

describe("sourceQuality", () => {
  test("renders bit depth and kHz, trimming a trailing .0", () => {
    expect(sourceQuality({ bit_depth: 16, sample_rate: 44100 })).toBe(
      "16-bit 44.1kHz",
    );
    // 48000 / 1000 = 48.0 — the .0 should not survive.
    expect(sourceQuality({ bit_depth: 24, sample_rate: 48000 })).toBe(
      "24-bit 48kHz",
    );
    expect(sourceQuality({ bit_depth: 24, sample_rate: 96000 })).toBe(
      "24-bit 96kHz",
    );
  });

  test("is null unless the feed gave both halves", () => {
    expect(sourceQuality({ bit_depth: 16 })).toBeNull();
    expect(sourceQuality({ sample_rate: 44100 })).toBeNull();
    expect(sourceQuality({})).toBeNull();
    expect(sourceQuality(null)).toBeNull();
  });
});

describe("trackKey", () => {
  test("distinguishes tracks and survives missing fields", () => {
    expect(trackKey({ artist: "A", title: "B" })).toBe("A|B");
    expect(trackKey({ artist: "A", title: "B" })).not.toBe(
      trackKey({ artist: "A", title: "C" }),
    );
    expect(trackKey(null)).toBe("|");
    expect(trackKey({ artist: "A" })).toBe("A|");
  });
});

describe("formatDuration", () => {
  test("pads seconds and rolls over at a minute", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(3599)).toBe("59:59");
  });

  test("counts past an hour in minutes rather than wrapping", () => {
    expect(formatDuration(3600)).toBe("60:00");
    expect(formatDuration(7325)).toBe("122:05");
  });

  test("floors fractions and clamps negatives to zero", () => {
    expect(formatDuration(65.9)).toBe("1:05");
    expect(formatDuration(-10)).toBe("0:00");
  });
});
