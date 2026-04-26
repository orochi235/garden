# Clipper2 Geometry Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a geometry foundation layer backed by clipper2-ts, supporting Bezier curves and polygon boolean ops, so arbitrary shapes become first-class objects.

**Architecture:** A new `src/geometry/` module provides the shape representation (`ShapePath` — a closed path of line and cubic Bezier segments), Bezier tessellation (`flatten`), a thin wrapper around clipper2-ts for boolean/offset operations, and Canvas rendering helpers. Existing model types (`Structure`, `Zone`) gain converters that produce `ShapePath` values on demand — no model migration required. Clipper2 uses the floating-point `D` API (`PathD`, `PointD`) since the codebase works in fractional feet.

**Tech Stack:** TypeScript, clipper2-ts (pure TS Clipper2 port), vitest, Canvas API

---

### Task 1: Install clipper2-ts and create core geometry types

**Files:**
- Modify: `package.json`
- Create: `src/geometry/types.ts`
- Test: `src/geometry/types.test.ts`

- [ ] **Step 1: Install clipper2-ts**

```bash
npm install clipper2-ts
```

- [ ] **Step 2: Write the test for core types**

```typescript
// src/geometry/types.test.ts
import { describe, expect, it } from 'vitest';
import {
  lineTo,
  cubicTo,
  closedPath,
  type ShapePath,
  type LineSeg,
  type CubicSeg,
} from './types';

describe('geometry types', () => {
  it('creates a line segment', () => {
    const seg = lineTo(3, 4);
    expect(seg).toEqual({ kind: 'line', x: 3, y: 4 });
  });

  it('creates a cubic bezier segment', () => {
    const seg = cubicTo(1, 2, 3, 4, 5, 6);
    expect(seg).toEqual({
      kind: 'cubic',
      cp1x: 1, cp1y: 2,
      cp2x: 3, cp2y: 4,
      x: 5, y: 6,
    });
  });

  it('creates a closed path', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [lineTo(4, 0), lineTo(4, 3), lineTo(0, 3)],
    );
    expect(path.start).toEqual({ x: 0, y: 0 });
    expect(path.segments).toHaveLength(3);
  });

  it('exposes the endpoint of each segment kind', () => {
    const line: LineSeg = lineTo(1, 2);
    const cubic: CubicSeg = cubicTo(0, 0, 0, 0, 5, 6);
    expect(line.x).toBe(1);
    expect(cubic.x).toBe(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/geometry/types.test.ts`
Expected: FAIL — module `./types` not found

- [ ] **Step 4: Implement core types**

```typescript
// src/geometry/types.ts

/** A 2D point. */
export interface Point2D {
  x: number;
  y: number;
}

/** Straight line to endpoint. */
export interface LineSeg {
  kind: 'line';
  x: number;
  y: number;
}

/** Cubic Bezier curve to endpoint via two control points. */
export interface CubicSeg {
  kind: 'cubic';
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  x: number;
  y: number;
}

/** A segment is either a line or a cubic Bezier. */
export type PathSegment = LineSeg | CubicSeg;

/**
 * A closed path of segments. The implicit closing edge runs from the
 * last segment's endpoint back to `start`.
 */
export interface ShapePath {
  start: Point2D;
  segments: PathSegment[];
}

/** Create a line segment. */
export function lineTo(x: number, y: number): LineSeg {
  return { kind: 'line', x, y };
}

/** Create a cubic Bezier segment. */
export function cubicTo(
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  x: number, y: number,
): CubicSeg {
  return { kind: 'cubic', cp1x, cp1y, cp2x, cp2y, x, y };
}

/** Create a closed path from a start point and segments. */
export function closedPath(start: Point2D, segments: PathSegment[]): ShapePath {
  return { start, segments };
}

/** Get the endpoint of a segment. */
export function segEnd(seg: PathSegment): Point2D {
  return { x: seg.x, y: seg.y };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/geometry/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/geometry/types.ts src/geometry/types.test.ts package.json package-lock.json
git commit -m "feat: add clipper2-ts dependency and core geometry types"
```

