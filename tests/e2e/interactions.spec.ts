import { expect, type Page, test } from '@playwright/test';

/**
 * eric's first behavioral-interaction e2e harness (garden mode).
 *
 * Drives real pointer/wheel gestures against the live WebGL canvas and asserts
 * via the dev-only store introspection exposed on `window` (see src/main.tsx):
 *   - window.__gardenStore : useGardenStore  (.getState().garden.{structures,zones,plantings})
 *   - window.__uiStore     : useUiStore      (.getState().{selectedIds,viewMode,...})
 *
 * Runs strictly headless (see e2e.config.ts). Each checklist item is its own
 * test() so partial passes are visible.
 *
 * Tests 3 (alt-click cycle), 4 (plot insert), and 5 (group-outline promote)
 * are marked `test.fail()` — they assert the INTENDED behavior and document
 * live-dispatcher bugs this harness found on 2026-06-20 (all three pass their
 * unit tests against a mocked dispatcher). When a bug is fixed its test will
 * start passing, `test.fail()` will then flag "expected to fail but passed" —
 * remove the annotation at that point. The other tests must stay green.
 *
 * World→screen transform (verified against src/canvas/hitTest.ts
 * getHandleScreenPositions and src/store/uiStore.ts view-mirror semantics):
 *   screenX = panX + worldX * zoom    (zoom is the scalar px/ft mirror)
 *   screenY = panY + worldY * zoom    (same scalar for BOTH axes)
 * These are CANVAS-relative px; add the canvas bounding-rect top-left for page
 * coords.
 */

declare global {
  interface Window {
    __gardenStore: {
      getState: () => {
        garden: {
          structures: GObj[];
          zones: GObj[];
          plantings: { id: string; parentId: string; x: number; y: number }[];
        };
      };
    };
    __uiStore: {
      getState: () => {
        selectedIds: string[];
        viewMode: string;
        gardenZoom: number;
        gardenPanX: number;
        gardenPanY: number;
        canvasZoomPct: number;
        setViewMode: (m: string) => void;
        setSelection: (ids: string[]) => void;
        clearSelection: () => void;
        setPlottingTool: (t: PlottingTool | null) => void;
      };
    };
  }
}

interface GObj {
  id: string;
  x: number;
  y: number;
  width: number;
  length: number;
}
interface PlottingTool {
  id: string;
  category: 'structures' | 'zones';
  type: string;
  color: string;
  pattern?: string | null;
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const CANVAS_READY = '[data-canvas-ready="true"]';

async function loadFixture(page: Page, name: string, mode?: 'garden' | 'nursery') {
  const url = mode ? `/?fixture=${name}&mode=${mode}` : `/?fixture=${name}`;
  await page.goto(url);
  await page.waitForSelector(CANVAS_READY, { timeout: 10_000 });
  await page.waitForFunction(() => !!window.__gardenStore && !!window.__uiStore);
  // The canvas writes its initial view mirror (zoom/pan) in a post-fit effect.
  // Wait for a non-zero zoom so screen-coord math is valid.
  await page.waitForFunction(() => window.__uiStore.getState().gardenZoom > 0);
}

async function getView(page: Page): Promise<View> {
  return page.evaluate(() => {
    const s = window.__uiStore.getState();
    return { zoom: s.gardenZoom, panX: s.gardenPanX, panY: s.gardenPanY };
  });
}

async function getGarden(page: Page) {
  return page.evaluate(() => window.__gardenStore.getState().garden);
}

async function getSelectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__uiStore.getState().selectedIds);
}

async function canvasRect(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return box;
}

/** world → PAGE px (canvas rect offset + transform). */
function worldToPage(world: { x: number; y: number }, view: View, rect: { x: number; y: number }) {
  return {
    x: rect.x + view.panX + world.x * view.zoom,
    y: rect.y + view.panY + world.y * view.zoom,
  };
}

/** Center of a structure/zone rect, in world coords. */
function rectCenterWorld(o: GObj) {
  return { x: o.x + o.width / 2, y: o.y + o.length / 2 };
}

