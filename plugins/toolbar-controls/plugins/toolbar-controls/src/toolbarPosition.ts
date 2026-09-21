/**
 * Movable-toolbar positioning. Pure state machine — no DOM — so the anchor
 * math is unit-testable. `index.ts` binds pointer events to it and applies
 * the resulting `{ right, bottom }` offsets to the toolbar element.
 *
 * The toolbar is anchored by bottom-right offsets (not top-left) so it keeps
 * its distance from the taskbar edge across resizes.
 */

export type ToolbarAnchor = { right: number; bottom: number };
export type ToolbarViewport = { width: number; height: number };
export type ToolbarSize = { width: number; height: number };

/** Ships bottom-right, floating just above the taskbar. */
export const DEFAULT_TOOLBAR_ANCHOR: ToolbarAnchor = { right: 24, bottom: 24 };

/** Storage key for the persisted anchor (per Luna profile). */
export const TOOLBAR_ANCHOR_STORAGE_KEY = "magalz.toolbar-controls.anchor.v1";

export function clampToolbarPosition(anchor: ToolbarAnchor, viewport: ToolbarViewport, size: ToolbarSize): ToolbarAnchor {
  const maxRight = Math.max(0, viewport.width - size.width);
  const maxBottom = Math.max(0, viewport.height - size.height);
  return {
    right: Math.min(maxRight, Math.max(0, Math.round(anchor.right))),
    bottom: Math.min(maxBottom, Math.max(0, Math.round(anchor.bottom))),
  };
}

export function parseToolbarAnchor(value: unknown): ToolbarAnchor | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { right, bottom } = value as Partial<Record<"right" | "bottom", unknown>>;
  if (typeof right !== "number" || !Number.isFinite(right)) return undefined;
  if (typeof bottom !== "number" || !Number.isFinite(bottom)) return undefined;
  return { right, bottom };
}

export function createToolbarDrag(initial: ToolbarAnchor = DEFAULT_TOOLBAR_ANCHOR) {
  let anchor: ToolbarAnchor = { ...initial };
  let start: { x: number; y: number; right: number; bottom: number } | undefined;

  return {
    anchor: (): ToolbarAnchor => ({ ...anchor }),
    dragging: () => start !== undefined,
    start(x: number, y: number) {
      start = { x, y, right: anchor.right, bottom: anchor.bottom };
    },
    move(x: number, y: number, viewport: ToolbarViewport, size: ToolbarSize): ToolbarAnchor | undefined {
      if (!start) return undefined;
      // Screen coords: +x right, +y down. Right offset shrinks as the
      // pointer moves right; bottom offset shrinks as it moves up.
      anchor = clampToolbarPosition(
        { right: start.right - (x - start.x), bottom: start.bottom + (y - start.y) },
        viewport,
        size,
      );
      return { ...anchor };
    },
    end() {
      start = undefined;
      return { ...anchor };
    },
  };
}
