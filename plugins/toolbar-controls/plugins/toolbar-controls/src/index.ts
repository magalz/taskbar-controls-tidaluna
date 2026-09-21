import { Tracer, type LunaUnload } from "@luna/core";
import { redux, ipcRenderer } from "@luna/lib";
import { createTransportControls } from "./transportControls";
import { formatTime, readToolbarPlaybackState, type ToolbarPlaybackState } from "./playbackState";
import {
  buildTaskbarUpdate,
  createTaskbarBridge,
  type TaskbarBridge,
  type TaskbarClickId,
} from "./taskbarBridge";
import {
  clampToolbarPosition,
  createToolbarDrag,
  DEFAULT_TOOLBAR_ANCHOR,
  parseToolbarAnchor,
  TOOLBAR_ANCHOR_STORAGE_KEY,
} from "./toolbarPosition";

let taskbarBridge: TaskbarBridge | undefined;

export const { trace } = Tracer("[Toolbar Controls]");
export const unloads = new Set<LunaUnload>();

const TOOLBAR_ID = "magalz-toolbar-controls";
const STYLE_ID = `${TOOLBAR_ID}-style`;

const style = document.createElement("style");
style.id = STYLE_ID;
style.textContent = `
  #${TOOLBAR_ID} {
    position: fixed;
    right: ${DEFAULT_TOOLBAR_ANCHOR.right}px;
    bottom: ${DEFAULT_TOOLBAR_ANCHOR.bottom}px;
    z-index: 9999;
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    min-width: 430px;
    max-width: min(760px, calc(100vw - 48px));
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, .14);
    border-radius: 14px;
    background: rgba(18, 18, 22, .94);
    box-shadow: 0 8px 30px rgba(0, 0, 0, .4);
    backdrop-filter: blur(12px);
    color: #fff;
    font: 13px/1.25 system-ui, sans-serif;
  }
  #${TOOLBAR_ID} .track {
    min-width: 0;
    overflow: hidden;
  }
  #${TOOLBAR_ID} .track-title,
  #${TOOLBAR_ID} .track-artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #${TOOLBAR_ID} .track-title { font-weight: 700; }
  #${TOOLBAR_ID} .track-artist { color: rgba(255, 255, 255, .66); margin-top: 2px; }
  #${TOOLBAR_ID} .progress-row { display: flex; gap: 7px; align-items: center; margin-top: 7px; }
  #${TOOLBAR_ID} .time { color: rgba(255, 255, 255, .7); font-variant-numeric: tabular-nums; white-space: nowrap; }
  #${TOOLBAR_ID} progress { width: 100%; height: 5px; accent-color: #52b5ff; }
  #${TOOLBAR_ID} .controls { display: flex; gap: 4px; align-items: center; }
  #${TOOLBAR_ID} button {
    width: 31px; height: 31px; padding: 0; border: 0; border-radius: 7px;
    color: #fff; background: transparent; cursor: pointer; font: 600 14px system-ui, sans-serif;
  }
  #${TOOLBAR_ID} button:hover { background: rgba(255, 255, 255, .14); }
  #${TOOLBAR_ID} button:focus-visible { outline: 2px solid #52b5ff; outline-offset: 2px; }
  #${TOOLBAR_ID} .primary { background: rgba(82, 181, 255, .22); }
  #${TOOLBAR_ID} .primary:hover { background: rgba(82, 181, 255, .35); }
  #${TOOLBAR_ID} .restore { color: #8fd1ff; }
  #${TOOLBAR_ID} .drag-handle {
    width: 18px; height: 100%; min-height: 44px; padding: 0; border: 0; border-radius: 6px;
    color: rgba(255, 255, 255, .45); background: transparent; cursor: grab;
    font: 600 12px system-ui, sans-serif; letter-spacing: 1px; touch-action: none;
  }
  #${TOOLBAR_ID} .drag-handle:hover { background: rgba(255, 255, 255, .14); color: #fff; }
  #${TOOLBAR_ID} .drag-handle:active { cursor: grabbing; }
  #${TOOLBAR_ID}.dragging { user-select: none; opacity: .92; }
  @media (max-width: 620px) {
    #${TOOLBAR_ID} { right: 12px; bottom: 12px; min-width: 0; grid-template-columns: 1fr; max-width: calc(100vw - 24px); }
    #${TOOLBAR_ID} .controls { justify-content: center; }
  }
`;
document.head.appendChild(style);

