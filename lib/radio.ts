/** Radio Calico stream endpoints. All are served CORS-open from CloudFront. */
export const STREAM_URL = "https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8";
export const METADATA_URL =
  "https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json";
export const COVER_URL = "https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg";

/** Shape of metadatav2.json. Every field is best-effort — the feed omits keys. */
export type TrackMetadata = {
  artist?: string;
  title?: string;
  album?: string;
  date?: string;
  bit_depth?: number;
  sample_rate?: number;
} & Partial<Record<`prev_artist_${1 | 2 | 3 | 4 | 5}`, string>> &
  Partial<Record<`prev_title_${1 | 2 | 3 | 4 | 5}`, string>>;

export type PreviousTrack = { artist: string; title: string };

/** Flattens the feed's prev_artist_N / prev_title_N pairs into a list. */
export function previousTracks(meta: TrackMetadata | null): PreviousTrack[] {
  if (!meta) return [];
  const tracks: PreviousTrack[] = [];
  for (const n of [1, 2, 3, 4, 5] as const) {
    const artist = meta[`prev_artist_${n}`];
    const title = meta[`prev_title_${n}`];
    if (artist && title) tracks.push({ artist, title });
  }
  return tracks;
}

/** "16-bit 44.1kHz", or null when the feed didn't say. */
export function sourceQuality(meta: TrackMetadata | null): string | null {
  if (!meta?.bit_depth || !meta?.sample_rate) return null;
  const khz = (meta.sample_rate / 1000).toFixed(1).replace(/\.0$/, "");
  return `${meta.bit_depth}-bit ${khz}kHz`;
}

/** Identity of the current track, used to bust the cover-art cache. */
export function trackKey(meta: TrackMetadata | null): string {
  return `${meta?.artist ?? ""}|${meta?.title ?? ""}`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
