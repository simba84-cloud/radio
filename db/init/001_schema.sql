-- Placeholder schema so the app has something real to read on day one.
-- Replace with the actual model once we know what the site needs.

create table if not exists stations (
  id          bigint generated always as identity primary key,
  slug        text        not null unique,
  name        text        not null,
  stream_url  text,
  created_at  timestamptz not null default now()
);