const toolbar = document.createElement("nav");
toolbar.id = TOOLBAR_ID;
toolbar.setAttribute("aria-label", "TIDAL playback controls");
toolbar.innerHTML = `
  <section class="track" aria-live="polite">
    <div class="track-title" data-field="title">Unknown title</div>
    <div class="track-artist" data-field="artist">Unknown artist</div>
    <div class="progress-row">
      <span class="time" data-field="elapsed">00:00</span>
      <progress data-field="progress" min="0" max="1" value="0" aria-label="Track progress"></progress>
      <span class="time" data-field="duration">00:00</span>
    </div>
  </section>
  <div class="controls" aria-label="Playback actions">
    <button data-action="previous" aria-label="Restart track or previous track" title="Restart / previous">⏮</button>
    <button data-action="rewind" aria-label="Rewind 10 seconds" title="Rewind 10 seconds">↶10</button>
    <button class="primary" data-action="toggle" aria-label="Play or pause" title="Play / pause">▶</button>
    <button data-action="forward" aria-label="Advance 10 seconds" title="Advance 10 seconds">10↷</button>
    <button data-action="next" aria-label="Next track" title="Next track">⏭</button>
  </div>
  <button class="restore" data-action="restore" aria-label="Restore TIDAL window" title="Restore TIDAL window">↗</button>
  <button class="drag-handle" data-drag-handle aria-label="Drag to move toolbar" title="Drag to move">⋮⋮</button>
`;
document.body.appendChild(toolbar);

// Movable toolbar: drag handle repositions the bar via the toolbarPosition
// state machine; the anchor persists per profile in localStorage.
const dragHandle = toolbar.querySelector<HTMLButtonElement>("[data-drag-handle]")!;
const drag = createToolbarDrag(DEFAULT_TOOLBAR_ANCHOR);

function applyAnchor(anchor: { right: number; bottom: number }) {
  toolbar.style.right = `${anchor.right}px`;
  toolbar.style.bottom = `${anchor.bottom}px`;
}

try {
  const stored = parseToolbarAnchor(JSON.parse(localStorage.getItem(TOOLBAR_ANCHOR_STORAGE_KEY) ?? "null"));
  if (stored) {
    const clamped = clampToolbarPosition(stored, { width: window.innerWidth, height: window.innerHeight }, toolbar.getBoundingClientRect());
    applyAnchor(clamped);
    // Seed the drag state at the stored spot: synthesize a zero-delta drag
    // from the default anchor to the stored one.
    drag.start(0, 0);
    drag.move(DEFAULT_TOOLBAR_ANCHOR.right - clamped.right, clamped.bottom - DEFAULT_TOOLBAR_ANCHOR.bottom, { width: window.innerWidth, height: window.innerHeight }, toolbar.getBoundingClientRect());
    drag.end();
  }
} catch {
  // Corrupt storage: keep the default anchor.
}

function persistAnchor() {
  try {
    localStorage.setItem(TOOLBAR_ANCHOR_STORAGE_KEY, JSON.stringify(drag.anchor()));
  } catch {
    // Storage full or blocked: position still works for this session.
  }
}

dragHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dragHandle.setPointerCapture(event.pointerId);
  drag.start(event.clientX, event.clientY);
  toolbar.classList.add("dragging");
});
dragHandle.addEventListener("pointermove", (event) => {
  if (!drag.dragging()) return;
  const next = drag.move(event.clientX, event.clientY, { width: window.innerWidth, height: window.innerHeight }, toolbar.getBoundingClientRect());
  if (next) applyAnchor(next);
});
const endDrag = () => {
  if (!drag.dragging()) return;
  drag.end();
  toolbar.classList.remove("dragging");
  persistAnchor();
};
dragHandle.addEventListener("pointerup", endDrag);
dragHandle.addEventListener("pointercancel", endDrag);