---

### Task 2: Bezier tessellation

**Files:**
- Create: `src/geometry/flatten.ts`
- Test: `src/geometry/flatten.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/geometry/flatten.test.ts
import { describe, expect, it } from 'vitest';
import { flattenPath } from './flatten';
import { closedPath, lineTo, cubicTo } from './types';

describe('flattenPath', () => {
  it('returns vertices for an all-line path unchanged', () => {
    const rect = closedPath(
      { x: 0, y: 0 },
      [lineTo(4, 0), lineTo(4, 3), lineTo(0, 3)],
    );
    const pts = flattenPath(rect);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
  });

  it('tessellates a cubic bezier into multiple points', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [cubicTo(0, 10, 10, 10, 10, 0)],
    );
    const pts = flattenPath(path, 0.1);
    // Should produce more than just start+end
    expect(pts.length).toBeGreaterThan(2);
    // First point is start
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    // Last point is the curve endpoint
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it('produces fewer points with larger tolerance', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [cubicTo(0, 10, 10, 10, 10, 0)],
    );
    const fine = flattenPath(path, 0.01);
    const coarse = flattenPath(path, 1.0);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it('handles a path mixing lines and curves', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [
        lineTo(5, 0),
        cubicTo(5, 3, 3, 5, 0, 5),
        lineTo(0, 0),
      ],
    );
    const pts = flattenPath(path, 0.1);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual({ x: 5, y: 0 });
    // Curve portion adds intermediate points
    expect(pts.length).toBeGreaterThan(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/flatten.test.ts`
Expected: FAIL — module `./flatten` not found

- [ ] **Step 3: Implement flattenPath using De Casteljau subdivision**

```typescript
// src/geometry/flatten.ts
import type { Point2D, ShapePath } from './types';

/**
 * Flatten a ShapePath into a polyline by tessellating cubic Bezier segments
 * via adaptive De Casteljau subdivision. Line segments pass through unchanged.
 *
 * @param path   Closed shape path
 * @param tolerance  Max distance a chord may deviate from the curve (default 0.25)
 * @returns Array of points forming a closed polygon (no duplicate of start at end)
 */
export function flattenPath(path: ShapePath, tolerance = 0.25): Point2D[] {
  const pts: Point2D[] = [{ x: path.start.x, y: path.start.y }];
  let cur = path.start;

  for (const seg of path.segments) {
    if (seg.kind === 'line') {
      pts.push({ x: seg.x, y: seg.y });
      cur = { x: seg.x, y: seg.y };
    } else {
      // Adaptive subdivision of cubic Bezier
      subdivideCubic(
        cur.x, cur.y,
        seg.cp1x, seg.cp1y,
        seg.cp2x, seg.cp2y,
        seg.x, seg.y,
        tolerance * tolerance,
        pts,
      );
      cur = { x: seg.x, y: seg.y };
    }
  }

  return pts;
}

/**
 * Recursively subdivide a cubic Bezier until each chord is within tolerance
 * of the curve. Uses the flatness test: if the control points are within
 * tolerance of the line from start to end, output the endpoint directly.
 */
function subdivideCubic(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolSq: number,
  out: Point2D[],
): void {
  // Flatness test: max squared distance from control points to the chord
  if (isFlat(x0, y0, x1, y1, x2, y2, x3, y3, tolSq)) {
    out.push({ x: x3, y: y3 });
    return;
  }

  // De Casteljau split at t=0.5
  const mx01 = (x0 + x1) / 2, my01 = (y0 + y1) / 2;
  const mx12 = (x1 + x2) / 2, my12 = (y1 + y2) / 2;
  const mx23 = (x2 + x3) / 2, my23 = (y2 + y3) / 2;
  const mx012 = (mx01 + mx12) / 2, my012 = (my01 + my12) / 2;
  const mx123 = (mx12 + mx23) / 2, my123 = (my12 + my23) / 2;
  const mx0123 = (mx012 + mx123) / 2, my0123 = (my012 + my123) / 2;

  subdivideCubic(x0, y0, mx01, my01, mx012, my012, mx0123, my0123, tolSq, out);
  subdivideCubic(mx0123, my0123, mx123, my123, mx23, my23, x3, y3, tolSq, out);
}

/** Check if a cubic Bezier is flat enough to approximate with a line. */
function isFlat(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolSq: number,
): boolean {
  // Use distance of control points from the chord (start→end)
  return (
    pointToSegmentDistSq(x1, y1, x0, y0, x3, y3) <= tolSq &&
    pointToSegmentDistSq(x2, y2, x0, y0, x3, y3) <= tolSq
  );
}

/** Squared distance from point (px,py) to line segment (ax,ay)-(bx,by). */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/flatten.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/flatten.ts src/geometry/flatten.test.ts
git commit -m "feat: add adaptive Bezier tessellation for geometry paths"
```

