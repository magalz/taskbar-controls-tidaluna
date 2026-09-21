import assert from "node:assert/strict";
import test from "node:test";
import { createTransportControls } from "./transportControls";

test("dispatches play, next, and seek actions", () => {
  const actions: Array<{ type: string; payload?: unknown }> = [];
  const controls = createTransportControls({
    dispatch: (action) => actions.push(action),
    getPlayback: () => ({ elapsedSeconds: 50, durationSeconds: 100 }),
  });

  controls.playPause();
  controls.next();
  controls.seekForward10();
  controls.seekBackward10();

  assert.deepEqual(actions, [
    { type: "playbackControls/TOGGLE_PLAYBACK" },
    { type: "playbackControls/SKIP_NEXT" },
    { type: "playbackControls/SEEK", payload: 60 },
    { type: "playbackControls/SEEK", payload: 40 },
  ]);
});

test("restarts first, then skips previous on a quick second click", () => {
  const actions: Array<{ type: string; payload?: unknown }> = [];
  let currentTime = 1000;
  const controls = createTransportControls({
    dispatch: (action) => actions.push(action),
    getPlayback: () => ({ elapsedSeconds: 40, durationSeconds: 100 }),
    now: () => currentTime,
  });

  controls.previous();
  currentTime += 1000;
  controls.previous();

  assert.deepEqual(actions, [
    { type: "playbackControls/SEEK", payload: 0 },
    { type: "playbackControls/SKIP_PREVIOUS" },
  ]);
});

test("clamps seek controls to track boundaries", () => {
  const actions: Array<{ type: string; payload?: unknown }> = [];
  const controls = createTransportControls({
    dispatch: (action) => actions.push(action),
    getPlayback: () => ({ elapsedSeconds: 5, durationSeconds: 12 }),
  });

  controls.seekBackward10();
  controls.seekForward10();

  assert.deepEqual(actions, [
    { type: "playbackControls/SEEK", payload: 0 },
    { type: "playbackControls/SEEK", payload: 12 },
  ]);
});
