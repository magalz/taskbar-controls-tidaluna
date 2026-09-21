import assert from "node:assert/strict";
import test from "node:test";
import { clampSeek, formatTime, readToolbarPlaybackState } from "./playbackState";

test("formats short and long durations", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(3661), "1:01:01");
});

test("clamps seek positions to the valid duration", () => {
  assert.equal(clampSeek(-3, 100), 0);
  assert.equal(clampSeek(140, 100), 100);
  assert.equal(clampSeek(Number.NaN, 100), 0);
});

test("reads playback metadata and state", () => {
  assert.deepEqual(readToolbarPlaybackState({
    playbackControls: {
      latestCurrentTime: 65,
      playbackState: "PLAYING",
      playbackContext: { actualDuration: 180 },
      mediaProduct: { productId: "42" },
    },
    content: {
      mediaItems: {
        "42": { item: { title: "Track", artists: [{ name: "Artist" }] } },
      },
    },
  }), {
    title: "Track",
    artist: "Artist",
    elapsedSeconds: 65,
    durationSeconds: 180,
    playing: true,
  });
});

test("uses safe metadata fallbacks", () => {
  const state = readToolbarPlaybackState({ playbackControls: { playbackState: "PAUSED" } });
  assert.equal(state.title, "Unknown title");
  assert.equal(state.artist, "Unknown artist");
  assert.equal(state.playing, false);
});