---

### Task 3: Shape factories

**Files:**
- Create: `src/geometry/shapes.ts`
- Test: `src/geometry/shapes.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/geometry/shapes.test.ts
import { describe, expect, it } from 'vitest';
import { rectPath, ellipsePath, polygonPath } from './shapes';
import { flattenPath } from './flatten';

describe('rectPath', () => {
  it('creates a rectangle as 4 line segments', () => {
    const r = rectPath(1, 2, 4, 3);
    expect(r.start).toEqual({ x: 1, y: 2 });
    expect(r.segments).toHaveLength(3);
    expect(r.segments.every(s => s.kind === 'line')).toBe(true);
    const pts = flattenPath(r);
    expect(pts).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ]);
  });
});

describe('ellipsePath', () => {
  it('creates an ellipse from cubic Bezier arcs', () => {
    const e = ellipsePath(5, 5, 3, 2);
    // 4 cubic segments for a full ellipse approximation
    expect(e.segments).toHaveLength(4);
    expect(e.segments.every(s => s.kind === 'cubic')).toBe(true);
  });

  it('produces a circle when rx === ry', () => {
    const c = ellipsePath(0, 0, 5, 5);
    const pts = flattenPath(c, 0.01);
    // All points should be ~5 units from center
    for (const p of pts) {
      const dist = Math.sqrt(p.x ** 2 + p.y ** 2);
      expect(dist).toBeCloseTo(5, 1);
    }
  });
});

describe('polygonPath', () => {
  it('creates a path from a point array', () => {
    const tri = polygonPath([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ]);
    expect(tri.start).toEqual({ x: 0, y: 0 });
    expect(tri.segments).toHaveLength(2);
    const pts = flattenPath(tri);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/shapes.test.ts`
Expected: FAIL — module `./shapes` not found

- [ ] **Step 3: Implement shape factories**

```typescript
// src/geometry/shapes.ts
import type { Point2D, ShapePath } from './types';
import { lineTo, cubicTo, closedPath } from './types';

/** Create a rectangle ShapePath from origin (x,y) and size (w,h). */
export function rectPath(x: number, y: number, w: number, h: number): ShapePath {
  return closedPath(
    { x, y },
    [
      lineTo(x + w, y),
      lineTo(x + w, y + h),
      lineTo(x, y + h),
    ],
  );
}

/**
 * Create an ellipse ShapePath using 4 cubic Bezier arcs.
 * Uses the standard kappa approximation (4/3 * (sqrt(2) - 1) ≈ 0.5523).
 */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): ShapePath {
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;

  return closedPath(
    { x: cx + rx, y: cy },
    [
      // Top-right arc
      cubicTo(cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry),
      // Top-left arc
      cubicTo(cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy),
      // Bottom-left arc
      cubicTo(cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry),
      // Bottom-right arc
      cubicTo(cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy),
    ],
  );
}

/** Create a ShapePath from an array of vertices (all line segments). */
export function polygonPath(points: Point2D[]): ShapePath {
  if (points.length < 3) {
    return closedPath({ x: 0, y: 0 }, []);
  }
  return closedPath(
    { x: points[0].x, y: points[0].y },
    points.slice(1).map(p => lineTo(p.x, p.y)),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/shapes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/shapes.ts src/geometry/shapes.test.ts
git commit -m "feat: add rect, ellipse, and polygon shape factories"
```

