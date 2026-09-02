import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * A stand-in for hls.js. The real library needs a MediaSource and a network,
 * neither of which exists here — but every decision worth testing (which level
 * gets pinned, which branch a browser takes, how fatal errors are handled) is
 * made in our callbacks, and those only need the events.
 */
const { FakeHls, instances } = vi.hoisted(() => {
  const instances: FakeHlsInstance[] = [];

  type Handler = (event: string, data: unknown) => void;

  class FakeHlsInstance {
    static Events = {
      MANIFEST_PARSED: "hlsManifestParsed",
      ERROR: "hlsError",
    } as const;
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
      OTHER_ERROR: "otherError",
    } as const;
    static isSupported = vi.fn(() => true);

    handlers = new Map<string, Handler[]>();
    attachedTo: HTMLMediaElement | null = null;
    loadedSource: string | null = null;
    currentLevel = -1;
    destroy = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    config: unknown;

    constructor(config?: unknown) {
      this.config = config;
      instances.push(this);
    }

    on(event: string, handler: Handler) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    attachMedia(media: HTMLMediaElement) {
      this.attachedTo = media;
    }

    loadSource(url: string) {
      this.loadedSource = url;
    }

    /** Fire an hls.js event at the hook's callbacks. */
    emit(event: string, data: unknown) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(event, data);
      }
    }
  }

  return { FakeHls: FakeHlsInstance, instances };
});

vi.mock("hls.js", () => ({ default: FakeHls }));

const { useHlsAudio } = await import("./use-hls-audio");
const { STREAM_URL } = await import("@/lib/radio");

const FLAC_LEVEL = { audioCodec: "fLaC", attrs: { CODECS: "fLaC" } };
const AAC_LEVEL = { audioCodec: "mp4a.40.2", attrs: { CODECS: "mp4a.40.2" } };

type Player = ReturnType<typeof useHlsAudio>;

function renderPlayer() {
  const result = { current: null as unknown as Player };

  function Harness() {
    const player = useHlsAudio();
    result.current = player;
    return <audio ref={player.audioRef} preload="auto" hidden />;
  }

  const utils = render(<Harness />);
  const audio = utils.container.querySelector("audio")!;
  return { result, audio, ...utils };
}

/** Drive the hook through a play() and let the dynamic import settle. */
async function start(result: { current: Player }) {
  await act(async () => {
    result.current.toggle();
  });
}

const hls = () => instances.at(-1)!;

const setMediaSourceFlac = (supported: boolean) => {
  (
    globalThis.MediaSource as unknown as {
      isTypeSupported: ReturnType<typeof vi.fn>;
    }
  ).isTypeSupported = vi.fn(() => supported);
};

beforeEach(() => {
  instances.length = 0;
  FakeHls.isSupported.mockReturnValue(true);
  setMediaSourceFlac(true);
});

describe("choosing a playback path", () => {
  /**
   * The regression this file exists for. Chrome answers "maybe" to
   * canPlayType("application/vnd.apple.mpegurl") but cannot actually play it,
   * so probing native support first sends Chrome down a path that never plays.
   */
  test("never consults canPlayType when hls.js is supported", async () => {
    const canPlayType = vi.spyOn(HTMLMediaElement.prototype, "canPlayType");
    const { result } = renderPlayer();

    await start(result);

    expect(canPlayType).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
    canPlayType.mockRestore();
  });

  test("attaches hls.js to the element and loads the master playlist", async () => {
    const { result, audio } = renderPlayer();
    await start(result);

    expect(hls().attachedTo).toBe(audio);
    expect(hls().loadedSource).toBe(STREAM_URL);
  });

  test("falls back to native HLS only when hls.js is unsupported", async () => {
    FakeHls.isSupported.mockReturnValue(false);
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("probably");

    const { result, audio } = renderPlayer();
    await start(result);

    expect(instances).toHaveLength(0);
    expect(audio.src).toBe(STREAM_URL);
    expect(result.current.streamQuality).toBe("HLS — native playback");
    canPlayType.mockRestore();
  });

  test("errors when the browser can play HLS neither way", async () => {
    FakeHls.isSupported.mockReturnValue(false);
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("");

    const { result } = renderPlayer();
    await start(result);

    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/can't play HLS/i);
    canPlayType.mockRestore();
  });
});

