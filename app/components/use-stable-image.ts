"use client";

import { useEffect, useState } from "react";

/**
 * Returns the most recent image URL that has actually finished decoding.
 *
 * Pointing an <img> straight at a new URL is not enough: changing `src` drops
 * the old bitmap immediately, so the element goes blank for however long the
 * new file takes (~1.3-1.7s for this station's covers). Decoding the next image
 * off-screen first, and only then swapping the visible `src`, keeps the current
 * artwork painted right up to the cut. A failed load leaves the previous image
 * in place rather than blanking the frame.
 */
export function useStableImage(src: string | null): string | null {
  const [decoded, setDecoded] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const preload = new Image();
    const done = () => {
      if (!cancelled) setDecoded(src);
    };
    preload.addEventListener("load", done);
    preload.src = src;
    // A cached image may already be complete before the listener attaches.
    if (preload.complete && preload.naturalWidth > 0) done();

    return () => {
      cancelled = true;
      preload.removeEventListener("load", done);
    };
  }, [src]);

  return decoded;
}