---

### Task 4: Clipper2 boolean operations wrapper

**Files:**
- Create: `src/geometry/ops.ts`
- Test: `src/geometry/ops.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/geometry/ops.test.ts
import { describe, expect, it } from 'vitest';
import {
  shapeUnion,
  shapeDifference,
  shapeIntersection,
  shapeXor,
  shapeOffset,
  shapeArea,
  shapeBounds,
  pointInShape,
} from './ops';
import { rectPath, ellipsePath } from './shapes';

describe('boolean ops', () => {
  it('unions two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeUnion([a, b]);
    expect(result.length).toBe(1);
    // Union area should be 28 (4*4 + 4*4 - 2*2 overlap)
    expect(shapeArea(result[0])).toBeCloseTo(28, 0);
  });

  it('differences a small rect from a large rect', () => {
    const big = rectPath(0, 0, 10, 10);
    const hole = rectPath(3, 3, 4, 4);
    const result = shapeDifference(big, [hole]);
    // Remaining area = 100 - 16 = 84
    const totalArea = result.reduce((sum, p) => sum + shapeArea(p), 0);
    expect(totalArea).toBeCloseTo(84, 0);
  });

  it('intersects two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeIntersection([a], [b]);
    expect(result.length).toBe(1);
    expect(shapeArea(result[0])).toBeCloseTo(4, 0);
  });

  it('xors two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeXor([a], [b]);
    const totalArea = result.reduce((sum, p) => sum + shapeArea(p), 0);
    // XOR = union - intersection = 28 - 4 = 24
    expect(totalArea).toBeCloseTo(24, 0);
  });

  it('returns empty array for non-overlapping intersection', () => {
    const a = rectPath(0, 0, 2, 2);
    const b = rectPath(5, 5, 2, 2);
    const result = shapeIntersection([a], [b]);
    expect(result).toHaveLength(0);
  });
});

describe('shapeOffset', () => {
  it('expands a rectangle outward', () => {
    const r = rectPath(0, 0, 4, 4);
    const result = shapeOffset(r, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const expanded = shapeArea(result[0]);
    // Expanded rect should be larger (exact shape depends on join type)
    expect(expanded).toBeGreaterThan(16);
  });

  it('shrinks a rectangle inward with negative delta', () => {
    const r = rectPath(0, 0, 10, 10);
    const result = shapeOffset(r, -2);
    expect(result.length).toBe(1);
    expect(shapeArea(result[0])).toBeCloseTo(36, 0);
  });
});

describe('shapeArea', () => {
  it('computes area of a rectangle', () => {
    const r = rectPath(0, 0, 5, 3);
    expect(shapeArea(r)).toBeCloseTo(15, 1);
  });

  it('computes area of an ellipse', () => {
    const e = ellipsePath(0, 0, 3, 3);
    expect(shapeArea(e)).toBeCloseTo(Math.PI * 9, 0);
  });
});

describe('shapeBounds', () => {
  it('returns the AABB of a rectangle', () => {
    const r = rectPath(2, 3, 4, 5);
    const b = shapeBounds(r);
    expect(b).toEqual({ x: 2, y: 3, width: 4, height: 5 });
  });
});

describe('pointInShape', () => {
  it('detects a point inside a rectangle', () => {
    const r = rectPath(0, 0, 4, 4);
    expect(pointInShape(2, 2, r)).toBe(true);
  });

  it('detects a point outside a rectangle', () => {
    const r = rectPath(0, 0, 4, 4);
    expect(pointInShape(5, 5, r)).toBe(false);
  });

  it('detects a point inside an ellipse', () => {
    const e = ellipsePath(5, 5, 3, 3);
    expect(pointInShape(5, 5, e)).toBe(true);
  });

  it('detects a point outside an ellipse', () => {
    const e = ellipsePath(5, 5, 3, 3);
    expect(pointInShape(0, 0, e)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/ops.test.ts`
