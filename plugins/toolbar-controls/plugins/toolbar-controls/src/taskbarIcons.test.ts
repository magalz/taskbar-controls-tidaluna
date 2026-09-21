import assert from "node:assert/strict";
import test from "node:test";
import {
  TASKBAR_GLYPHS,
  renderTaskbarIcon,
  type TaskbarGlyphId,
} from "./taskbarIcons";

const GLYPH_IDS: TaskbarGlyphId[] = ["previous", "rewind", "play", "pause", "forward", "next", "restore"];

test("every toolbar click id has a bar-matched glyph", () => {
  assert.deepEqual(
    Object.keys(TASKBAR_GLYPHS).sort(),
    ["forward", "next", "pause", "play", "previous", "restore", "rewind"].sort(),
  );
});

test("glyphs reuse the bar's own labels (no invented icon language)", () => {
  assert.equal(TASKBAR_GLYPHS.previous.text, "⏮");
  assert.equal(TASKBAR_GLYPHS.rewind.text, "↶10");
  assert.equal(TASKBAR_GLYPHS.play.text, "▶");
  assert.equal(TASKBAR_GLYPHS.pause.text, "⏸");
  assert.equal(TASKBAR_GLYPHS.forward.text, "10↷");
  assert.equal(TASKBAR_GLYPHS.next.text, "⏭");
  assert.equal(TASKBAR_GLYPHS.restore.text, "↗");
});

test("renders square png data urls within the host icon budget (canvas stub)", () => {
  const createCanvas = (size: number) => ({
    draw: () => `data:image/png;base64,${Buffer.from(`icon:${size}`).toString("base64")}`,
  });
  for (const id of GLYPH_IDS) {
    const url = renderTaskbarIcon(id, { createCanvas });
    assert.match(url, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    assert.ok(url.length < 131_072, `${id} icon exceeds host budget`);
  }
});

test("play and pause render distinct icons when canvas is available (live toggle flip)", () => {
  const createCanvas = (_size: number) => ({
    draw: (paint: (ctx: { drawGlyph: (text: string) => void }) => void) => {
      let text = "";
      paint({
        drawGlyph: (drawn: string) => {
          text = drawn;
        },
      } as never);
      return `data:image/png;base64,${Buffer.from(`glyph:${text}`).toString("base64")}`;
    },
  });
  const play = renderTaskbarIcon("play", { createCanvas, size: 33 });
  const pause = renderTaskbarIcon("pause", { createCanvas, size: 33 });
  assert.notEqual(play, pause);
});

test("without canvas every glyph falls back to the same placeholder", () => {
  const noCanvas = { createCanvas: () => undefined };
  assert.equal(renderTaskbarIcon("play", noCanvas), renderTaskbarIcon("pause", noCanvas));
});

test("rendering is deterministic and memoized per glyph and size", () => {
  let draws = 0;
  const createCanvas = (_size: number) => ({
    draw: () => {
      draws += 1;
      return "data:image/png;base64,AAAA";
    },
  });
  assert.equal(renderTaskbarIcon("next", { createCanvas, size: 49 }), "data:image/png;base64,AAAA");
  assert.equal(renderTaskbarIcon("next", { createCanvas, size: 49 }), "data:image/png;base64,AAAA");
  assert.equal(draws, 1);
});

test("renderer falls back cleanly without canvas support", () => {
  const url = renderTaskbarIcon("play", {
    createCanvas: () => undefined,
  });
  assert.match(url, /^data:image\/png;base64,/);
});

test("custom sizes stay square and bypass the default-size cache entry", () => {
  const seen = new Map<number, string>();
  const createCanvas = (size: number) => ({
    draw: () => {
      const url = `data:image/png;base64,${Buffer.from(`icon:${size}`).toString("base64")}`;
      seen.set(size, url);
      return url;
    },
  });
  const small = renderTaskbarIcon("next", { createCanvas, size: 34 });
  const large = renderTaskbarIcon("next", { createCanvas, size: 65 });
  assert.match(small, /^data:image\/png;base64,/);
  assert.match(large, /^data:image\/png;base64,/);
  assert.notEqual(small, large);
  assert.equal(seen.get(34), small);
  assert.equal(seen.get(65), large);
});
