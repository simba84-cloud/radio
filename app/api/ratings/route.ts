import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isRatingValue,
  rateTrack,
  ratingSummary,
  trackRatingKey,
} from "@/lib/ratings";

export const dynamic = "force-dynamic";

/**
 * Listeners are anonymous, so "one vote per user" is pinned to an opaque id in
 * an httpOnly cookie. It identifies a browser, not a person — clearing cookies
 * or switching browsers earns another vote. That is the honest limit of rating
 * without accounts.
 */
const LISTENER_COOKIE = "rc_listener";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readListenerId(): Promise<string | null> {
  const value = (await cookies()).get(LISTENER_COOKIE)?.value;
  // The value goes into a ::uuid cast, so reject anything malformed rather
  // than letting Postgres raise on it.
  return value && UUID_PATTERN.test(value) ? value : null;
}

function trackFrom(source: {
  artist?: unknown;
  title?: unknown;
}): { artist: string; title: string } | null {
  const { artist, title } = source;
  if (typeof artist !== "string" || typeof title !== "string") return null;
  if (!artist.trim() || !title.trim()) return null;
  return { artist, title };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const track = trackFrom({
    artist: params.get("artist") ?? undefined,
    title: params.get("title") ?? undefined,
  });
  if (!track) {
    return NextResponse.json(
      { error: "artist and title are required" },
      { status: 400 },
    );
  }

  const summary = await ratingSummary(
    trackRatingKey(track.artist, track.title),
    await readListenerId(),
  );
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as { artist?: unknown; title?: unknown; rating?: unknown };
  const track = trackFrom(payload);
  if (!track) {
    return NextResponse.json(
      { error: "artist and title are required" },
      { status: 400 },
    );
  }
  if (!isRatingValue(payload.rating)) {
    return NextResponse.json(
      { error: "rating must be 1 or -1" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  let listenerId = await readListenerId();
  if (!listenerId) {
    listenerId = randomUUID();
    cookieStore.set(LISTENER_COOKIE, listenerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  const { accepted, summary } = await rateTrack(
    track.artist,
    track.title,
    listenerId,
    payload.rating,
  );

  // A rejected second vote still returns the tally, so the UI can settle on the
  // truth (including the listener's original choice) instead of guessing.
  return NextResponse.json(
    { ...summary, accepted },
    { status: accepted ? 201 : 409 },
  );
}
