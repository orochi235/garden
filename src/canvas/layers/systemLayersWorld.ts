import type { RenderLayer } from '@orochi235/weasel';

/** Origin marker at world (0,0). One screen pixel per world unit becomes
 *  imperceptible at high zoom-out, so we draw in screen px via the view. */
export function createSystemLayer(): RenderLayer<unknown> {
  return {
    id: 'system-origin',
    label: 'System (origin)',
    alwaysOn: true,
    space: 'screen',
    draw(ctx, _data, view) {
      const ox = (0 - view.x) * view.scale;
      const oy = (0 - view.y) * view.scale;
      const r = 4;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox - r, oy);
      ctx.lineTo(ox + r, oy);
      ctx.moveTo(ox, oy - r);
      ctx.lineTo(ox, oy + r);
      ctx.stroke();
      ctx.restore();
    },
  };
}
