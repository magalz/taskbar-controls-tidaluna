import assert from "node:assert/strict";
import test from "node:test";
import {
  TASKBAR_BUTTON_DEFINITIONS,
  TASKBAR_CHANNELS,
  buildTaskbarUpdate,
  createTaskbarBridge,
  type TaskbarBridgeDeps,
} from "./taskbarBridge";

const PLAYING = {
  title: "Track",
  artist: "Artist",
  elapsedSeconds: 65,
  durationSeconds: 180,
  playing: true,
} as const;

const PAUSED = { ...PLAYING, playing: false } as const;

type FakeIpc = {
  calls: Array<{ channel: string; payload?: unknown }>;
  capabilities: unknown;
  invokeError?: boolean;
  listeners: Map<string, (id: string) => void>;
  unloads: Set<() => void>;
  ipc: TaskbarBridgeDeps["ipc"];
};

function createFakeIpc(capabilities: unknown): FakeIpc {
  const fake: FakeIpc = {
    calls: [],
    capabilities,
    listeners: new Map(),
    unloads: new Set(),
    ipc: null as never,
  };
  fake.ipc = {
    invoke: async (channel: string, payload?: unknown) => {
      fake.calls.push({ channel, payload });
      if (fake.invokeError) throw new Error("ipc down");
      if (channel === TASKBAR_CHANNELS.capabilities) return fake.capabilities;
      return { ok: true };
    },
    on: (_unloads: Set<() => void>, channel: string, listener: (id: string) => void) => {
      fake.listeners.set(channel, listener);
      const unload = () => {
        fake.listeners.delete(channel);
      };
      _unloads.add(unload);
      return unload;
    },
  };
  return fake;
}

const BUTTONS = [
  { id: "previous", tooltip: "Restart / previous track", iconDataUrl: "data:image/png;base64,AAA=" },
  { id: "rewind", tooltip: "Rewind 10 seconds", iconDataUrl: "data:image/png;base64,AAA=" },
  { id: "toggle", tooltip: "Play / pause", iconDataUrl: "data:image/png;base64,AAA=" },
  { id: "forward", tooltip: "Advance 10 seconds", iconDataUrl: "data:image/png;base64,AAA=" },
  { id: "next", tooltip: "Next track", iconDataUrl: "data:image/png;base64,AAA=" },
  { id: "restore", tooltip: "Restore TIDAL window", iconDataUrl: "data:image/png;base64,AAA=" },
];

const CLICK_IDS = ["previous", "rewind", "toggle", "forward", "next", "restore"] as const;

