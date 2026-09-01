-- Listener thumbs up / thumbs down on the track that was playing.
--
-- The station feed gives songs no stable id, so identity is a normalized,
-- JSON-encoded artist + title pair (see trackRatingKey in lib/ratings.ts).
-- artist/title are also stored verbatim so rows stay readable in the table.
--
-- One vote per listener per track is enforced by the unique constraint rather
-- than by a read-then-write in the app, which would race under concurrency.

create table if not exists track_ratings (
  id          bigint generated always as identity primary key,
  track_key   text        not null,
  artist      text        not null,
  title       text        not null,
  listener_id uuid        not null,
  rating      smallint    not null check (rating in (-1, 1)),
  created_at  timestamptz not null default now(),

  constraint track_ratings_one_vote_per_listener unique (track_key, listener_id)
);

-- The unique constraint's index is (track_key, listener_id); its leading column
-- already serves the per-track tally lookups, so no extra index is needed.
