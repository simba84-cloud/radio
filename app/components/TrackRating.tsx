"use client";

import { useCallback, useEffect, useState } from "react";
import type { RatingSummary, RatingValue } from "@/lib/ratings";
import { ThumbDownIcon, ThumbUpIcon } from "./icons";

/** Totals include other listeners' votes, so refresh them while a track plays. */
const REFRESH_MS = 20_000;

type TrackRatingProps = {
  artist: string | null;
  title: string | null;
};

export function TrackRating({ artist, title }: TrackRatingProps) {
  // A primitive identity for the current track keeps every hook dependency
  // below a stable value rather than a per-render object.
  const trackId = artist && title ? JSON.stringify([artist, title]) : null;

  // Store the tally alongside the track it belongs to. Reading it back through
  // a key check means a track change shows "loading" without an effect having
  // to reset state, which would cascade an extra render.
  const [entry, setEntry] = useState<{ id: string; summary: RatingSummary } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const summary = entry && entry.id === trackId ? entry.summary : null;

  useEffect(() => {
    if (!artist || !title || !trackId) return;
    const controller = new AbortController();

    const load = async () => {
      try {
        const params = new URLSearchParams({ artist, title });
        const response = await fetch(`/api/ratings?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));
        setEntry({ id: trackId, summary: await response.json() });
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };

    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [artist, title, trackId]);

  const vote = useCallback(
    async (rating: RatingValue) => {
      if (!artist || !title || !trackId || pending || summary?.mine != null)
        return;
      setPending(true);
      try {
        const response = await fetch("/api/ratings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artist, title, rating }),
        });
        // 409 means this listener already rated it — the body still carries the
        // authoritative tally and their original choice, so use it either way.
        if (!response.ok && response.status !== 409) {
          throw new Error(String(response.status));
        }
        const data = (await response.json()) as RatingSummary;
        setEntry({ id: trackId, summary: data });
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setPending(false);
      }
    },
    [artist, title, trackId, pending, summary?.mine],
  );

  const rated = summary?.mine != null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-body text-graphite">
        {rated ? "Thanks for rating:" : "Rate this track:"}
      </p>

      <div className="flex items-center gap-3">
        <RatingButton
          kind="up"
          count={summary?.up}
          chosen={summary?.mine === 1}
          locked={rated}
          disabled={!summary || pending}
          onClick={() => void vote(1)}
        />
        <RatingButton
          kind="down"
          count={summary?.down}
          chosen={summary?.mine === -1}
          locked={rated}
          disabled={!summary || pending}
          onClick={() => void vote(-1)}
        />
      </div>

      {failed ? (
        <p role="alert" className="text-small text-charcoal/70">
          Couldn&apos;t reach the ratings service.
        </p>
      ) : null}
    </div>
  );
}

type RatingButtonProps = {
  kind: "up" | "down";
  count: number | undefined;
  chosen: boolean;
  /** This listener has already voted, so neither button can be used again. */
  locked: boolean;
  disabled: boolean;
  onClick: () => void;
};

function RatingButton({
  kind,
  count,
  chosen,
  locked,
  disabled,
  onClick,
}: RatingButtonProps) {
  const Icon = kind === "up" ? ThumbUpIcon : ThumbDownIcon;
  const label = kind === "up" ? "Thumbs up" : "Thumbs down";

  // The mockup shows bare thumb glyphs rather than button chrome, so the
  // control is borderless; the count sits beside it and the chosen side turns
  // forest green. Hit area still clears the guide's 40px minimum.
  const tone = chosen
    ? "text-forest font-bold"
    : locked
      ? "text-graphite opacity-40"
      : "text-graphite hover:text-forest";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || locked}
      aria-pressed={chosen}
      aria-label={
        count === undefined ? label : `${label} (${count} so far)`
      }
      title={locked && !chosen ? "You've already rated this track" : label}
      className={`focus-brand flex min-h-10 items-center gap-1.5 rounded px-1 transition-colors ${tone} disabled:cursor-default`}
    >
      <Icon className="size-6" />
      <span className="text-body tabular-nums">{count ?? "–"}</span>
    </button>
  );
}
