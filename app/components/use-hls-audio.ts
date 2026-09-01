"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type Hls from "hls.js";
import { STREAM_URL } from "@/lib/radio";
import {
  getServerVolume,
  getVolume,
  storeVolume,
  subscribe as subscribeVolume,
} from "./volume-store";

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

/** Everything the UI needs to render and drive playback, minus the element ref. */
export type PlayerControls = {
  state: PlayerState;
  error: string | null;
  streamQuality: string | null;
  volume: number;
  muted: boolean;
  elapsed: number;
  toggle: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
};

/** MSE mime for the master playlist's lossless variant (CODECS="fLaC" in fMP4). */
const FLAC_MIME = 'audio/mp4; codecs="flac"';

/**
 * Drives an <audio> element off the HLS master playlist. The caller renders the
 * element and passes it `audioRef`; keep `preload="auto"` on it, since hls.js
 * feeds the element through a MediaSource and "none" can stop that source from
 * ever opening.
 *
 * The stream carries a lossless FLAC variant and an AAC one. hls.js would
 * otherwise let ABR choose between them by bandwidth, so we pin the FLAC level
 * whenever Media Source Extensions can actually decode it, and fall back to AAC
 * only where they can't.
 */
export function useHlsAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const attachingRef = useRef<Promise<void> | null>(null);

  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [streamQuality, setStreamQuality] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const volume = useSyncExternalStore(
    subscribeVolume,
    getVolume,
    getServerVolume,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => setState("playing");
    const onPause = () => setState((s) => (s === "error" ? s : "paused"));
    const onWaiting = () => setState((s) => (s === "playing" ? "loading" : s));
    // Native playback reports decode/network failures here rather than by
    // rejecting play(), which would otherwise leave the UI spinning forever.
    const onError = () => {
      setState("error");
      setError(audio.error?.message || "The stream couldn't be played.");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("error", onError);
      audio.pause();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.removeAttribute("src");
      audio.load();
      attachingRef.current = null;
    };
  }, []);

  // Push React's view of volume/mute onto the media element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  // "0:35 / Live" — time spent listening, not stream position (it's live).
  useEffect(() => {
    if (state !== "playing") return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const attach = useCallback((audio: HTMLAudioElement) => {
    if (attachingRef.current) return attachingRef.current;

    const run = async () => {
      const { default: Hls } = await import("hls.js");

      // hls.js first, native HLS only as the fallback. Chrome answers "maybe"
      // to canPlayType("application/vnd.apple.mpegurl") but cannot actually
      // play it, and only the hls.js path can pin the lossless variant anyway.
      // Native is then genuinely Safari/iOS, which decodes FLAC-in-HLS itself.
      if (!Hls.isSupported()) {
        if (!audio.canPlayType("application/vnd.apple.mpegurl")) {
          throw new Error("This browser can't play HLS streams.");
        }
        audio.src = STREAM_URL;
        setStreamQuality("HLS — native playback");
        return;
      }

      const hls = new Hls({ enableWorker: true, backBufferLength: 30 });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const losslessIndex = data.levels.findIndex((level) =>
          /flac/i.test(level.audioCodec ?? level.attrs?.CODECS ?? ""),
        );
        const canDecodeFlac =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported(FLAC_MIME);

        if (losslessIndex >= 0 && canDecodeFlac) {
          // Assigning currentLevel also pins it, so ABR can't drop to AAC.
          hls.currentLevel = losslessIndex;
          setStreamQuality("FLAC lossless — HLS");
        } else if (losslessIndex >= 0) {
          setStreamQuality("AAC — HLS (no lossless decoder in this browser)");
        } else {
          setStreamQuality("HLS");
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          hlsRef.current = null;
          attachingRef.current = null;
          setState("error");
          setError(data.details ?? "The stream stopped unexpectedly.");
        }
      });

      hls.attachMedia(audio);
      hls.loadSource(STREAM_URL);
    };

    const promise = run().catch((err: unknown) => {
      attachingRef.current = null;
      throw err;
    });
    attachingRef.current = promise;
    return promise;
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setState("loading");
    setError(null);
    try {
      await attach(audio);
      await audio.play();
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error ? err.message : "Couldn't start the stream.",
      );
    }
  }, [attach]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (state === "playing" || state === "loading") pause();
    else void play();
  }, [pause, play, state]);

  const setVolume = useCallback((next: number) => {
    storeVolume(next);
    // Nudging the slider off zero is an implicit unmute.
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((current) => !current), []);

  return {
    audioRef,
    state,
    error,
    streamQuality,
    volume,
    muted,
    elapsed,
    toggle,
    setVolume,
    toggleMute,
  };
}