Expected: FAIL — module `./ops` not found

- [ ] **Step 3: Implement the Clipper2 wrapper**

```typescript
// src/geometry/ops.ts
import {
  unionD,
  differenceD,
  intersectD,
  xorD,
  inflatePathsD,
  areaD,
  getBoundsD,
  pointInPolygonD,
  FillRule,
  JoinType,
  EndType,
  PointInPolygonResult,
  type PathD,
  type PathsD,
} from 'clipper2-ts';
import type { ShapePath, Point2D } from './types';
import { polygonPath } from './shapes';
import { flattenPath } from './flatten';

/** Default tessellation tolerance for Bezier flattening (in world units). */
const DEFAULT_TOLERANCE = 0.05;

/** Clipper2 precision — number of decimal places (2 = hundredths of a foot). */
const PRECISION = 4;

/** Convert a ShapePath to a Clipper2 PathD by flattening curves. */
function toPathD(shape: ShapePath, tolerance = DEFAULT_TOLERANCE): PathD {
  return flattenPath(shape, tolerance).map(p => ({ x: p.x, y: p.y }));
}

/** Convert multiple ShapePaths to Clipper2 PathsD. */
function toPathsD(shapes: ShapePath[], tolerance = DEFAULT_TOLERANCE): PathsD {
  return shapes.map(s => toPathD(s, tolerance));
}

/** Convert Clipper2 PathsD result back to ShapePaths (polygon-only, no curves). */
function fromPathsD(paths: PathsD): ShapePath[] {
  return paths
    .filter(p => p.length >= 3)
    .map(p => polygonPath(p.map(pt => ({ x: pt.x, y: pt.y }))));
}

/** Union multiple shapes into one or more result shapes. */
export function shapeUnion(shapes: ShapePath[]): ShapePath[] {
  return fromPathsD(unionD(toPathsD(shapes), FillRule.NonZero, PRECISION));
}

/** Subtract clip shapes from a subject shape. */
export function shapeDifference(subject: ShapePath, clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    differenceD(toPathsD([subject]), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/** Intersect subject shapes with clip shapes. */
export function shapeIntersection(subjects: ShapePath[], clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    intersectD(toPathsD(subjects), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/** XOR subject shapes with clip shapes. */
export function shapeXor(subjects: ShapePath[], clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    xorD(toPathsD(subjects), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/**
 * Offset (inflate/deflate) a shape by a distance.
 * Positive delta expands, negative shrinks.
 * joinType controls corner treatment (default: miter for rects, round for curves).
 */
export function shapeOffset(
  shape: ShapePath,
  delta: number,
  joinType: JoinType = JoinType.Miter,
): ShapePath[] {
  return fromPathsD(
    inflatePathsD(
      toPathsD([shape]),
      delta,
      joinType,
      EndType.Polygon,
      2.0,
      PRECISION,
    ),
  );
}

/** Compute the signed area of a shape (positive = counter-clockwise). */
export function shapeArea(shape: ShapePath): number {
  return Math.abs(areaD(toPathD(shape)));
}

/** Compute the axis-aligned bounding box of a shape. */
export function shapeBounds(shape: ShapePath): { x: number; y: number; width: number; height: number } {
  const b = getBoundsD(toPathD(shape));
  return {
    x: b.left,
    y: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top,
  };
}

/** Test if a point is inside a shape. */
export function pointInShape(px: number, py: number, shape: ShapePath): boolean {
  const result = pointInPolygonD({ x: px, y: py }, toPathD(shape), PRECISION);
  return result !== PointInPolygonResult.IsOutside;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/ops.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/ops.ts src/geometry/ops.test.ts
git commit -m "feat: add Clipper2 boolean ops wrapper (union, diff, intersect, xor, offset)"
```

