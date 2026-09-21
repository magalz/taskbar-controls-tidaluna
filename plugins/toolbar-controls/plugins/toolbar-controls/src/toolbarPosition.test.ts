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

test("bar follows the pointer: down/left/right/up all track 1:1", () => {
  const size = { width: 430, height: 90 };
  // Down 40 + left 60 from (1000,1000): bar moves with the pointer,
  // so right grows, bottom shrinks.
  const a = createToolbarDrag({ right: 200, bottom: 200 });
  a.start(1000, 1000);
  assert.deepEqual(a.move(940, 1040, VIEWPORT, size), { right: 260, bottom: 160 });

  // Up 30 + right 50 from (500,500): right shrinks, bottom grows.
  const b = createToolbarDrag({ right: 200, bottom: 200 });
  b.start(500, 500);
  assert.deepEqual(b.move(550, 470, VIEWPORT, size), { right: 150, bottom: 230 });
});

test("drag clamps against the right and top edges", () => {
  const drag = createToolbarDrag({ right: 24, bottom: 500 });
  drag.start(5000, 5000);
  // Pointer further right + further down: right 24-4900 → 0,
  // bottom 500-10000 → 0.
  const moved = drag.move(9900, 15000, VIEWPORT, { width: 430, height: 90 });
  assert.deepEqual(moved, { right: 0, bottom: 0 });
});

test("drag to far left and top clamps to max offsets", () => {
  const drag = createToolbarDrag({ right: 1000, bottom: 24 });
  drag.start(5000, 9900);
  // Pointer far left + far up: right 1000+9900 → max,
  // bottom 24+9800 → max.
  const moved = drag.move(-4900, 100, VIEWPORT, { width: 430, height: 90 });
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
  drag.move(990, 1010, VIEWPORT, { width: 430, height: 90 });
  drag.start(500, 500);
  const moved = drag.move(490, 510, VIEWPORT, { width: 430, height: 90 });
  // Anchor after first move: right 34, bottom 14. Second drag measures from
  // the latest start only: left 10 / down 10 → right 44, bottom 4.
  assert.deepEqual(moved, { right: 44, bottom: 4 });
});
