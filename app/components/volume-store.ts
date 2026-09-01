/**
 * Volume lives in localStorage rather than React state so the slider can be
 * restored during hydration without a mismatch: the server always renders
 * DEFAULT_VOLUME, and useSyncExternalStore swaps in the stored value on the
 * client. Storage is unavailable in some privacy modes, hence the try/catch.
 */
const KEY = "radiocalico:volume";
const DEFAULT_VOLUME = 0.8;

let cached: number | null = null;
const listeners = new Set<() => void>();

function read(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw === null ? NaN : Number.parseFloat(raw);
    return Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getVolume(): number {
  if (cached === null) cached = read();
  return cached;
}

export function getServerVolume(): number {
  return DEFAULT_VOLUME;
}

export function storeVolume(next: number): void {
  cached = Math.min(1, Math.max(0, next));
  try {
    window.localStorage.setItem(KEY, String(cached));
  } catch {
    // Volume simply won't persist to the next visit.
  }
  for (const listener of listeners) listener();
}
