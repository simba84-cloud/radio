import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The store caches the volume in a module-level variable, so a plain import
 * would carry one test's value into the next. Every test re-imports a fresh
 * copy of the module.
 */
async function freshStore() {
  vi.resetModules();
  return import("./volume-store");
}

const DEFAULT = 0.8;

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("reading", () => {
  test("falls back to the default when nothing is stored", async () => {
    const { getVolume } = await freshStore();
    expect(getVolume()).toBe(DEFAULT);
  });

  test("restores a stored value", async () => {
    window.localStorage.setItem("radiocalico:volume", "0.42");
    const { getVolume } = await freshStore();
    expect(getVolume()).toBe(0.42);
  });

  test("clamps a stored value into 0..1", async () => {
    window.localStorage.setItem("radiocalico:volume", "5");
    expect((await freshStore()).getVolume()).toBe(1);

    window.localStorage.setItem("radiocalico:volume", "-3");
    expect((await freshStore()).getVolume()).toBe(0);
  });

  test("falls back to the default for unparseable junk", async () => {
    for (const junk of ["", "loud", "NaN", "undefined"]) {
      window.localStorage.setItem("radiocalico:volume", junk);
      expect((await freshStore()).getVolume()).toBe(DEFAULT);
    }
  });

  test("keeps a stored zero rather than treating it as absent", async () => {
    window.localStorage.setItem("radiocalico:volume", "0");
    expect((await freshStore()).getVolume()).toBe(0);
  });

  test("the server snapshot is always the default", async () => {
    window.localStorage.setItem("radiocalico:volume", "0.1");
    const { getServerVolume } = await freshStore();
    // Hydration depends on this: the server can't know the stored value, so it
    // must render the same thing every time.
    expect(getServerVolume()).toBe(DEFAULT);
  });
});

describe("writing", () => {
  test("persists and reads back", async () => {
    const { storeVolume, getVolume } = await freshStore();
    storeVolume(0.25);

    expect(getVolume()).toBe(0.25);
    expect(window.localStorage.getItem("radiocalico:volume")).toBe("0.25");
  });

  test("clamps what it stores", async () => {
    const { storeVolume, getVolume } = await freshStore();
    storeVolume(9);
    expect(getVolume()).toBe(1);

    storeVolume(-9);
    expect(getVolume()).toBe(0);
  });

  test("notifies subscribers", async () => {
    const { storeVolume, subscribe } = await freshStore();
    const listener = vi.fn();
    subscribe(listener);

    storeVolume(0.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("stops notifying after unsubscribe", async () => {
    const { storeVolume, subscribe } = await freshStore();
    const listener = vi.fn();
    subscribe(listener)();

    storeVolume(0.5);
    expect(listener).not.toHaveBeenCalled();
  });

  test("notifies every subscriber", async () => {
    const { storeVolume, subscribe } = await freshStore();
    const [a, b] = [vi.fn(), vi.fn()];
    subscribe(a);
    subscribe(b);

    storeVolume(0.3);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

/** Safari's private mode and friends throw on localStorage access. */
describe("when storage is unavailable", () => {
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    clear: () => {},
  };

  test("reading falls back to the default instead of throwing", async () => {
    vi.stubGlobal("localStorage", throwing);
    const { getVolume } = await freshStore();
    expect(getVolume()).toBe(DEFAULT);
  });

  test("writing still updates the session and notifies", async () => {
    vi.stubGlobal("localStorage", throwing);
    const { storeVolume, getVolume, subscribe } = await freshStore();
    const listener = vi.fn();
    subscribe(listener);

    expect(() => storeVolume(0.6)).not.toThrow();
    // Volume works for this visit; it just won't survive to the next one.
    expect(getVolume()).toBe(0.6);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
