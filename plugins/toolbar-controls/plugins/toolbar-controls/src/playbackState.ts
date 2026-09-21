export type ToolbarPlaybackState = {
  title: string;
  artist: string;
  elapsedSeconds: number;
  durationSeconds: number;
  playing: boolean;
};

type PlaybackStore = {
  playbackControls?: {
    latestCurrentTime?: number;
    playbackState?: string;
    playbackContext?: { actualDuration?: number };
    mediaProduct?: { productId?: string };
  };
  content?: { mediaItems?: Record<string, unknown> };
};

const UNKNOWN_TITLE = "Unknown title";
const UNKNOWN_ARTIST = "Unknown artist";

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(finiteOrZero(seconds)));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  const hours = Math.floor(minutes / 60);
  const shownMinutes = minutes % 60;
  return hours > 0
    ? `${hours}:${String(shownMinutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function clampSeek(seconds: number, durationSeconds: number): number {
  const duration = Math.max(0, finiteOrZero(durationSeconds));
  return Math.min(duration, Math.max(0, finiteOrZero(seconds)));
}

export function readToolbarPlaybackState(state: unknown): ToolbarPlaybackState {
  const store = (state ?? {}) as PlaybackStore;
  const controls = store.playbackControls ?? {};
  const durationSeconds = Math.max(0, finiteOrZero(controls.playbackContext?.actualDuration));
  const elapsedSeconds = clampSeek(finiteOrZero(controls.latestCurrentTime), durationSeconds);
  const productId = controls.mediaProduct?.productId;
  const item = productId ? store.content?.mediaItems?.[productId] as {
    item?: { title?: string; artists?: Array<{ name?: string }> };
  } | undefined : undefined;
  const media = item?.item;

  return {
    title: media?.title?.trim() || UNKNOWN_TITLE,
    artist: media?.artists?.map((artist) => artist.name?.trim()).filter(Boolean).join(", ") || UNKNOWN_ARTIST,
    elapsedSeconds,
    durationSeconds,
    playing: controls.playbackState === "PLAYING",
  };
}

export { UNKNOWN_ARTIST, UNKNOWN_TITLE };