---

### Task 5: Canvas rendering bridge

**Files:**
- Create: `src/geometry/canvas.ts`
- Test: `src/geometry/canvas.test.ts`

- [ ] **Step 1: Write the test**

The Canvas Path2D API is not available in jsdom/vitest by default, so we test the logical output rather than real rendering. We verify that `shapeToCanvasPath` calls the right methods in the right order on a mock context.

```typescript
// src/geometry/canvas.test.ts
import { describe, expect, it, vi } from 'vitest';
import { traceShapePath, tracePolyline } from './canvas';
import { rectPath, ellipsePath } from './shapes';
import { closedPath, cubicTo, lineTo } from './types';

/** Minimal recorder that captures canvas method calls. */
function mockCtx() {
  const calls: { method: string; args: number[] }[] = [];
  return {
    calls,
    moveTo(x: number, y: number) { calls.push({ method: 'moveTo', args: [x, y] }); },
    lineTo(x: number, y: number) { calls.push({ method: 'lineTo', args: [x, y] }); },
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      calls.push({ method: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] });
    },
    closePath() { calls.push({ method: 'closePath', args: [] }); },
  };
}

describe('traceShapePath', () => {
  it('traces a rectangle with moveTo + 3 lineTo + closePath', () => {
    const ctx = mockCtx();
    traceShapePath(ctx, rectPath(1, 2, 3, 4));
    expect(ctx.calls).toEqual([
      { method: 'moveTo', args: [1, 2] },
      { method: 'lineTo', args: [4, 2] },
      { method: 'lineTo', args: [4, 6] },
      { method: 'lineTo', args: [1, 6] },
      { method: 'closePath', args: [] },
    ]);
  });

  it('traces curves with bezierCurveTo', () => {
    const ctx = mockCtx();
    const path = closedPath({ x: 0, y: 0 }, [cubicTo(1, 2, 3, 4, 5, 6)]);
    traceShapePath(ctx, path);
    expect(ctx.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    expect(ctx.calls[1]).toEqual({ method: 'bezierCurveTo', args: [1, 2, 3, 4, 5, 6] });
    expect(ctx.calls[2]).toEqual({ method: 'closePath', args: [] });
  });
});

describe('tracePolyline', () => {
  it('traces a point array as moveTo + lineTo + closePath', () => {
    const ctx = mockCtx();
    tracePolyline(ctx, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
    expect(ctx.calls).toEqual([
      { method: 'moveTo', args: [0, 0] },
      { method: 'lineTo', args: [3, 0] },
      { method: 'lineTo', args: [3, 4] },
      { method: 'closePath', args: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/canvas.test.ts`
Expected: FAIL — module `./canvas` not found

- [ ] **Step 3: Implement the canvas bridge**

```typescript
// src/geometry/canvas.ts
import type { Point2D, ShapePath } from './types';

/**
 * Minimal interface for path-tracing commands.
 * Satisfied by CanvasRenderingContext2D and Path2D.
 */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
}

/**
 * Trace a ShapePath onto a PathSink (ctx or Path2D).
 * Uses native bezierCurveTo for cubic segments — no tessellation needed for rendering.
 */
export function traceShapePath(sink: PathSink, shape: ShapePath): void {
  sink.moveTo(shape.start.x, shape.start.y);
  for (const seg of shape.segments) {
    if (seg.kind === 'line') {
      sink.lineTo(seg.x, seg.y);
    } else {
      sink.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
  }
  sink.closePath();
}

/**
 * Trace a polyline (e.g. from Clipper2 results) onto a PathSink as a closed polygon.
 */
export function tracePolyline(sink: PathSink, points: Point2D[]): void {
  if (points.length === 0) return;
  sink.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    sink.lineTo(points[i].x, points[i].y);
  }
  sink.closePath();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/canvas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/canvas.ts src/geometry/canvas.test.ts
git commit -m "feat: add canvas rendering bridge for ShapePaths and polylines"
```

