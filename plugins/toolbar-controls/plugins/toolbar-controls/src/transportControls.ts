export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;
export const SEEK_STEP_SECONDS = 10;

type PlaybackSnapshot = {
  elapsedSeconds: number;
  durationSeconds: number;
};

type Action = { type: string; payload?: unknown };

export type TransportDeps = {
  dispatch: (action: Action) => unknown;
  getPlayback: () => PlaybackSnapshot;
  now?: () => number;
};

export function createTransportControls({ dispatch, getPlayback, now = Date.now }: TransportDeps) {
  let lastPreviousClickAt = -Infinity;

  return {
    playPause() {
      dispatch({ type: "playbackControls/TOGGLE_PLAYBACK" });
    },
    next() {
      dispatch({ type: "playbackControls/SKIP_NEXT" });
    },
    previous() {
      const current = now();
      const { elapsedSeconds } = getPlayback();
      const secondClick = current - lastPreviousClickAt <= PREVIOUS_RESTART_THRESHOLD_SECONDS * 1000;
      lastPreviousClickAt = current;
      if (secondClick || elapsedSeconds <= PREVIOUS_RESTART_THRESHOLD_SECONDS) {
        dispatch({ type: "playbackControls/SKIP_PREVIOUS" });
        return;
      }
      dispatch({ type: "playbackControls/SEEK", payload: 0 });
    },
    seekForward10() {
      const playback = getPlayback();
      dispatch({
        type: "playbackControls/SEEK",
        payload: Math.min(playback.durationSeconds, playback.elapsedSeconds + SEEK_STEP_SECONDS),
      });
    },
    seekBackward10() {
      const playback = getPlayback();
      dispatch({
        type: "playbackControls/SEEK",
        payload: Math.max(0, playback.elapsedSeconds - SEEK_STEP_SECONDS),
      });
    },
  };
}
