import assert from "node:assert/strict";
import test from "node:test";
import {
  clampToolbarPosition,
  createToolbarDrag,
  DEFAULT_TOOLBAR_ANCHOR,
  type ToolbarAnchor,
  type ToolbarViewport,
} from "./toolbarPosition";

const VIEWPORT: ToolbarViewport = { width: 1920, height: 1080 };

test("default anchor sits bottom-right above the taskbar", () => {
  assert.deepEqual(DEFAULT_TOOLBAR_ANCHOR, { right: 24, bottom: 24 });
});

test("clamp keeps offsets inside the viewport with margin", () => {
  assert.deepEqual(clampToolbarPosition({ right: -100, bottom: -50 }, VIEWPORT, { width: 430, height: 90 }), {
    right: 0,
    bottom: 0,
  });
  assert.deepEqual(clampToolbarPosition({ right: 5000, bottom: 4000 }, VIEWPORT, { width: 430, height: 90 }), {
    right: 1920 - 430,
    bottom: 1080 - 90,
  });
  assert.deepEqual(clampToolbarPosition({ right: 24, bottom: 24 }, VIEWPORT, { width: 430, height: 90 }), {
    right: 24,
    bottom: 24,
  });
});

test("drag moves the anchor by pointer delta", () => {
  const drag = createToolbarDrag({ right: 24, bottom: 24 });
  drag.start(1000, 1000);
  // Pointer moves left 60px and down 40px; the bar follows the pointer 1:1,
  // so right = 24 + 60 = 84, bottom = 24 + 40 = 64.
  const moved = drag.move(940, 1040, VIEWPORT, { width: 430, height: 90 });
  assert.deepEqual(moved, { right: 84, bottom: 64 });
  assert.deepEqual(drag.anchor(), { right: 84, bottom: 64 });
  drag.end();
  assert.equal(drag.dragging(), false);
});

test("drag clamps against viewport edges", () => {
  const drag = createToolbarDrag({ right: 24, bottom: 24 });
  drag.start(100, 100);
  // Far left + far down: right clamps to max, bottom = 24 + 4900 clamps to max.
  const moved = drag.move(-5000, 5000, VIEWPORT, { width: 430, height: 90 });
  assert.deepEqual(moved, { right: 1920 - 430, bottom: 1080 - 90 });
});

test("move without start is a no-op", () => {
  const drag = createToolbarDrag({ right: 24, bottom: 24 });
  assert.equal(drag.move(500, 500, VIEWPORT, { width: 430, height: 90 }), undefined);
  assert.deepEqual(drag.anchor(), { right: 24, bottom: 24 });
});

test("anchor serialization round-trips for persistence", () => {
  const anchor: ToolbarAnchor = { right: 120, bottom: 72 };
  const drag = createToolbarDrag(anchor);
  assert.deepEqual(drag.anchor(), { right: 120, bottom: 72 });
});

test("a second start supersedes the first without drift", () => {
  const drag = createToolbarDrag({ right: 24, bottom: 24 });
  drag.start(1000, 1000);
  drag.move(990, 990, VIEWPORT, { width: 430, height: 90 });
  drag.start(500, 500);
  const moved = drag.move(490, 490, VIEWPORT, { width: 430, height: 90 });
  // Anchor after first move: right 34, bottom 14. Second drag measures from
  // the latest start only: left 10 / up 10 → right 44, bottom 4.
  assert.deepEqual(moved, { right: 44, bottom: 4 });
});