---

### Task 6: Model converters

**Files:**
- Create: `src/geometry/convert.ts`
- Test: `src/geometry/convert.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/geometry/convert.test.ts
import { describe, expect, it } from 'vitest';
import { structureToShape, zoneToShape } from './convert';
import { flattenPath } from './flatten';
import { shapeArea, pointInShape } from './ops';
import { createStructure, createZone } from '../model/types';

describe('structureToShape', () => {
  it('converts a rectangular structure to a rect path', () => {
    const s = createStructure({ type: 'raised-bed', x: 1, y: 2, width: 4, height: 3 });
    const shape = structureToShape(s);
    const pts = flattenPath(shape);
    expect(pts).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ]);
  });

  it('converts a circular structure to an ellipse path', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 6, height: 6 });
    const shape = structureToShape(s);
    // Should be cubic bezier segments (ellipse)
    expect(shape.segments.every(seg => seg.kind === 'cubic')).toBe(true);
    // Area should approximate π*r²
    expect(shapeArea(shape)).toBeCloseTo(Math.PI * 9, 0);
  });

  it('point-in-shape works for converted rectangle', () => {
    const s = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const shape = structureToShape(s);
    expect(pointInShape(2, 2, shape)).toBe(true);
    expect(pointInShape(5, 5, shape)).toBe(false);
  });

  it('point-in-shape works for converted circle', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 6, height: 6 });
    const shape = structureToShape(s);
    expect(pointInShape(3, 3, shape)).toBe(true);
    expect(pointInShape(0, 0, shape)).toBe(false);
  });
});

describe('zoneToShape', () => {
  it('converts a zone to a rect path', () => {
    const z = createZone({ x: 2, y: 3, width: 5, height: 4 });
    const shape = zoneToShape(z);
    const pts = flattenPath(shape);
    expect(pts).toEqual([
      { x: 2, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 2, y: 7 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/convert.test.ts`
Expected: FAIL — module `./convert` not found

- [ ] **Step 3: Implement converters**

```typescript
// src/geometry/convert.ts
import type { Structure, Zone } from '../model/types';
import type { ShapePath } from './types';
import { rectPath, ellipsePath } from './shapes';

/** Convert a Structure to a ShapePath based on its shape property. */
export function structureToShape(s: Structure): ShapePath {
  if (s.shape === 'circle') {
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    const rx = s.width / 2;
    const ry = s.height / 2;
    return ellipsePath(cx, cy, rx, ry);
  }
  return rectPath(s.x, s.y, s.width, s.height);
}

/** Convert a Zone to a ShapePath (always rectangular for now). */
export function zoneToShape(z: Zone): ShapePath {
  return rectPath(z.x, z.y, z.width, z.height);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/convert.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/convert.ts src/geometry/convert.test.ts
git commit -m "feat: add Structure/Zone to ShapePath converters"
```

---

### Task 7: Public barrel export and integration test

**Files:**
- Create: `src/geometry/index.ts`
- Create: `src/geometry/integration.test.ts`

- [ ] **Step 1: Write the integration test**

This test exercises a realistic scenario: two overlapping raised beds are unioned, then the union is inset by wall thickness, and we verify a point-in-shape check works on the result.