test("button definitions carry bar-matched png icons", () => {
  assert.deepEqual(
    TASKBAR_BUTTON_DEFINITIONS.map(({ id }) => id).sort(),
    [...CLICK_IDS].sort(),
  );
  for (const button of TASKBAR_BUTTON_DEFINITIONS) {
    assert.match(button.iconDataUrl, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  }
});

test("buildTaskbarUpdate reflects playing state in tooltip and toggle flags", () => {
  const playingUpdate = buildTaskbarUpdate(PLAYING);
  assert.equal(playingUpdate.tooltip, "Track — Artist");
  const playingToggle = playingUpdate.buttons.find(({ id }) => id === "toggle");
  assert.deepEqual(playingToggle?.flags, ["enabled"]);
  assert.equal(playingToggle?.tooltip, "Pause");
  assert.equal(playingUpdate.buttons.length, TASKBAR_BUTTON_DEFINITIONS.length);

  // REGRESSION: both branches must not emit the same flags.
  const pausedUpdate = buildTaskbarUpdate(PAUSED);
  assert.notDeepEqual(playingUpdate.buttons, pausedUpdate.buttons);
  const pausedToggle = pausedUpdate.buttons.find(({ id }) => id === "toggle");
  assert.deepEqual(pausedToggle?.flags, ["enabled"]);
  assert.equal(pausedToggle?.tooltip, "Play");
});

test("buildTaskbarUpdate falls back to unknown metadata text", () => {
  const update = buildTaskbarUpdate({ ...PAUSED, title: "", artist: "" });
  assert.equal(update.tooltip, "Unknown title — Unknown artist");
});

test("unsupported host yields a no-op bridge without registering", async () => {
  const fake = createFakeIpc({ supported: false, maxButtons: 0 });
  const unloads = new Set<() => void>();
  const clicked: string[] = [];
  const bridge = await createTaskbarBridge({ ipc: fake.ipc, unloads, onClick: (id) => clicked.push(id) });

  assert.equal(bridge.supported, false);
  assert.equal(await bridge.update(buildTaskbarUpdate(PLAYING)), false);
  assert.equal(await bridge.restore(), false);
  assert.deepEqual(
    fake.calls.map(({ channel }) => channel),
    [TASKBAR_CHANNELS.capabilities],
  );
  assert.equal(fake.listeners.size, 0);
  assert.equal(unloads.size, 0);
});

test("capability probe failure yields a no-op bridge", async () => {
  const fake = createFakeIpc({ supported: true, maxButtons: 7 });
  fake.invokeError = true;
  const bridge = await createTaskbarBridge({ ipc: fake.ipc, unloads: new Set(), onClick: () => {} });
  assert.equal(bridge.supported, false);
});

test("malformed capabilities yield a no-op bridge", async () => {
  for (const capabilities of [null, undefined, 42, "yes", { supported: true }]) {
    const fake = createFakeIpc(capabilities);
    const bridge = await createTaskbarBridge({ ipc: fake.ipc, unloads: new Set(), onClick: () => {} });
    assert.equal(bridge.supported, false, `capabilities: ${JSON.stringify(capabilities)}`);
  }
});

test("supported host registers capped buttons, routes clicks, updates, restores, and clears on unload", async () => {
  const fake = createFakeIpc({
    supported: true,
    maxButtons: 3,
    channels: { click: "__Luna.taskbar.click" },
  });
  const unloads = new Set<() => void>();
  const clicked: string[] = [];
  const bridge = await createTaskbarBridge({ ipc: fake.ipc, unloads, onClick: (id) => clicked.push(id) });

  assert.equal(bridge.supported, true);

  const registerCall = fake.calls.find(({ channel }) => channel === TASKBAR_CHANNELS.register);
  assert.deepEqual(
    (registerCall?.payload as { buttons: Array<{ id: string }> }).buttons.map(({ id }) => id),
    ["previous", "rewind", "toggle"],
  );

  const listener = fake.listeners.get("__Luna.taskbar.click");
  assert.ok(listener, "click listener registered");
  listener!("toggle");
  assert.deepEqual(clicked, ["toggle"]);
  listener!("bogus-id");
  assert.deepEqual(clicked, ["toggle"], "unknown click ids are ignored");

  assert.equal(await bridge.update(buildTaskbarUpdate(PLAYING)), true);
  const updateCall = fake.calls.find(({ channel }) => channel === TASKBAR_CHANNELS.update);
  assert.deepEqual(updateCall?.payload, buildTaskbarUpdate(PLAYING));

  assert.equal(await bridge.restore(), true);
  assert.ok(fake.calls.some(({ channel }) => channel === TASKBAR_CHANNELS.restore));

  for (const unload of [...unloads]) unload();
  assert.ok(fake.calls.some(({ channel }) => channel === TASKBAR_CHANNELS.clear));
  assert.equal(fake.listeners.size, 0);
});

test("update/restore failures resolve false instead of throwing", async () => {
  const fake = createFakeIpc({ supported: true, maxButtons: 7 });
  const bridge = await createTaskbarBridge({ ipc: fake.ipc, unloads: new Set(), onClick: () => {} });
  assert.equal(bridge.supported, true);
  fake.invokeError = true;
  assert.equal(await bridge.update(buildTaskbarUpdate(PLAYING)), false);
  assert.equal(await bridge.restore(), false);
});