const field = <T extends HTMLElement>(name: string) => toolbar.querySelector<T>(`[data-field="${name}"]`)!;
const titleField = field<HTMLElement>("title");
const artistField = field<HTMLElement>("artist");
const elapsedField = field<HTMLElement>("elapsed");
const durationField = field<HTMLElement>("duration");
const progressField = field<HTMLProgressElement>("progress");
const toggleButton = toolbar.querySelector<HTMLButtonElement>('[data-action="toggle"]')!;

let playback: ToolbarPlaybackState = readToolbarPlaybackState(redux.store.getState());

function render(next: ToolbarPlaybackState) {
  playback = next;
  void taskbarBridge?.update(buildTaskbarUpdate(next));
  titleField.textContent = next.title;
  artistField.textContent = next.artist;
  elapsedField.textContent = formatTime(next.elapsedSeconds);
  durationField.textContent = formatTime(next.durationSeconds);
  progressField.max = Math.max(1, next.durationSeconds);
  progressField.value = next.elapsedSeconds;
  toggleButton.textContent = next.playing ? "⏸" : "▶";
  toggleButton.setAttribute("aria-label", next.playing ? "Pause" : "Play");
  toggleButton.title = next.playing ? "Pause" : "Play";
}

render(playback);

const transport = createTransportControls({
  dispatch: (action) => redux.store.dispatch(action as never),
  getPlayback: () => ({ elapsedSeconds: playback.elapsedSeconds, durationSeconds: playback.durationSeconds }),
});

const restoreButton = toolbar.querySelector<HTMLButtonElement>('[data-action="restore"]')!;
restoreButton.disabled = true;
restoreButton.title = "Window restore is not exposed by this Luna build";
restoreButton.setAttribute("aria-label", "Restore TIDAL window unavailable in this Luna build");

const actionHandlers = {
  previous: () => transport.previous(),
  rewind: () => transport.seekBackward10(),
  toggle: () => transport.playPause(),
  forward: () => transport.seekForward10(),
  next: () => transport.next(),
  restore: () => taskbarBridge?.restore(),
} as const;

void createTaskbarBridge({
  ipc: ipcRenderer,
  unloads,
  onClick: (id: TaskbarClickId) => actionHandlers[id]?.(),
}).then((bridge) => {
  taskbarBridge = bridge;
  restoreButton.disabled = !bridge.supported;
  restoreButton.title = bridge.supported ? "Restore TIDAL window" : "Window restore unavailable in this Luna build";
  restoreButton.setAttribute("aria-label", bridge.supported ? "Restore TIDAL window" : "Restore TIDAL window unavailable in this Luna build");
  if (bridge.supported) {
    void bridge.update(buildTaskbarUpdate(playback));
  } else {
    trace.log("Taskbar bridge unavailable; using in-window toolbar only");
  }
});

toolbar.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action as keyof typeof actionHandlers | undefined;
  if (!action || target.disabled) return;
  actionHandlers[action]();
});

const updateFromStore = () => render(readToolbarPlaybackState(redux.store.getState()));
const unsubscribeStore = redux.store.subscribe(updateFromStore);
unloads.add(unsubscribeStore);

redux.intercept([
  "playbackControls/MEDIA_PRODUCT_TRANSITION",
  "playbackControls/PREFILL_MEDIA_PRODUCT_TRANSITION",
  "playbackControls/SET_PLAYBACK_STATE",
  "playbackControls/SET_DURATION",
  "playbackControls/TIME_UPDATE",
], unloads, updateFromStore);

const removeToolbar = () => {
  toolbar.remove();
  style.remove();
};
unloads.add(removeToolbar);

trace.log("Loaded");
