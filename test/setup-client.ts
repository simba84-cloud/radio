import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * jsdom ships no media stack at all: HTMLMediaElement's transport methods throw
 * "Not implemented", and MediaSource simply doesn't exist. use-hls-audio drives
 * both, so stub them here rather than in each test.
 *
 * These make the *control flow* testable — which level gets pinned, which
 * branch a browser takes. They decode nothing. Actual audio output can't be
 * asserted in any headless environment; verify that by ear.
 */
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, "load", {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

// Default: a browser that can decode FLAC through MSE. Individual tests
// override this to exercise the AAC fallback.
Object.defineProperty(globalThis, "MediaSource", {
  configurable: true,
  writable: true,
  value: { isTypeSupported: vi.fn().mockReturnValue(true) },
});

afterEach(() => {
  cleanup();
  // Restore any stubbed global first — a test may have replaced localStorage
  // with one that throws, and teardown must not depend on it behaving.
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // Storage is unavailable; nothing to clear.
  }
  vi.clearAllMocks();
});
