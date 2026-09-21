import type { LunaUnload } from "@luna/core";

import type { ToolbarPlaybackState } from "./playbackState";
import { TASKBAR_GLYPHS, renderTaskbarIcon, type TaskbarGlyphId } from "./taskbarIcons";

export const TASKBAR_CHANNELS = {
  capabilities: "__Luna.taskbar.capabilities",
  register: "__Luna.taskbar.register",
  update: "__Luna.taskbar.update",
  clear: "__Luna.taskbar.clear",
  click: "__Luna.taskbar.click",
  restore: "__Luna.window.restore",
} as const;

export type TaskbarClickId = "previous" | "rewind" | "toggle" | "forward" | "next" | "restore";

export type TaskbarButtonDefinition = {
  id: TaskbarClickId;
  tooltip: string;
  iconDataUrl: string;
};

export type TaskbarButtonUpdate = {
  id: string;
  flags: string[];
  /** Per-button tooltip. Ignored by hosts that only apply flags; applied by
   * hosts that support per-button tooltip updates. */
  tooltip?: string;
};

export type TaskbarStateUpdate = {
  buttons: TaskbarButtonUpdate[];
  tooltip?: string;
};

const REGISTRATION_GLYPH: Record<TaskbarClickId, TaskbarGlyphId> = {
  previous: "previous",
  rewind: "rewind",
  toggle: "play",
  forward: "forward",
  next: "next",
  restore: "restore",
};

const REGISTRATION_TOOLTIP: Record<TaskbarClickId, string> = {
  previous: TASKBAR_GLYPHS.previous.label,
  rewind: TASKBAR_GLYPHS.rewind.label,
  // Toggle tooltip is live per-render ("Play"/"Pause"); the registration
  // tooltip is the idle label.
  toggle: "Play / pause",
  forward: TASKBAR_GLYPHS.forward.label,
  next: TASKBAR_GLYPHS.next.label,
  restore: TASKBAR_GLYPHS.restore.label,
};

const CLICK_IDS: TaskbarClickId[] = ["previous", "rewind", "toggle", "forward", "next", "restore"];

export const TASKBAR_BUTTON_DEFINITIONS: TaskbarButtonDefinition[] = CLICK_IDS.map((id) => ({
  id,
  tooltip: REGISTRATION_TOOLTIP[id],
  iconDataUrl: renderTaskbarIcon(REGISTRATION_GLYPH[id]),
}));

const CLICK_ID_SET = new Set<string>(CLICK_IDS);

/** Minimal structural surface needed from `@luna/lib`'s `ipcRenderer`.
 * Injected so the bridge is unit-testable without the Luna renderer. */
export type TaskbarIpc = {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (unloads: Set<LunaUnload>, channel: string, listener: (id: string) => void) => LunaUnload;
};

export type TaskbarBridgeDeps = {
  ipc: TaskbarIpc;
  unloads: Set<LunaUnload>;
  onClick: (id: TaskbarClickId) => void;
  buttons?: TaskbarButtonDefinition[];
};

export type TaskbarBridge = {
  supported: boolean;
  update: (state: TaskbarStateUpdate) => Promise<boolean>;
  restore: () => Promise<boolean>;
};

type TaskbarCapabilities = {
  supported: boolean;
  maxButtons: number;
  channels?: { click?: string };
};

function isCapabilities(value: unknown): value is TaskbarCapabilities {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TaskbarCapabilities>;
  return (
    typeof candidate.supported === "boolean" &&
    typeof candidate.maxButtons === "number" &&
    Number.isFinite(candidate.maxButtons) &&
    (candidate.channels === undefined ||
      (typeof candidate.channels === "object" &&
        candidate.channels !== null &&
        ((candidate.channels as { click?: unknown }).click === undefined ||
          typeof (candidate.channels as { click?: unknown }).click === "string")))
  );
}

/**
 * Build the host update payload for a playback snapshot. The toggle button is
 * always `enabled` (it must stay clickable to resume), and playing state
 * propagates through the toggle's tooltip — "Pause" while playing, "Play"
 * while paused — mirroring the in-window button. Electron's thumbnail flags
 * have no pressed-state, so flags alone cannot carry this bit.
 *
 * Icon flips (play ▶ vs pause ⏸) are intentionally NOT sent per-render: the
 * host re-applies `setThumbarButtons` with the registration icons, so a
 * per-render swap would flicker and fight host state. The distinct play/pause
 * icons exist so a future host revision can swap them atomically.
 */
export function buildTaskbarUpdate(playback: ToolbarPlaybackState): TaskbarStateUpdate {
  const title = playback.title.trim() || "Unknown title";
  const artist = playback.artist.trim() || "Unknown artist";
  return {
    tooltip: `${title} — ${artist}`,
    buttons: TASKBAR_BUTTON_DEFINITIONS.map((button) => ({
      id: button.id,
      flags: ["enabled"],
      tooltip: button.id === "toggle" ? (playback.playing ? "Pause" : "Play") : button.tooltip,
    })),
  };
}

const NOOP_BRIDGE: TaskbarBridge = {
  supported: false,
  update: async () => false,
  restore: async () => false,
};

export async function createTaskbarBridge({
  ipc,
  unloads,
  onClick,
  buttons = TASKBAR_BUTTON_DEFINITIONS,
}: TaskbarBridgeDeps): Promise<TaskbarBridge> {
  let capabilities: TaskbarCapabilities;
  try {
    const probed = await ipc.invoke(TASKBAR_CHANNELS.capabilities);
    if (!isCapabilities(probed) || !probed.supported) return { ...NOOP_BRIDGE };
    capabilities = probed;
  } catch {
    return { ...NOOP_BRIDGE };
  }

  const clickChannel = capabilities.channels?.click ?? TASKBAR_CHANNELS.click;
  ipc.on(unloads, clickChannel, (id: string) => {
    if (CLICK_ID_SET.has(id)) onClick(id as TaskbarClickId);
  });

  const maxButtons = Math.max(0, Math.floor(capabilities.maxButtons));
  const selectedButtons = buttons.slice(0, maxButtons);
  try {
    await ipc.invoke(TASKBAR_CHANNELS.register, { buttons: selectedButtons });
  } catch {
    return { ...NOOP_BRIDGE };
  }

  const clear = () => ipc.invoke(TASKBAR_CHANNELS.clear).catch(() => undefined);
  unloads.add(clear as LunaUnload);

  return {
    supported: true,
    update: async (state) =>
      Boolean(await ipc.invoke(TASKBAR_CHANNELS.update, state).catch(() => undefined)),
    restore: async () =>
      Boolean(await ipc.invoke(TASKBAR_CHANNELS.restore).catch(() => undefined)),
  };
}