describe("pinning the lossless variant", () => {
  test("pins the FLAC level so ABR cannot drop to AAC", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() => {
      hls().emit("hlsManifestParsed", { levels: [AAC_LEVEL, FLAC_LEVEL] });
    });

    expect(hls().currentLevel).toBe(1);
    expect(result.current.streamQuality).toBe("FLAC lossless — HLS");
  });

  test("matches the codec case-insensitively, and via attrs.CODECS", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() => {
      hls().emit("hlsManifestParsed", {
        levels: [AAC_LEVEL, { attrs: { CODECS: "FLAC" } }],
      });
    });

    expect(hls().currentLevel).toBe(1);
  });

  test("leaves ABR alone when MSE cannot decode FLAC", async () => {
    setMediaSourceFlac(false);
    const { result } = renderPlayer();
    await start(result);

    act(() => {
      hls().emit("hlsManifestParsed", { levels: [AAC_LEVEL, FLAC_LEVEL] });
    });

    expect(hls().currentLevel).toBe(-1);
    expect(result.current.streamQuality).toBe(
      "AAC — HLS (no lossless decoder in this browser)",
    );
  });

  test("reports plain HLS when the playlist has no lossless variant", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() => {
      hls().emit("hlsManifestParsed", { levels: [AAC_LEVEL] });
    });

    expect(hls().currentLevel).toBe(-1);
    expect(result.current.streamQuality).toBe("HLS");
  });
});

describe("fatal error handling", () => {
  const fatal = (type: string, details = "someDetail") => ({
    fatal: true,
    type,
    details,
  });

  test("restarts loading on a network error rather than giving up", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() => hls().emit("hlsError", fatal("networkError")));

    expect(hls().startLoad).toHaveBeenCalledTimes(1);
    expect(result.current.state).not.toBe("error");
  });

  test("recovers a media error in place", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() => hls().emit("hlsError", fatal("mediaError")));

    expect(hls().recoverMediaError).toHaveBeenCalledTimes(1);
    expect(result.current.state).not.toBe("error");
  });

  test("destroys and surfaces anything else", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() =>
      hls().emit("hlsError", fatal("otherError", "manifestParsingError")),
    );

    expect(hls().destroy).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("manifestParsingError");
  });

  test("ignores non-fatal errors entirely", async () => {
    const { result } = renderPlayer();
    await start(result);

    act(() =>
      hls().emit("hlsError", { fatal: false, type: "networkError" }),
    );

    expect(hls().startLoad).not.toHaveBeenCalled();
    expect(hls().destroy).not.toHaveBeenCalled();
    expect(result.current.state).not.toBe("error");
  });
});

describe("transport and element state", () => {
  test("tracks the element's own playback events", async () => {
    const { result, audio } = renderPlayer();
    await start(result);

    act(() => audio.dispatchEvent(new Event("playing")));
    expect(result.current.state).toBe("playing");

    act(() => audio.dispatchEvent(new Event("waiting")));
    expect(result.current.state).toBe("loading");

    act(() => audio.dispatchEvent(new Event("pause")));
    expect(result.current.state).toBe("paused");
  });

  test("surfaces a decode failure reported on the element", async () => {
    const { result, audio } = renderPlayer();
    await start(result);

    act(() => audio.dispatchEvent(new Event("error")));

    expect(result.current.state).toBe("error");
    expect(result.current.error).toBeTruthy();
  });

  test("a pause event cannot overwrite an error state", async () => {
    const { result, audio } = renderPlayer();
    await start(result);

    act(() => audio.dispatchEvent(new Event("error")));
    act(() => audio.dispatchEvent(new Event("pause")));

    expect(result.current.state).toBe("error");
  });

  test("attaches once, however often play is toggled", async () => {
    const { result, audio } = renderPlayer();
    await start(result);
    act(() => audio.dispatchEvent(new Event("playing")));

    await start(result); // pause
    await start(result); // play again

    expect(instances).toHaveLength(1);
  });

  test("tears hls.js down on unmount", async () => {
    const { result, unmount } = renderPlayer();
    await start(result);
    const instance = hls();

    unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("volume", () => {
  test("pushes volume and mute onto the element", async () => {
    const { result, audio } = renderPlayer();

    act(() => result.current.setVolume(0.25));
    expect(audio.volume).toBeCloseTo(0.25);

    act(() => result.current.toggleMute());
    expect(audio.muted).toBe(true);
    expect(result.current.muted).toBe(true);
  });

  test("nudging the slider off zero is an implicit unmute", async () => {
    const { result, audio } = renderPlayer();
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);

    act(() => result.current.setVolume(0.4));

    expect(result.current.muted).toBe(false);
    expect(audio.muted).toBe(false);
  });

  test("sliding to zero leaves the mute flag alone", async () => {
    const { result } = renderPlayer();

    act(() => result.current.setVolume(0));

    expect(result.current.volume).toBe(0);
    expect(result.current.muted).toBe(false);
  });
});

describe("elapsed time", () => {
  test("counts up only while playing", async () => {
    vi.useFakeTimers();
    try {
      const { result, audio } = renderPlayer();
      await act(async () => {
        result.current.toggle();
      });

      act(() => audio.dispatchEvent(new Event("playing")));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(result.current.elapsed).toBe(3);

      act(() => audio.dispatchEvent(new Event("pause")));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      // Frozen while paused — it measures listening, not stream position.
      expect(result.current.elapsed).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
