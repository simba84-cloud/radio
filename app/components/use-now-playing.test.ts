import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useNowPlaying } from "./use-now-playing";

const TRACK = { artist: "Talk Talk", title: "Ascension Day" };
const NEXT = { artist: "Slowdive", title: "Alison" };

let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown) => ({ ok: true, json: async () => body });

/**
 * The hook reschedules itself with window.setTimeout, so the clock is faked for
 * the whole file — installing it later would leave the first real timer running
 * outside the test's control. `tick` advances it and flushes the promise the
 * poll is waiting on, inside act() so React can apply the state updates.
 */
const tick = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue(ok(TRACK));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

test("exposes the feed's metadata after the first poll", async () => {
  const { result } = renderHook(() => useNowPlaying());
  expect(result.current.metadata).toBeNull();

  await tick();
  expect(result.current.metadata).toEqual(TRACK);
  expect(result.current.stale).toBe(false);
});

test("busts the CloudFront cache on every request", async () => {
  renderHook(() => useNowPlaying());
  await tick();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toMatch(/metadatav2\.json\?t=\d+/);
  expect(init).toMatchObject({ cache: "no-store" });
});

test("polls again after 10s", async () => {
  const { result } = renderHook(() => useNowPlaying());
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockResolvedValue(ok(NEXT));
  await tick(10_000);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.metadata).toEqual(NEXT);
});

test("does not poll faster than the interval", async () => {
  renderHook(() => useNowPlaying());
  await tick();

  await tick(9_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("marks the feed stale on an HTTP error but keeps the last track", async () => {
  const { result } = renderHook(() => useNowPlaying());
  await tick();

  fetchMock.mockResolvedValue({ ok: false, status: 502 });
  await tick(10_000);

  expect(result.current.stale).toBe(true);
  // Keep showing the last known track rather than blanking the page.
  expect(result.current.metadata).toEqual(TRACK);
});

test("marks the feed stale when the network throws", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useNowPlaying());

  await tick();
  expect(result.current.stale).toBe(true);
  expect(result.current.metadata).toBeNull();
});

test("recovers from stale once the feed answers again", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => useNowPlaying());

  await tick();
  expect(result.current.stale).toBe(true);

  await tick(10_000);
  expect(result.current.stale).toBe(false);
  expect(result.current.metadata).toEqual(TRACK);
});

test("keeps polling after a failure rather than giving up", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  renderHook(() => useNowPlaying());

  await tick();
  await tick(10_000);
  await tick(10_000);

  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("aborts the request and stops polling on unmount", async () => {
  const { unmount } = renderHook(() => useNowPlaying());
  await tick();

  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);

  unmount();
  expect(signal.aborted).toBe(true);

  await tick(30_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
