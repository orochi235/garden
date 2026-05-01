import { describe, it, expect } from 'vitest';
import type {
  ResizeBehavior,
  InsertBehavior,
  ResizeAnchor,
  ResizePose,
  ResizeOverlay,
  InsertOverlay,
} from './types';

describe('Phase 2 type shapes', () => {
  it('ResizeBehavior.onMove receives proposed.pose and proposed.anchor', () => {
    const b: ResizeBehavior<ResizePose> = {
      onMove(_ctx, proposed) {
        // Compile probe: these field accesses must type-check.
        const _x: number = proposed.pose.x;
        const _ax: ResizeAnchor['x'] = proposed.anchor.x;
        void _x; void _ax;
        return { pose: proposed.pose };
      },
    };
    expect(typeof b.onMove).toBe('function');
  });

  it('InsertBehavior.onMove receives proposed.start and proposed.current', () => {
    interface P { x: number; y: number }
    const b: InsertBehavior<P> = {
      onMove(_ctx, proposed) {
        const _sx: number = proposed.start.x;
        const _cx: number = proposed.current.x;
        void _sx; void _cx;
        return { current: proposed.current };
      },
    };
    expect(typeof b.onMove).toBe('function');
  });

  it('ResizeOverlay carries currentPose, targetPose, anchor', () => {
    const o: ResizeOverlay<ResizePose> = {
      id: 'a',
      currentPose: { x: 0, y: 0, width: 1, height: 1 },
      targetPose: { x: 0, y: 0, width: 1, height: 1 },
      anchor: { x: 'min', y: 'free' },
    };
    expect(o.id).toBe('a');
  });

  it('InsertOverlay carries start and current', () => {
    interface P { x: number; y: number }
    const o: InsertOverlay<P> = { start: { x: 0, y: 0 }, current: { x: 1, y: 1 } };
    expect(o.current.x).toBe(1);
  });
});
