# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run db:up      # Postgres 17 + Adminer via docker compose (do this before dev)
npm run dev        # Next.js on :3002  (3000 is taken on this machine)
npm run build      # next build
npm run lint       # eslint (flat config, eslint-config-next)
npm run typecheck  # tsc --noEmit
npm test           # vitest run — all three projects
npm run test:watch # vitest in watch mode
npm run db:psql    # psql shell into the radio-postgres container
npm run db:reset   # docker compose down -v && up  — DESTROYS the volume, re-runs db/init/*.sql
```

First run needs `cp .env.example .env.local`. Verify wiring at
http://localhost:3002/api/health (`{"ok":true,"db":"up",...}`); Adminer is on :8081,
Postgres on :55432. All three ports are deliberately non-default.

## Tests

`vitest.config.mts` defines three projects, and which one a file lands in is
decided by its name and path:

| Project  | Files | Env | Needs |
| -------- | ----- | --- | ----- |
| `unit`   | `lib/**/*.test.ts` | node | nothing |
| `db`     | `**/*.db.test.ts` (anywhere) | node | Postgres |
| `client` | `app/**/*.test.ts(x)` | jsdom | nothing |

**`.db.test.ts` is the marker that a file needs a database** — route-handler
tests use it too, since they call through to real queries. Those run against
`radio_test`, never the dev database: `test/setup-db.ts` throws unless the
database is named `radio_test`, applies `db/init/*.sql` itself, and truncates
between tests. Create it once with `npm run db:test:create`.

Things that will bite you when adding tests:

- `lib/db.ts` reads `DATABASE_URL` at module load and caches the pool on
  `globalThis`, so the env var must be set in a setupFile, not inside a test —
  and the pool needs `end()`ing in teardown or vitest never exits.
- `volume-store.ts` caches volume in a module-level variable. Tests that read it
  must `vi.resetModules()` and re-import, or they inherit the previous test's value.
- `use-now-playing` reschedules itself with `setTimeout`. Install fake timers
  *before* rendering; switching afterwards leaves the first real timer running
  outside the test's control.
- jsdom has no media stack — `HTMLMediaElement.play` and `MediaSource` are
  stubbed in `test/setup-client.ts`. hls.js is replaced wholesale by a fake in
  `use-hls-audio.test.tsx`.

Do not "simplify" the DB tests into mocks. The one-vote-per-listener guarantee
is a UNIQUE constraint; a mocked `pg` would test the mock and nothing else.

## Architecture

A single-page Next.js 16 App Router player for one station's HLS stream, plus a
Postgres-backed thumbs up/down rating API. No auth, no routing beyond `/`.

**Client tree.** `app/page.tsx` (server) renders the nav bar and
`app/components/RadioPlayer.tsx` (client), which owns the whole player. It renders
one hidden `<audio>` element and wires two independent hooks into the UI:

- `use-hls-audio.ts` — playback. Loads hls.js dynamically, and on `MANIFEST_PARSED`
  **pins the FLAC level** so ABR can't drop to the AAC variant. It deliberately tries
  `Hls.isSupported()` *before* `canPlayType`, because Chrome answers `"maybe"` to the
  native-HLS probe but cannot play it; native is the Safari/iOS fallback only. The
  `<audio>` element must keep `preload="auto"` — hls.js feeds it via MediaSource and
  `"none"` can prevent the source opening.
- `use-now-playing.ts` — polls the station's `metadatav2.json` every 10s. That feed's
  `bit_depth`/`sample_rate` describe the *source*, not the delivered stream.

Cover art is one URL whose bytes change per track, so it is cache-busted with a
track-keyed query param and fetched **once per song, never retried**. This is only
safe because the station writes `cover.jpg` ~2.6s *before* flipping the metadata.
`use-stable-image.ts` decodes the next cover off-screen and swaps the visible `src`
only when it is ready — assigning `src` directly drops the old bitmap and blanks the
frame for ~1.7s. Do not add a React `key` to that `<img>`; it reintroduces the flash.

Both stream URLs and the metadata shape/helpers live in `lib/radio.ts`.
Volume is kept in `volume-store.ts`, a tiny `useSyncExternalStore` store over
`localStorage`, so the slider restores on the client without a hydration mismatch.

**Ratings.** Two constraints shape this and should not be "simplified" away:

- Tracks have no id in the feed, so identity is a normalized, JSON-encoded
  `[artist, title]` pair (`trackRatingKey` in `lib/ratings.ts`). Normalization
  (NFKC, collapse whitespace, lowercase) is load-bearing — the feed emits incidental
  double spaces that would split one song's tally.
- One-vote-per-listener is enforced by the `track_ratings_one_vote_per_listener`
  unique constraint plus `on conflict do nothing`, never a read-then-write, which
  would race. `app/api/ratings/route.ts` returns `409` **with the current tally** on a
  repeat vote so the UI can settle on truth. Listener identity is an opaque uuid in an
  httpOnly `rc_listener` cookie — it identifies a browser, not a person.

**Database.** `lib/db.ts` caches the `pg` Pool on `globalThis` in dev so Next's module
reloads don't leak connections. Route handlers that touch the DB or cookies set
`export const dynamic = "force-dynamic"`.

`db/init/*.sql` runs **only when the volume is first created**. Adding a file there
does nothing to a running database — either `npm run db:reset` (destroys data) or
apply it by hand:

```bash
docker exec -i radio-postgres psql -U radio -d radio -v ON_ERROR_STOP=1 < db/init/00N_x.sql
```

`stations` (001/002) is leftover placeholder scaffolding nothing reads.

## Styling

Design tokens are Tailwind 4 `@theme` values in `app/globals.css`, sourced from
`RadioCalico_Style_Guide.txt` (palette, Montserrat/Open Sans, type scale) with
measurements sampled from `RadioCalicoLayout.png`.

**Where the mockup and the style guide disagree, the mockup wins** — the nav is
graphite `#494949` not teal, the page ground is `#f9f9fb` not white, player controls
are white-on-dark, the column is ~960px not 1200px, and there is no hero or footer.
README.md has the full table; check it before "fixing" a token back to the guide.

## Verifying playback

Audio cannot be confirmed through the Chrome automation tools — MediaSource is
unavailable there, so the player takes the native path and never plays. Check playback
by hand, or assert on state/logs rather than sound.
