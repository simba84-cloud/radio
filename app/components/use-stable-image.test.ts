import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStableImage } from "./use-stable-image";

/**
 * jsdom never loads images, so the off-screen decode is driven by hand: each
 * `new Image()` is captured, and the test fires `load` when it chooses.
 */
class FakeImage extends EventTarget {
  static instances: FakeImage[] = [];
  complete = false;
  naturalWidth = 0;
  #src = "";

  constructor() {
    super();
    FakeImage.instances.push(this);
  }

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
  }

  finishLoading(): void {
    this.complete = true;
    this.naturalWidth = 500;
    this.dispatchEvent(new Event("load"));
  }
}

const latest = () => FakeImage.instances.at(-1)!;

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
});

test("shows nothing until the first image has decoded", () => {
  const { result } = renderHook(() => useStableImage("cover-1.jpg"));
  expect(result.current).toBeNull();

  act(() => latest().finishLoading());
  expect(result.current).toBe("cover-1.jpg");
});

test("holds the old cover on screen until the new one is ready", () => {
  const { result, rerender } = renderHook(({ src }) => useStableImage(src), {
    initialProps: { src: "cover-1.jpg" },
  });
  act(() => latest().finishLoading());

  rerender({ src: "cover-2.jpg" });
  // The point of the hook: no blank frame during the ~1.3-1.7s decode.
  expect(result.current).toBe("cover-1.jpg");

  act(() => latest().finishLoading());
  expect(result.current).toBe("cover-2.jpg");
});

test("keeps the previous cover when the next one never loads", () => {
  const { result, rerender } = renderHook(({ src }) => useStableImage(src), {
    initialProps: { src: "cover-1.jpg" },
  });
  act(() => latest().finishLoading());

  rerender({ src: "broken.jpg" });
  act(() => latest().dispatchEvent(new Event("error")));

  expect(result.current).toBe("cover-1.jpg");
});

test("adopts an already-cached image that completed before the listener attached", () => {
  // The hook's `preload.complete && naturalWidth > 0` branch.
  class CachedImage extends FakeImage {
    override set src(value: string) {
      this.complete = true;
      this.naturalWidth = 500;
      super.src = value;
    }
    override get src(): string {
      return super.src;
    }
  }
  vi.stubGlobal("Image", CachedImage);

  const { result } = renderHook(() => useStableImage("cached.jpg"));
  expect(result.current).toBe("cached.jpg");
});

test("ignores a stale decode that finishes after the track moved on", () => {
  const { result, rerender } = renderHook(({ src }) => useStableImage(src), {
    initialProps: { src: "cover-1.jpg" },
  });
  act(() => latest().finishLoading());

  rerender({ src: "cover-2.jpg" });
  const slow = latest();

  rerender({ src: "cover-3.jpg" });
  act(() => latest().finishLoading()); // cover-3 wins
  act(() => slow.finishLoading()); // cover-2 arrives late

  expect(result.current).toBe("cover-3.jpg");
});

describe("no source", () => {
  test("stays null and creates no image", () => {
    const { result } = renderHook(() => useStableImage(null));
    expect(result.current).toBeNull();
    expect(FakeImage.instances).toHaveLength(0);
  });
});