```typescript
// src/geometry/integration.test.ts
import { describe, expect, it } from 'vitest';
import { createStructure } from '../model/types';
import { structureToShape } from './convert';
import { shapeUnion, shapeDifference, shapeOffset, shapeArea, pointInShape, shapeBounds } from './ops';
import { traceShapePath, tracePolyline } from './canvas';
import { flattenPath } from './flatten';

describe('geometry integration', () => {
  it('unions two overlapping raised beds', () => {
    const bed1 = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
    const bed2 = createStructure({ type: 'raised-bed', x: 2, y: 0, width: 4, height: 8 });

    const shape1 = structureToShape(bed1);
    const shape2 = structureToShape(bed2);

    const united = shapeUnion([shape1, shape2]);
    expect(united).toHaveLength(1);

    // Area should be 4*8 + 4*8 - 2*8 = 48
    expect(shapeArea(united[0])).toBeCloseTo(48, 0);

    // Point in the overlap region should be inside
    expect(pointInShape(3, 4, united[0])).toBe(true);
    // Point outside both should be outside
    expect(pointInShape(7, 4, united[0])).toBe(false);
  });

  it('insets a bed by wall thickness', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 10, height: 10 });
    const shape = structureToShape(bed);
    const inset = shapeOffset(shape, -bed.wallThicknessFt);

    expect(inset).toHaveLength(1);
    const bounds = shapeBounds(inset[0]);
    const wall = bed.wallThicknessFt;
    expect(bounds.x).toBeCloseTo(wall, 1);
    expect(bounds.y).toBeCloseTo(wall, 1);
    expect(bounds.width).toBeCloseTo(10 - wall * 2, 1);
    expect(bounds.height).toBeCloseTo(10 - wall * 2, 1);
  });

  it('subtracts a circular pot from a rectangular zone', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 10, height: 10 });
    const pot = createStructure({ type: 'pot', x: 3, y: 3, width: 4, height: 4 });

    const bedShape = structureToShape(bed);
    const potShape = structureToShape(pot);

    const result = shapeDifference(bedShape, [potShape]);
    const area = result.reduce((sum, p) => sum + shapeArea(p), 0);
    // ~100 - π*4 ≈ 87.4
    expect(area).toBeCloseTo(100 - Math.PI * 4, 0);
  });

  it('flattened paths can be traced to a mock canvas sink', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 3 });
    const shape = structureToShape(bed);

    // Trace source shape (uses native bezierCurveTo if curves)
    const calls1: string[] = [];
    const sink1 = {
      moveTo() { calls1.push('moveTo'); },
      lineTo() { calls1.push('lineTo'); },
      bezierCurveTo() { calls1.push('bezierCurveTo'); },
      closePath() { calls1.push('closePath'); },
    };
    traceShapePath(sink1, shape);
    expect(calls1[0]).toBe('moveTo');
    expect(calls1[calls1.length - 1]).toBe('closePath');

    // Trace flattened polyline (only moveTo/lineTo)
    const pts = flattenPath(shape);
    const calls2: string[] = [];
    const sink2 = {
      moveTo() { calls2.push('moveTo'); },
      lineTo() { calls2.push('lineTo'); },
      bezierCurveTo() { calls2.push('bezierCurveTo'); },
      closePath() { calls2.push('closePath'); },
    };
    tracePolyline(sink2, pts);
    expect(calls2).not.toContain('bezierCurveTo');
  });
});
```

- [ ] **Step 2: Create the barrel export**

```typescript
// src/geometry/index.ts
export type { Point2D, LineSeg, CubicSeg, PathSegment, ShapePath } from './types';
export { lineTo, cubicTo, closedPath, segEnd } from './types';
export { flattenPath } from './flatten';
export { rectPath, ellipsePath, polygonPath } from './shapes';
export {
  shapeUnion,
  shapeDifference,
  shapeIntersection,
  shapeXor,
  shapeOffset,
  shapeArea,
  shapeBounds,
  pointInShape,
} from './ops';
export type { PathSink } from './canvas';
export { traceShapePath, tracePolyline } from './canvas';
export { structureToShape, zoneToShape } from './convert';
```

- [ ] **Step 3: Run all geometry tests**

Run: `npx vitest run src/geometry/`
Expected: ALL PASS

- [ ] **Step 4: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/geometry/index.ts src/geometry/integration.test.ts
git commit -m "feat: add geometry barrel export and integration tests"
```

---

### Task 8: Build verification and branch push

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build with no errors

- [ ] **Step 2: Run full test suite one final time**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/clipper2-geometry
```