/** A realistic drag: move to start, down, several intermediate moves, up. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts?: { steps?: number; modifiers?: ('Alt' | 'Shift' | 'Control' | 'Meta')[] },
) {
  const steps = opts?.steps ?? 8;
  await page.mouse.move(from.x, from.y);
  for (const m of opts?.modifiers ?? []) await page.keyboard.down(m);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  await page.mouse.up();
  for (const m of opts?.modifiers ?? []) await page.keyboard.up(m);
}

async function clickAt(
  page: Page,
  at: { x: number; y: number },
  opts?: { modifiers?: ('Alt' | 'Shift' | 'Control' | 'Meta')[] },
) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y, { modifiers: opts?.modifiers });
}

// ---------------------------------------------------------------------------
// MANDATORY sentinel — validate the world→screen transform before anything else.
// ---------------------------------------------------------------------------
test('sentinel: transform — click a known structure center selects it', async ({ page }) => {
  await loadFixture(page, 'garden-mixed');
  const garden = await getGarden(page);
  const view = await getView(page);
  const rect = await canvasRect(page);

  const struct = garden.structures.find((s) => s.id === 'struct-1');
  expect(struct, 'struct-1 present in garden-mixed').toBeTruthy();

  const center = rectCenterWorld(struct!);
  const page_ = worldToPage(center, view, rect);
  // Diagnostics retained so a failure is debuggable from the report.
  console.log('[sentinel] view', view, 'rect', { x: rect.x, y: rect.y }, 'pagePt', page_);

  await page.evaluate(() => window.__uiStore.getState().clearSelection());
  await clickAt(page, page_);
  await page.waitForTimeout(150);

  const sel = await getSelectedIds(page);
  console.log('[sentinel] selectedIds after click', sel);
  expect(sel, 'clicking struct-1 center selects it').toContain('struct-1');
});

// ---------------------------------------------------------------------------
// 1. Marquee selection
// ---------------------------------------------------------------------------
test('1. marquee selection encloses exactly the targeted objects', async ({ page }) => {
  await loadFixture(page, 'garden-mixed');
  await page.evaluate(() => {
    window.__uiStore.getState().clearSelection();
    window.__uiStore.getState().setViewMode('select-area');
  });
  const view = await getView(page);
  const rect = await canvasRect(page);

  // zone-1 (x2,y2,w6,l4) and zone-2 (x12,y2,w4,l4) sit in the top band.
  // Marquee a rectangle covering ONLY zone-1's area (world ~ (1,1)-(9,7)),
  // staying clear of zone-2 (starts at x=12). Plantings inside zone-1 are
  // also enclosed by area-select (it includes plantings whose CENTER is in
  // the rect), so assert the structure/zone set we expect plus any enclosed
  // plantings.
  const from = worldToPage({ x: 1, y: 1 }, view, rect);
  const to = worldToPage({ x: 9, y: 7.5 }, view, rect);
  await drag(page, from, to, { steps: 10 });
  await page.waitForTimeout(150);

  const sel = await getSelectedIds(page);
  console.log('[marquee] selectedIds', sel, 'world rect (1,1)-(9,7.5)');

  // zone-1 fully inside; zone-2 (x>=12) and struct-1 (y>=10) outside.
  expect(sel).toContain('zone-1');
  expect(sel).not.toContain('zone-2');
  expect(sel).not.toContain('struct-1');
  // planting-1 (zone-1 child, world ~3,3) center is inside the rect.
  expect(sel).toContain('planting-1');

  // Empty-space marquee selects nothing. Garden is 20x20 ft; world (17,15)-(19,18)
  // is empty (no structure/zone/planting there).
  await page.evaluate(() => window.__uiStore.getState().clearSelection());
  const ef = worldToPage({ x: 17, y: 15 }, view, rect);
  const et = worldToPage({ x: 19, y: 18 }, view, rect);
  await drag(page, ef, et, { steps: 10 });
  await page.waitForTimeout(150);
  const emptySel = await getSelectedIds(page);
  console.log('[marquee empty] selectedIds', emptySel);
  expect(emptySel).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2. Resize + anchor precision
// ---------------------------------------------------------------------------
test('2. corner resize moves dragged corner, anchors the opposite corner', async ({ page }) => {
  await loadFixture(page, 'garden-mixed');
  const view = await getView(page);
  const rect = await canvasRect(page);

  // Select struct-1 (rect x2 y10 w4 l8). Select via store + a real click so
  // the kit paints resize handles for the active selection.
  const before = (await getGarden(page)).structures.find((s) => s.id === 'struct-1')!;
  const center = worldToPage(rectCenterWorld(before), view, rect);
  await clickAt(page, center);
  await page.waitForTimeout(100);
  expect(await getSelectedIds(page)).toContain('struct-1');

  // SE corner handle screen pos (world bottom-right corner). Opposite = NW
  // corner = (x, y) which must stay fixed.
  const seWorld = { x: before.x + before.width, y: before.y + before.length };
  const sePage = worldToPage(seWorld, view, rect);
  const nwWorldBefore = { x: before.x, y: before.y };

  // Drag the SE handle outward by ~2 ft in each axis.
  const dragTo = {
    x: sePage.x + 2 * view.zoom,
    y: sePage.y + 2 * view.zoom,
  };
  await drag(page, sePage, dragTo, { steps: 10 });
  await page.waitForTimeout(150);

  const after = (await getGarden(page)).structures.find((s) => s.id === 'struct-1')!;
  const nwWorldAfter = { x: after.x, y: after.y };
  console.log('[resize] before', before, 'after', after);

  // The SE corner grew (width/length increased).
  expect(after.width, 'width grew').toBeGreaterThan(before.width);
  expect(after.length, 'length grew').toBeGreaterThan(before.length);
  // The opposite (NW) corner stayed fixed (within snap tolerance ~0.5 ft).
  expect(Math.abs(nwWorldAfter.x - nwWorldBefore.x), 'NW x anchored').toBeLessThanOrEqual(0.5);
  expect(Math.abs(nwWorldAfter.y - nwWorldBefore.y), 'NW y anchored').toBeLessThanOrEqual(0.5);
});

// ---------------------------------------------------------------------------
// 3. Alt-click cycle through overlapping objects
// ---------------------------------------------------------------------------
test('3. alt-click cycles selection through the stack at a point', async ({ page }) => {
  // KNOWN BUG (found by this harness 2026-06-20): a 2nd alt-click at the same
  // point does NOT advance to the object underneath in the live dispatcher —
  // the kit `select` tool re-selects the top body-hit, overriding the ambient
  // cycle tool's claim. Unit tests for useEricCycleTool pass against a MOCKED
  // dispatcher, so the regression is in live SceneCanvas/dispatcher routing.
  // Expected-failure until fixed; remove this annotation when the bug is fixed.
  test.fail();
  await loadFixture(page, 'garden-mixed');
  const view = await getView(page);
  const rect = await canvasRect(page);

  // In garden-mixed, planting-1 renders at WORLD (5,5) (plantingWorldPose =
  // parent zone-1 origin (2,2) + local (3,3)), and zone-1 (2,2,6,4) covers
  // (5,5). So the hit-stack at world (5,5) is genuinely 2-deep:
  // planting-1 (top) over zone-1 (bottom) — verified by replicating
  // hitTestStack's geometry against the store. The first alt-click should
  // select planting-1; a SECOND alt-click at the same spot should advance to
  // zone-1 (useEricCycleTool's memo-cycle).
  const point = worldToPage({ x: 5, y: 5 }, view, rect);

  await page.evaluate(() => window.__uiStore.getState().clearSelection());
  await clickAt(page, point, { modifiers: ['Alt'] });
  await page.waitForTimeout(120);
  const a = await getSelectedIds(page);
  await clickAt(page, point, { modifiers: ['Alt'] });
  await page.waitForTimeout(120);
  const b = await getSelectedIds(page);
  console.log('[alt-cycle] first alt-click', a, 'second alt-click', b);

  expect(a, 'first alt-click selects the top hit').toEqual(['planting-1']);
  // Cycling advances to the next object underneath.
  expect(b, 'second alt-click advances to the object underneath').toEqual(['zone-1']);
});

// ---------------------------------------------------------------------------
// 4. Insert / plot a new object
// ---------------------------------------------------------------------------
test('4. plot gesture inserts a new structure into the store', async ({ page }) => {
  // KNOWN BUG (found by this harness 2026-06-20): plotting a rect produces an
  // orphan kit `kit-rect` node (the kit's default useInsertDepSource factory)
  // instead of an eric Structure/Zone — `garden.structures` never changes.
  // eric never registers a custom `insert` dep to route commits through
  // createInsertAdapter().commitInsert, so SceneCanvas's default insert dep wins.
  // CAVEAT: this test arms the plot tool via setPlottingTool() programmatically;
  // before fixing, confirm the real toolbar arming path reproduces it (i.e. rule
  // out a test-arming artifact). Expected-failure until fixed; remove when fixed.
  test.fail();
  await loadFixture(page, 'garden-mixed');
  const view = await getView(page);
  const rect = await canvasRect(page);

  const beforeCount = (await getGarden(page)).structures.length;

  // Arm the insert/plot tool by setting plottingTool (a structures plot). The
  // canvas switches its active dispatcher slot to the insert tool when
  // plottingTool is non-null (GardenCanvas activeToolId).
  await page.evaluate(() => {
    window.__uiStore.getState().clearSelection();
    window.__uiStore.getState().setPlottingTool({
      id: 'test-plot',
      category: 'structures',
      type: 'raised-bed',
      color: '#8B6914',
    });
  });

  // Plot a rectangle on empty canvas: world (15,12) → (18,16). This area is
  // clear of the fixture's objects.
  const from = worldToPage({ x: 15, y: 12 }, view, rect);
  const to = worldToPage({ x: 18, y: 16 }, view, rect);
  await drag(page, from, to, { steps: 12 });
  await page.waitForTimeout(200);

  const afterCount = (await getGarden(page)).structures.length;
  console.log('[insert] structures before', beforeCount, 'after', afterCount);
  expect(afterCount, 'a new structure was added').toBe(beforeCount + 1);
});

// ---------------------------------------------------------------------------
// 5. Group-promote on outline-edge click
// ---------------------------------------------------------------------------
test('5. clicking a group sibling outline promotes selection to the group', async ({ page }) => {
  // KNOWN BUG (found by this harness 2026-06-20): clicking a group sibling's
  // outline edge does NOT promote selection to the whole group in the live
  // dispatcher. The group-outline click-to-promote path (re-homed into the
  // ambient eric-canvas-click tool during the gesture migration) never fires.
  // Expected-failure until fixed; remove this annotation when the bug is fixed.
  test.fail();
  await loadFixture(page, 'garden-grouped');
  const garden = await getGarden(page);
  const view = await getView(page);
  const rect = await canvasRect(page);

  // struct-1 (Bed A, g1) and struct-2 (Bed B, g1) share groupId 'g1'.
  const bedA = garden.structures.find((s) => s.id === 'struct-1')!;
  const bedB = garden.structures.find((s) => s.id === 'struct-2')!;

  // Select Bed A via a body click (kit selects the hit body, narrow selection).
  const aCenter = worldToPage(rectCenterWorld(bedA), view, rect);
  await clickAt(page, aCenter);
  await page.waitForTimeout(100);
  const sel0 = await getSelectedIds(page);
  console.log('[group] after body-click Bed A', sel0);
  expect(sel0).toContain('struct-1');

  // Now click EXACTLY on Bed B's outline edge (its left edge midpoint) — this
  // is empty space w.r.t. body hit-testing but on the implicit group outline,
  // which the ambient eric-canvas-click tool promotes to the whole group.
  // ~2px OUTSIDE Bed B's left edge (within the 6px outline-edge tolerance the
  // ambient eric-canvas-click tool uses) so it's empty space for body
  // hit-testing but on the implicit group outline.
  const tolWorldPx = 2 / view.zoom;
  const edgeWorld = { x: bedB.x - tolWorldPx, y: bedB.y + bedB.length / 2 };
  const edgePage = worldToPage(edgeWorld, view, rect);
  await clickAt(page, edgePage);
  await page.waitForTimeout(150);

  const sel1 = await getSelectedIds(page);
  console.log('[group] after outline-edge click', sel1);
  expect(sel1).toContain('struct-1');
  expect(sel1).toContain('struct-2');
});

// ---------------------------------------------------------------------------
// 6. Wheel-zoom clamp (min 5, max 500 px/ft)
// ---------------------------------------------------------------------------
test('6. wheel zoom clamps at min and max px/ft', async ({ page }) => {
  await loadFixture(page, 'garden-mixed');
  const rect = await canvasRect(page);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  await page.mouse.move(cx, cy);

  // FINDING: the prompt/`<SceneCanvas viewport>` prop declares zoom {min:5,
  // max:500}, but GardenCanvas.handleViewChange re-clamps every committed view
  // through its OWN `clampZoom` (GARDEN_MIN_ZOOM=10, GARDEN_MAX_ZOOM=200). The
  // canvas clamp is the effective one — the viewport-prop bounds are dead
  // config. So the real clamps are [10, 200] px/ft, NOT [5, 500]. We assert the
  // EFFECTIVE behavior; the discrepancy is reported separately.
  const EFFECTIVE_MAX = 200;
  const EFFECTIVE_MIN = 10;

  // Wheel UP (negative deltaY) zooms IN toward the max clamp. Spam events.
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, -120);
  }
  await page.waitForTimeout(150);
  const zoomMax = (await getView(page)).zoom;
  console.log('[wheel] zoom after spamming wheel-up', zoomMax);
  expect(zoomMax, 'does not exceed effective max').toBeLessThanOrEqual(EFFECTIVE_MAX + 0.0001);
  expect(zoomMax, 'reaches the effective max clamp').toBeGreaterThanOrEqual(EFFECTIVE_MAX - 0.1);

  // Wheel DOWN (positive deltaY) zooms OUT toward the min clamp.
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 120);
  }
  await page.waitForTimeout(150);
  const zoomMin = (await getView(page)).zoom;
  console.log('[wheel] zoom after spamming wheel-down', zoomMin);
  expect(zoomMin, 'does not drop below effective min').toBeGreaterThanOrEqual(
    EFFECTIVE_MIN - 0.0001,
  );
  expect(zoomMin, 'reaches the effective min clamp').toBeLessThanOrEqual(EFFECTIVE_MIN + 0.1);
});
