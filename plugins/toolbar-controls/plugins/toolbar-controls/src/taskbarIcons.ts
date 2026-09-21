/**
 * Bar-matched taskbar icons, rendered at runtime on an offscreen canvas.
 *
 * The floating toolbar's glyphs (⏮ ↶10 ▶/⏸ 10↷ ⏭ ↗) are drawn into square
 * PNG data URLs with the same visual language: white glyph on a dark rounded
 * tile. No image assets, no build step — the renderer produces exactly what
 * Electron's `nativeImage` decodes (PNG). The play/pause pair is intentionally
 * two distinct icons so the thumbnail toggle visibly flips with playback.
 */

export type TaskbarGlyphId = "previous" | "rewind" | "play" | "pause" | "forward" | "next" | "restore";

export const TASKBAR_GLYPHS: Record<TaskbarGlyphId, { text: string; label: string }> = {
  // Texts mirror toolbar-controls/src/index.ts button labels verbatim.
  previous: { text: "⏮", label: "Restart / previous track" },
  rewind: { text: "↶10", label: "Rewind 10 seconds" },
  play: { text: "▶", label: "Play" },
  pause: { text: "⏸", label: "Pause" },
  forward: { text: "10↷", label: "Advance 10 seconds" },
  next: { text: "⏭", label: "Next track" },
  restore: { text: "↗", label: "Restore TIDAL window" },
};

export type TaskbarIconRendererDeps = {
  size?: number;
  /** Seam for headless tests: return undefined to exercise the fallback. */
  createCanvas?: (size: number) => { draw: (paint: (ctx: CanvasPaint) => void) => string } | undefined;
};

export type CanvasPaint = {
  fillTile?: (radius: number, color: string) => void;
  drawGlyph: (text: string, fontPx: number, color: string) => void;
};

/** 1x1 transparent PNG — returned only when canvas is unavailable. */
const EMPTY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const cache = new Map<string, string>();

function defaultCreateCanvas(size: number) {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  return {
    draw: (paint: (ctx: CanvasPaint) => void) => {
      paint({
        fillTile: (radius: number, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(0, 0, size, size, radius);
          ctx.fill();
        },
        drawGlyph: (text: string, fontPx: number, color: string) => {
          ctx.fillStyle = color;
          ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, size / 2, size / 2 + fontPx * 0.04);
        },
      });
      return canvas.toDataURL("image/png");
    },
  };
}

export function renderTaskbarIcon(id: TaskbarGlyphId, deps: TaskbarIconRendererDeps = {}): string {
  const size = deps.size ?? 32;
  const cacheKey = `${id}@${size}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const canvas = createCanvas(size);
  // Single-glyph icons render large; two/three-char transport labels ("↶10")
  // step down so they stay inside the tile.
  const fontPx = TASKBAR_GLYPHS[id].text.length > 1 ? Math.round(size * 0.42) : Math.round(size * 0.58);
  const url =
    canvas?.draw((paint) => {
      // Matches the bar: rgba(18,18,22) tile, white glyph.
      paint.fillTile?.(Math.round(size * 0.22), "#121216");
      paint.drawGlyph(TASKBAR_GLYPHS[id].text, fontPx, "#ffffff");
    }) ?? EMPTY_PNG;

  cache.set(cacheKey, url);
  return url;
}
