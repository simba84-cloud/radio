"use client";

import { previousTracks } from "@/lib/radio";
import { NowPlaying } from "./NowPlaying";
import { RecentlyPlayed } from "./RecentlyPlayed";
import { useHlsAudio } from "./use-hls-audio";
import { useNowPlaying } from "./use-now-playing";

export function RadioPlayer() {
  const { metadata, stale } = useNowPlaying();
  const { audioRef, ...player } = useHlsAudio();

  return (
    <>
      {/* hls.js needs a node in the document — see useHlsAudio. */}
      <audio ref={audioRef} preload="auto" hidden />

      <NowPlaying metadata={metadata} stale={stale} player={player} />

      {/* Full-bleed mint band, so it sits outside the centred column. */}
      <RecentlyPlayed
        tracks={previousTracks(metadata)}
        loading={metadata === null}
      />
    </>
  );
}
