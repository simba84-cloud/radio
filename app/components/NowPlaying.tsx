"use client";

import {
  COVER_URL,
  sourceQuality,
  trackKey,
  type TrackMetadata,
} from "@/lib/radio";
import { PlayerBar } from "./PlayerBar";
import { TrackRating } from "./TrackRating";
import type { PlayerControls } from "./use-hls-audio";
import { useStableImage } from "./use-stable-image";

type NowPlayingProps = {
  metadata: TrackMetadata | null;
  /** The feed is failing but we still have a last-known track to show. */
  stale: boolean;
  player: PlayerControls;
};

/**
 * Column widths mirror RadioCalicoLayout.png: within a ~960px column the art is
 * 577px and the details 335px, separated by a 48px gutter.
 */
export function NowPlaying({ metadata, stale, player }: NowPlayingProps) {
  const source = sourceQuality(metadata);
  // The cover lives at a fixed URL whose contents change with the track, so key
  // the request on the track itself to refetch exactly once per song.
  //
  // useStableImage holds back the swap until the next cover has decoded, so the
  // frame never blanks between tracks. Note there is also deliberately no React
  // `key` on the <img> — keying it would tear the element down and reintroduce
  // the very flash this avoids.
  const coverSrc = metadata
    ? `${COVER_URL}?t=${encodeURIComponent(trackKey(metadata))}`
    : null;
  const shownCover = useStableImage(coverSrc);

  return (
    <section className="mx-auto grid w-full max-w-[960px] gap-8 px-6 py-8 md:grid-cols-[1.72fr_1fr] md:gap-12">
      <div className="aspect-square w-full overflow-hidden bg-cream">
        {shownCover ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             remote art at a mutable URL; the optimizer would cache it. */
          <img
            src={shownCover}
            alt={
              metadata?.album
                ? `Album art for ${metadata.album}`
                : "Album art for the current track"
            }
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full animate-pulse bg-mint/60" />
        )}
      </div>

      <div className="min-w-0">
        {/* Announce track changes to screen readers as they happen. */}
        <div aria-live="polite">
          <h1 className="font-display text-h2 font-bold text-balance text-black sm:text-h1">
            {metadata?.artist ?? "Tuning in…"}
          </h1>

          {metadata ? (
            <p className="mt-10 font-display text-h3 font-bold text-black sm:text-h2">
              {metadata.title}
              {metadata.date ? ` (${metadata.date})` : ""}
            </p>
          ) : null}

          {metadata?.album ? (
            <p className="mt-8 font-display text-xl leading-snug font-bold text-black">
              {metadata.album}
            </p>
          ) : null}
        </div>

        <dl className="mt-6 text-body text-graphite italic">
          {source ? (
            <div className="flex gap-2">
              <dt>Source quality:</dt>
              <dd>{source}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt>Stream quality:</dt>
            <dd>{player.streamQuality ?? "FLAC lossless — HLS"}</dd>
          </div>
        </dl>

        <div className="mt-8">
          <TrackRating
            artist={metadata?.artist ?? null}
            title={metadata?.title ?? null}
          />
        </div>

        <div className="mt-6">
          <PlayerBar
            state={player.state}
            elapsed={player.elapsed}
            volume={player.volume}
            muted={player.muted}
            onToggle={player.toggle}
            onVolumeChange={player.setVolume}
            onToggleMute={player.toggleMute}
          />
        </div>

        {player.error ? (
          <p
            role="alert"
            className="mt-4 rounded border-2 border-calico bg-calico/10 px-4 py-3 text-small"
          >
            {player.error}
          </p>
        ) : null}

        {stale && metadata ? (
          <p className="mt-4 text-small text-graphite italic">
            Track info is temporarily out of date — audio is unaffected.
          </p>
        ) : null}
      </div>
    </section>
  );
}
