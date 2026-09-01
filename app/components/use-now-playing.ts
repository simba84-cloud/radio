"use client";

import { useEffect, useState } from "react";
import { METADATA_URL, type TrackMetadata } from "@/lib/radio";

const POLL_MS = 10_000;

/** Polls the station's now-playing feed for as long as the component is mounted. */
export function useNowPlaying() {
  const [metadata, setMetadata] = useState<TrackMetadata | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    const poll = async () => {
      try {
        // The feed sits behind CloudFront, so bust the cache per request.
        const response = await fetch(`${METADATA_URL}?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        setMetadata((await response.json()) as TrackMetadata);
        setStale(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        // Keep showing the last known track rather than blanking the page.
        setStale(true);
        void err;
      }
      if (!controller.signal.aborted) {
        timer = window.setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return { metadata, stale };
}
