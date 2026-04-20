import type { ViewTransform } from '../utils/grid';

/**
 * Base class for layer renderers. Holds shared state (view, dimensions,
 * opacity, highlight) and manages highlight animation internally.
 *
 * Subclasses implement `draw(ctx)` with access to `this.view`, `this.highlight`, etc.
 * The parent calls `render(ctx, w, h)` and the base handles clearing + alpha.
 */
export abstract class LayerRenderer {
  view: ViewTransform = { panX: 0, panY: 0, zoom: 1 };
  width = 0;
  height = 0;
  opacity = 1;

  // Highlight animation state
  highlight = 0;
  private _hoverHighlight = false;
  private _flashStart: number | null = null;
  private _flashHoldMs = 600;
  private _flashFadeMs = 320;
  private _onInvalidate: (() => void) | null = null;
  private _animFrame: number | null = null;

  /** Register a callback that fires when the renderer needs a re-render (animation tick). */
  onInvalidate(cb: () => void) {
    this._onInvalidate = cb;
  }

  /** Set hover-driven highlight (instant on/off). */
  setHoverHighlight(on: boolean) {
    this._hoverHighlight = on;
    this._updateHighlight();
  }

  /** Trigger a flash animation (quick fade-in, hold, fade-out). */
  flash() {
    this._flashStart = performance.now();
    this._scheduleAnimation();
  }

  /** Update view transform and dimensions. */
  setView(view: ViewTransform, width: number, height: number) {
    this.view = view;
    this.width = width;
    this.height = height;
  }

  /** Main render entry point. Clears canvas and calls subclass draw(). */
  render(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    this._updateHighlight();
    if (this.opacity > 0) {
      ctx.globalAlpha = this.opacity;
      this.draw(ctx);
      ctx.globalAlpha = 1;
    }
  }

  protected abstract draw(ctx: CanvasRenderingContext2D): void;

  private _updateHighlight() {
    if (this._hoverHighlight) {
      this.highlight = 1;
      return;
    }
    if (this._flashStart === null) {
      this.highlight = 0;
      return;
    }
    const elapsed = performance.now() - this._flashStart;
    const fadeInMs = 80;
    if (elapsed < fadeInMs) {
      this.highlight = elapsed / fadeInMs;
    } else if (elapsed < fadeInMs + this._flashHoldMs) {
      this.highlight = 1;
    } else {
      const fadeElapsed = elapsed - fadeInMs - this._flashHoldMs;
      if (fadeElapsed >= this._flashFadeMs) {
        this.highlight = 0;
        this._flashStart = null;
      } else {
        this.highlight = 1 - fadeElapsed / this._flashFadeMs;
      }
    }
  }

  private _scheduleAnimation() {
    if (this._animFrame !== null) return;
    const tick = () => {
      this._updateHighlight();
      this._onInvalidate?.();
      if (this._flashStart !== null) {
        this._animFrame = requestAnimationFrame(tick);
      } else {
        this._animFrame = null;
      }
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  dispose() {
    if (this._animFrame !== null) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }
}
