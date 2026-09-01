import { query } from "./db";

export type RatingValue = 1 | -1;

export type RatingSummary = {
  up: number;
  down: number;
  /** This listener's vote, or null if they haven't rated this track. */
  mine: RatingValue | null;
};

/**
 * The station feed gives songs no stable id, so a track is identified by its
 * normalized artist + title. Normalizing matters: the feed ships incidental
 * double spaces ("Kashmir  (Remaster)") that would otherwise split one song's
 * tally across two keys. The pair is JSON-encoded rather than joined with a
 * separator, so an artist or title containing the separator cannot collide
 * with a different pair.
 */
export function trackRatingKey(artist: string, title: string): string {
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return JSON.stringify([normalize(artist), normalize(title)]);
}

export function isRatingValue(value: unknown): value is RatingValue {
  return value === 1 || value === -1;
}

const SUMMARY_SQL = `
  select
    count(*) filter (where rating = 1)::int  as up,
    count(*) filter (where rating = -1)::int as down,
    max(rating) filter (where listener_id = $2::uuid) as mine
  from track_ratings
  where track_key = $1
`;

export async function ratingSummary(
  trackKey: string,
  listenerId: string | null,
): Promise<RatingSummary> {
  const [row] = await query<{ up: number; down: number; mine: number | null }>(
    SUMMARY_SQL,
    [trackKey, listenerId],
  );
  return {
    up: row?.up ?? 0,
    down: row?.down ?? 0,
    mine: isRatingValue(row?.mine) ? row.mine : null,
  };
}

/**
 * Records one vote. The unique constraint — not a prior read — is what stops a
 * listener voting twice, so two concurrent clicks cannot both land.
 * Reports whether this call is the one that inserted.
 */
export async function rateTrack(
  artist: string,
  title: string,
  listenerId: string,
  rating: RatingValue,
): Promise<{ accepted: boolean; summary: RatingSummary }> {
  const trackKey = trackRatingKey(artist, title);
  const inserted = await query<{ id: string }>(
    `insert into track_ratings (track_key, artist, title, listener_id, rating)
     values ($1, $2, $3, $4::uuid, $5)
     on conflict on constraint track_ratings_one_vote_per_listener do nothing
     returning id`,
    [trackKey, artist, title, listenerId, rating],
  );
  return {
    accepted: inserted.length > 0,
    summary: await ratingSummary(trackKey, listenerId),
  };
}
