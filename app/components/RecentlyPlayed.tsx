"use client";

import type { PreviousTrack } from "@/lib/radio";

type RecentlyPlayedProps = {
  /** Most recent first; the feed carries at most five. */
  tracks: PreviousTrack[];
  loading: boolean;
};

/**
 * Full-bleed mint band holding a left-aligned block that is centred on the
 * page, as laid out in RadioCalicoLayout.png.
 */
export function RecentlyPlayed({ tracks, loading }: RecentlyPlayedProps) {
  return (
    <section aria-labelledby="previous-tracks-heading" className="bg-mint">
      <div className="mx-auto w-full max-w-[960px] px-6 py-10">
        <div className="mx-auto w-fit">
          <h2
            id="previous-tracks-heading"
            className="font-display text-xl font-bold text-black"
          >
            Previous tracks:
          </h2>

          {loading ? (
            <ul className="mt-2 space-y-1.5">
              {[0, 1, 2, 3, 4].map((row) => (
                <li key={row} className="h-5 w-56 animate-pulse bg-forest/10" />
              ))}
            </ul>
          ) : tracks.length > 0 ? (
            <ul className="mt-2 text-body text-graphite">
              {tracks.map((track, index) => (
                <li key={`${track.artist}-${track.title}-${index}`}>
                  {track.artist}: <em>{track.title}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body text-graphite italic">
              Nothing played yet this session.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
