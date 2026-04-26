/**
 * Geometry module interactive demos.
 * Four canvas-based demos showcasing boolean ops, offset, Bezier curves, and garden scenarios.
 */
import {
  rectPath,
  ellipsePath,
  polygonPath,
  shapeUnion,
  shapeDifference,
  shapeIntersection,
  shapeXor,
  shapeOffset,
  shapeArea,
  shapeBounds,
  isHole,
  minkowskiSum,
  triangulate,
  flattenPath,
  traceShapePath,
  tracePolyline,
  closedPath,
  cubicTo,
  type ShapePath,
  type Point2D,
} from './geometry';
import { JoinType } from 'clipper2-ts';

// ── Layout ──────────────────────────────────────────────────────────────

const root = document.getElementById('root')!;
root.innerHTML = `
<style>
  body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, sans-serif; }
  #root { max-width: 1200px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
  .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; background: #16213e; border: 1px solid #333;
         border-radius: 6px 6px 0 0; cursor: pointer; color: #aaa; font-size: 13px; }
  .tab.active { background: #0f3460; color: #fff; border-bottom-color: #0f3460; }
  .demo-panel { display: none; background: #0f3460; border-radius: 0 8px 8px 8px;
                padding: 16px; border: 1px solid #333; }
  .demo-panel.active { display: block; }
  canvas { background: #0a0a1a; border-radius: 4px; display: block; cursor: crosshair; }
  .controls { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .controls label { font-size: 13px; color: #aaa; }
  .controls select, .controls input[type=range] { font-size: 13px; }
  .info { font-size: 12px; color: #888; margin-top: 8px; font-family: monospace; }
  .controls button { padding: 4px 12px; font-size: 12px; background: #16213e;
                     color: #ccc; border: 1px solid #555; border-radius: 4px; cursor: pointer; }
  .controls button:hover { background: #1a3a6e; }
  .demo-desc { font-size: 13px; color: #bbb; margin-bottom: 12px; }
  details.code-block { margin-top: 12px; }
  details.code-block summary { font-size: 12px; color: #8ab4f8; cursor: pointer;
    user-select: none; padding: 4px 0; }
  details.code-block summary:hover { color: #aaccff; }
  details.code-block pre { background: #0a0a1a; border: 1px solid #333; border-radius: 4px;
    padding: 12px 16px; margin-top: 6px; overflow-x: auto; font-size: 12px; line-height: 1.5; }
  details.code-block code { color: #c8d0d8; font-family: 'SF Mono', 'Fira Code', monospace; }
  details.code-block code .kw { color: #c792ea; }
  details.code-block code .fn { color: #82aaff; }
  details.code-block code .str { color: #c3e88d; }
  details.code-block code .num { color: #f78c6c; }
  details.code-block code .cm { color: #546e7a; }
</style>
<h1>Geometry Module Demos</h1>
<p class="subtitle">Interactive demos for clipper2-ts integration — boolean ops, offset, Bezier curves, garden scenarios</p>
<div class="tabs">
  <div class="tab active" data-tab="boolean">Boolean Ops</div>
  <div class="tab" data-tab="offset">Offset / Inset</div>
  <div class="tab" data-tab="bezier">Bezier Curves</div>
  <div class="tab" data-tab="garden">Garden Scenarios</div>
  <div class="tab" data-tab="minkowski">Minkowski Sum</div>
  <div class="tab" data-tab="holes">Hole Detection</div>
  <div class="tab" data-tab="triangulation">Triangulation</div>
</div>
<div id="panel-boolean" class="demo-panel active"></div>
<div id="panel-offset" class="demo-panel"></div>
<div id="panel-bezier" class="demo-panel"></div>
<div id="panel-garden" class="demo-panel"></div>
<div id="panel-minkowski" class="demo-panel"></div>
<div id="panel-holes" class="demo-panel"></div>
<div id="panel-triangulation" class="demo-panel"></div>
`;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.demo-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${(tab as HTMLElement).dataset.tab}`)!.classList.add('active');
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapePath, fill: string, stroke: string, lineWidth = 1.5) {
  ctx.beginPath();
  traceShapePath(ctx, shape);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawPolyShape(ctx: CanvasRenderingContext2D, shape: ShapePath, fill: string, stroke: string, lineWidth = 1.5) {
  const pts = flattenPath(shape, 0.3);
  ctx.beginPath();
  tracePolyline(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawShapes(ctx: CanvasRenderingContext2D, shapes: ShapePath[], fill: string, stroke: string, lineWidth = 1.5) {
  for (const s of shapes) drawPolyShape(ctx, s, fill, stroke, lineWidth);
}

// ── Demo 1: Boolean Operations ──────────────────────────────────────────

{
  const panel = document.getElementById('panel-boolean')!;
  panel.innerHTML = `
    <p class="demo-desc">Drag the blue shape to see boolean operations update in real time.</p>
    <canvas id="bool-canvas" width="900" height="340"></canvas>
    <div class="controls">
      <label>Shape A: </label>
      <select id="bool-shape-a"><option value="rect">Rectangle</option><option value="circle">Circle</option><option value="triangle">Triangle</option></select>
      <label>Shape B: </label>
      <select id="bool-shape-b"><option value="circle" selected>Circle</option><option value="rect">Rectangle</option><option value="triangle">Triangle</option></select>
    </div>
    <div class="info" id="bool-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="bool-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('bool-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const infoEl = document.getElementById('bool-info')!;
  const codeEl = document.getElementById('bool-code')!;
  const shapeASelect = document.getElementById('bool-shape-a') as HTMLSelectElement;
  const shapeBSelect = document.getElementById('bool-shape-b') as HTMLSelectElement;

  let bx = 130, by = 90;
  let dragging = false;

  function makeShape(type: string, x: number, y: number, size: number): ShapePath {
    switch (type) {
      case 'circle': return ellipsePath(x + size / 2, y + size / 2, size / 2, size / 2);
      case 'triangle': return polygonPath([
        { x: x + size / 2, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
      ]);
      default: return rectPath(x, y, size, size);
    }
  }

  function drawBoolDemo() {
    ctx.clearRect(0, 0, 900, 340);
    const s = 120;
    const a = makeShape(shapeASelect.value, 50, 50, s);
    const b = makeShape(shapeBSelect.value, bx, by, s);

    const ops: { name: string; fn: () => ShapePath[]; col: number }[] = [
      { name: 'Union', fn: () => shapeUnion([a, b]), col: 0 },
      { name: 'Difference', fn: () => shapeDifference(a, [b]), col: 1 },
      { name: 'Intersection', fn: () => shapeIntersection([a], [b]), col: 2 },
      { name: 'XOR', fn: () => shapeXor([a], [b]), col: 3 },
    ];

    const colW = 225;
    for (const op of ops) {
      ctx.save();
      ctx.translate(op.col * colW, 0);

      // Label
      ctx.fillStyle = '#888';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(op.name, colW / 2, 18);

      // Ghost input shapes
      drawShape(ctx, a, 'rgba(230,80,80,0.15)', 'rgba(230,80,80,0.3)');
      drawShape(ctx, b, 'rgba(80,140,230,0.15)', 'rgba(80,140,230,0.3)');

      // Result
      const result = op.fn();
      drawShapes(ctx, result, 'rgba(100,220,150,0.5)', '#6ddb8a', 2);

      ctx.restore();
    }

    const uArea = shapeUnion([a, b]).reduce((s, p) => s + shapeArea(p), 0);
    const iArea = shapeIntersection([a], [b]).reduce((s, p) => s + shapeArea(p), 0);
    infoEl.textContent = `Union area: ${Math.abs(uArea).toFixed(1)}  |  Intersection area: ${Math.abs(iArea).toFixed(1)}  |  Overlap: ${(Math.abs(iArea) > 0.1 ? 'yes' : 'no')}`;

    const shapeCall = (type: string, label: string) => {
      switch (type) {
        case 'circle': return `<span class="kw">const</span> ${label} = <span class="fn">ellipsePath</span>(<span class="num">cx</span>, <span class="num">cy</span>, <span class="num">60</span>, <span class="num">60</span>);`;
        case 'triangle': return `<span class="kw">const</span> ${label} = <span class="fn">polygonPath</span>([...trianglePoints]);`;
        default: return `<span class="kw">const</span> ${label} = <span class="fn">rectPath</span>(<span class="num">x</span>, <span class="num">y</span>, <span class="num">120</span>, <span class="num">120</span>);`;
      }
    };
    codeEl.innerHTML = [
      `<span class="cm">// Create two shapes</span>`,
      shapeCall(shapeASelect.value, 'a'),
      shapeCall(shapeBSelect.value, 'b'),
      ``,
      `<span class="cm">// Boolean operations</span>`,
      `<span class="kw">const</span> union        = <span class="fn">shapeUnion</span>([a, b]);`,
      `<span class="kw">const</span> difference   = <span class="fn">shapeDifference</span>(a, [b]);`,
      `<span class="kw">const</span> intersection = <span class="fn">shapeIntersection</span>([a], [b]);`,
      `<span class="kw">const</span> xor          = <span class="fn">shapeXor</span>([a], [b]);`,
      ``,
      `<span class="cm">// Each returns ShapePath[] — render with traceShapePath(ctx, shape)</span>`,
    ].join('\n');
  }

  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    // Check if click is near shape B in any column (use first column coords)
    if (mx >= bx && mx <= bx + 120 && my >= by && my <= by + 120) dragging = true;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const r = canvas.getBoundingClientRect();
    bx = e.clientX - r.left - 60;
    by = e.clientY - r.top - 60;
    drawBoolDemo();
  });
  canvas.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('mouseleave', () => { dragging = false; });
  shapeASelect.addEventListener('change', drawBoolDemo);
  shapeBSelect.addEventListener('change', drawBoolDemo);
  drawBoolDemo();
}

// ── Demo 2: Offset / Inset ──────────────────────────────────────────────

{
  const panel = document.getElementById('panel-offset')!;
  panel.innerHTML = `
    <p class="demo-desc">Slide the delta to inflate (positive) or deflate (negative) the shape. Compare join types.</p>
    <canvas id="offset-canvas" width="900" height="360"></canvas>
    <div class="controls">
      <label>Delta: <span id="offset-val">0</span></label>
      <input type="range" id="offset-delta" min="-30" max="30" value="0" step="1">
      <label>Shape: </label>
      <select id="offset-shape">
        <option value="rect">Rectangle</option>
        <option value="circle">Circle</option>
        <option value="star">Star</option>
        <option value="L">L-Shape</option>
      </select>
    </div>
    <div class="info" id="offset-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="offset-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('offset-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const deltaSlider = document.getElementById('offset-delta') as HTMLInputElement;
  const deltaLabel = document.getElementById('offset-val')!;
  const shapeSelect = document.getElementById('offset-shape') as HTMLSelectElement;
  const infoEl = document.getElementById('offset-info')!;
  const offsetCodeEl = document.getElementById('offset-code')!;

  function makeStar(cx: number, cy: number, outer: number, inner: number, points: number): ShapePath {
    const pts: Point2D[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * i) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return polygonPath(pts);
  }

  function makeLShape(): ShapePath {
    return polygonPath([
      { x: 200, y: 80 },
      { x: 320, y: 80 },
      { x: 320, y: 160 },
      { x: 260, y: 160 },
      { x: 260, y: 280 },
      { x: 200, y: 280 },
    ]);
  }

  function drawOffsetDemo() {
    ctx.clearRect(0, 0, 900, 360);
    const delta = Number(deltaSlider.value);
    deltaLabel.textContent = String(delta);

    let base: ShapePath;
    switch (shapeSelect.value) {
      case 'circle': base = ellipsePath(300, 180, 70, 70); break;
      case 'star': base = makeStar(300, 180, 80, 35, 5); break;
      case 'L': base = makeLShape(); break;
      default: base = rectPath(220, 100, 160, 160); break;
    }

    const joins: { name: string; type: JoinType; col: number }[] = [
      { name: 'Miter', type: JoinType.Miter, col: 0 },
      { name: 'Round', type: JoinType.Round, col: 1 },
      { name: 'Square', type: JoinType.Square, col: 2 },
    ];

    const colW = 300;
    for (const join of joins) {
      ctx.save();
      ctx.translate(join.col * colW - 150, 0);

      ctx.fillStyle = '#888';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${join.name} Join`, colW / 2 + 150, 18);

      // Original shape
      drawShape(ctx, base, 'rgba(230,80,80,0.25)', 'rgba(230,80,80,0.6)', 1);

      // Offset shape
      if (delta !== 0) {
        const result = shapeOffset(base, delta, join.type);
        drawShapes(ctx, result, 'rgba(80,180,230,0.35)', '#58b8e8', 2);
      }

      ctx.restore();
    }

    const baseArea = Math.abs(shapeArea(base));
    let offsetArea = baseArea;
    if (delta !== 0) {
      const result = shapeOffset(base, delta, JoinType.Miter);
      offsetArea = result.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);
    }
    infoEl.textContent = `Original area: ${baseArea.toFixed(1)}  |  Offset area: ${offsetArea.toFixed(1)}  |  Delta: ${delta > 0 ? '+' : ''}${delta}`;

    const shapeCode = (() => {
      switch (shapeSelect.value) {
        case 'circle': return `<span class="kw">const</span> shape = <span class="fn">ellipsePath</span>(<span class="num">300</span>, <span class="num">180</span>, <span class="num">70</span>, <span class="num">70</span>);`;
        case 'star': return `<span class="kw">const</span> shape = <span class="fn">polygonPath</span>([...starPoints]);`;
        case 'L': return `<span class="kw">const</span> shape = <span class="fn">polygonPath</span>([...lShapePoints]);`;
        default: return `<span class="kw">const</span> shape = <span class="fn">rectPath</span>(<span class="num">220</span>, <span class="num">100</span>, <span class="num">160</span>, <span class="num">160</span>);`;
      }
    })();
    offsetCodeEl.innerHTML = [
      `<span class="cm">// Create shape and apply offset</span>`,
      shapeCode,
      ``,
      `<span class="cm">// Inflate (positive) or deflate (negative)</span>`,
      `<span class="kw">const</span> miter  = <span class="fn">shapeOffset</span>(shape, <span class="num">${delta}</span>, JoinType.<span class="fn">Miter</span>);`,
      `<span class="kw">const</span> round  = <span class="fn">shapeOffset</span>(shape, <span class="num">${delta}</span>, JoinType.<span class="fn">Round</span>);`,
      `<span class="kw">const</span> square = <span class="fn">shapeOffset</span>(shape, <span class="num">${delta}</span>, JoinType.<span class="fn">Square</span>);`,
      ``,
      `<span class="cm">// Measure the result</span>`,
      `<span class="kw">const</span> area = <span class="fn">shapeArea</span>(miter[<span class="num">0</span>]); <span class="cm">// ${offsetArea.toFixed(1)}</span>`,
    ].join('\n');
  }

  deltaSlider.addEventListener('input', drawOffsetDemo);
  shapeSelect.addEventListener('change', drawOffsetDemo);
  drawOffsetDemo();
}

// ── Demo 3: Bezier Curve Editor ─────────────────────────────────────────

{
  const panel = document.getElementById('panel-bezier')!;
  panel.innerHTML = `
    <p class="demo-desc">Drag the control points (yellow handles) to reshape the curve. Adjust tolerance to see tessellation density.</p>
    <canvas id="bezier-canvas" width="900" height="400"></canvas>
    <div class="controls">
      <label>Tolerance: <span id="bezier-tol-val">0.25</span></label>
      <input type="range" id="bezier-tol" min="-2" max="2" value="-0.6" step="0.1">
      <label>Segments: <span id="bezier-seg-count">—</span></label>
      <button id="bezier-reset">Reset</button>
    </div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="bezier-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('bezier-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const tolSlider = document.getElementById('bezier-tol') as HTMLInputElement;
  const tolLabel = document.getElementById('bezier-tol-val')!;
  const segLabel = document.getElementById('bezier-seg-count')!;
  const resetBtn = document.getElementById('bezier-reset')!;
  const bezierCodeEl = document.getElementById('bezier-code')!;

  // Two cubic segments forming a closed shape
  let points = {
    start: { x: 150, y: 300 },
    cp1: { x: 100, y: 80 },
    cp2: { x: 350, y: 50 },
    mid: { x: 500, y: 200 },
    cp3: { x: 650, y: 50 },
    cp4: { x: 800, y: 80 },
    end: { x: 750, y: 300 },
  };

  const defaultPoints = { ...points };
  let dragTarget: keyof typeof points | null = null;

  function buildBezierShape(): ShapePath {
    return closedPath(points.start, [
      cubicTo(points.cp1.x, points.cp1.y, points.cp2.x, points.cp2.y, points.mid.x, points.mid.y),
      cubicTo(points.cp3.x, points.cp3.y, points.cp4.x, points.cp4.y, points.end.x, points.end.y),
    ]);
  }

  function drawBezierDemo() {
    ctx.clearRect(0, 0, 900, 400);
    const tolerance = 10 ** Number(tolSlider.value);
    tolLabel.textContent = tolerance.toFixed(3);

    const shape = buildBezierShape();

    // Draw the smooth Bezier curve
    ctx.beginPath();
    traceShapePath(ctx, shape);
    ctx.fillStyle = 'rgba(100,180,255,0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,180,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw tessellated polyline
    const pts = flattenPath(shape, tolerance);
    segLabel.textContent = String(pts.length);

    ctx.beginPath();
    tracePolyline(ctx, pts);
    ctx.strokeStyle = '#6ddb8a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw tessellation points
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#6ddb8a';
      ctx.fill();
    }

    // Draw control point handles
    const handlePairs: [keyof typeof points, keyof typeof points][] = [
      ['start', 'cp1'], ['cp2', 'mid'], ['mid', 'cp3'], ['cp4', 'end'],
    ];
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,200,50,0.4)';
    ctx.lineWidth = 1;
    for (const [a, b] of handlePairs) {
      ctx.beginPath();
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw control points
    for (const [key, pt] of Object.entries(points)) {
      const isControl = key.startsWith('cp');
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isControl ? 6 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isControl ? '#ffc832' : '#ff6060';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(key, pt.x, pt.y - 12);
    }

    const p = points;
    bezierCodeEl.innerHTML = [
      `<span class="cm">// Build a closed shape from cubic Bezier segments</span>`,
      `<span class="kw">const</span> shape = <span class="fn">closedPath</span>(`,
      `  { <span class="fn">x</span>: <span class="num">${p.start.x}</span>, <span class="fn">y</span>: <span class="num">${p.start.y}</span> },`,
      `  [`,
      `    <span class="fn">cubicTo</span>(<span class="num">${p.cp1.x}</span>, <span class="num">${p.cp1.y}</span>, <span class="num">${p.cp2.x}</span>, <span class="num">${p.cp2.y}</span>, <span class="num">${p.mid.x}</span>, <span class="num">${p.mid.y}</span>),`,
      `    <span class="fn">cubicTo</span>(<span class="num">${p.cp3.x}</span>, <span class="num">${p.cp3.y}</span>, <span class="num">${p.cp4.x}</span>, <span class="num">${p.cp4.y}</span>, <span class="num">${p.end.x}</span>, <span class="num">${p.end.y}</span>),`,
      `  ]`,
      `);`,
      ``,
      `<span class="cm">// Tessellate for Clipper2 (adaptive subdivision)</span>`,
      `<span class="kw">const</span> polyline = <span class="fn">flattenPath</span>(shape, <span class="num">${tolerance.toFixed(3)}</span>);`,
      `<span class="cm">// → ${pts.length} points</span>`,
      ``,
      `<span class="cm">// Render: native bezierCurveTo for smooth, polyline for ops</span>`,
      `<span class="fn">traceShapePath</span>(ctx, shape);  <span class="cm">// smooth curve</span>`,
      `<span class="fn">tracePolyline</span>(ctx, polyline); <span class="cm">// tessellated</span>`,
    ].join('\n');
  }

  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    for (const [key, pt] of Object.entries(points)) {
      if (Math.hypot(mx - pt.x, my - pt.y) < 12) {
        dragTarget = key as keyof typeof points;
        break;
      }
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;
    const r = canvas.getBoundingClientRect();
    points[dragTarget] = { x: e.clientX - r.left, y: e.clientY - r.top };
    drawBezierDemo();
  });
  canvas.addEventListener('mouseup', () => { dragTarget = null; });
  canvas.addEventListener('mouseleave', () => { dragTarget = null; });
  tolSlider.addEventListener('input', drawBezierDemo);
  resetBtn.addEventListener('click', () => {
    points = { ...defaultPoints,
      start: { ...defaultPoints.start }, cp1: { ...defaultPoints.cp1 },
      cp2: { ...defaultPoints.cp2 }, mid: { ...defaultPoints.mid },
      cp3: { ...defaultPoints.cp3 }, cp4: { ...defaultPoints.cp4 },
      end: { ...defaultPoints.end },
    };
    drawBezierDemo();
  });
  drawBezierDemo();
}

// ── Demo 4: Garden Scenarios ────────────────────────────────────────────

{
  const panel = document.getElementById('panel-garden')!;
  panel.innerHTML = `
    <p class="demo-desc">Realistic garden geometry: merge beds, compute plantable area, subtract walkways.</p>
    <canvas id="garden-canvas" width="900" height="500"></canvas>
    <div class="controls">
      <label>Scenario: </label>
      <select id="garden-scenario">
        <option value="merge">Merge overlapping beds</option>
        <option value="inset">Wall inset (plantable area)</option>
        <option value="walkway">Subtract walkway from zone</option>
        <option value="combined">Combined: beds + inset + walkway</option>
      </select>
    </div>
    <div class="info" id="garden-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="garden-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('garden-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const scenarioSelect = document.getElementById('garden-scenario') as HTMLSelectElement;
  const infoEl = document.getElementById('garden-info')!;
  const gardenCodeEl = document.getElementById('garden-code')!;

  // Scale: 1 ft = 30px
  const S = 30;
  const OX = 50, OY = 50;

  function ft(v: number) { return v * S; }
  function drawGround(w: number, h: number) {
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(OX, OY, ft(w), ft(h));
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x++) {
      ctx.beginPath(); ctx.moveTo(OX + ft(x), OY); ctx.lineTo(OX + ft(x), OY + ft(h)); ctx.stroke();
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath(); ctx.moveTo(OX, OY + ft(y)); ctx.lineTo(OX + ft(w), OY + ft(y)); ctx.stroke();
    }
  }

  function scaleShape(shape: ShapePath): ShapePath {
    const pts = flattenPath(shape, 0.05);
    return polygonPath(pts.map(p => ({ x: OX + p.x * S, y: OY + p.y * S })));
  }

  function drawScenarioMerge() {
    ctx.clearRect(0, 0, 900, 500);
    drawGround(25, 14);

    const bed1 = rectPath(2, 2, 6, 4);
    const bed2 = rectPath(5, 2, 6, 4);
    const bed3 = rectPath(3, 5, 5, 4);

    // Draw originals as ghosts
    drawPolyShape(ctx, scaleShape(bed1), 'rgba(139,105,20,0.25)', 'rgba(139,105,20,0.5)');
    drawPolyShape(ctx, scaleShape(bed2), 'rgba(139,105,20,0.25)', 'rgba(139,105,20,0.5)');
    drawPolyShape(ctx, scaleShape(bed3), 'rgba(139,105,20,0.25)', 'rgba(139,105,20,0.5)');

    // Union result
    const merged = shapeUnion([bed1, bed2, bed3]);
    for (const m of merged) {
      drawPolyShape(ctx, scaleShape(m), 'rgba(139,105,20,0.6)', '#c8961e', 2.5);
    }

    // Labels
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('3 beds → 1 merged outline', OX + ft(6), OY + ft(12));

    const area = merged.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);
    infoEl.textContent = `3 beds (6×4, 6×4, 5×4) merged into ${merged.length} shape(s)  |  Total area: ${area.toFixed(1)} sq ft  |  Original sum: ${6*4 + 6*4 + 5*4} sq ft`;

    // Right side: pot union
    const pot1 = ellipsePath(18, 4, 2, 2);
    const pot2 = ellipsePath(20, 4, 2, 2);
    drawPolyShape(ctx, scaleShape(pot1), 'rgba(199,91,57,0.25)', 'rgba(199,91,57,0.5)');
    drawPolyShape(ctx, scaleShape(pot2), 'rgba(199,91,57,0.25)', 'rgba(199,91,57,0.5)');
    const potMerged = shapeUnion([pot1, pot2]);
    for (const m of potMerged) {
      drawPolyShape(ctx, scaleShape(m), 'rgba(199,91,57,0.6)', '#e06030', 2.5);
    }
    ctx.fillText('Overlapping pots merged', OX + ft(19), OY + ft(8));
  }

  function drawScenarioInset() {
    ctx.clearRect(0, 0, 900, 500);
    drawGround(25, 14);

    const wallThickness = 0.5;

    // Rectangular bed
    const bed = rectPath(2, 2, 8, 6);
    const bedInset = shapeOffset(bed, -wallThickness);
    drawPolyShape(ctx, scaleShape(bed), 'rgba(139,105,20,0.7)', '#8B6914', 2);
    for (const s of bedInset) drawPolyShape(ctx, scaleShape(s), 'rgba(92,64,51,0.8)', '#5C4033', 1.5);

    ctx.fillStyle = '#aaa';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Raised bed: 8×6 ft', OX + ft(6), OY + ft(9.5));
    ctx.fillText(`Wall: ${wallThickness} ft`, OX + ft(6), OY + ft(10.5));

    const bedPlantable = bedInset.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);

    // Circular pot
    const pot = ellipsePath(17, 5, 3, 3);
    const potInset = shapeOffset(pot, -0.3, JoinType.Round);
    drawPolyShape(ctx, scaleShape(pot), 'rgba(199,91,57,0.7)', '#C75B39', 2);
    for (const s of potInset) drawPolyShape(ctx, scaleShape(s), 'rgba(92,64,51,0.8)', '#5C4033', 1.5);

    ctx.fillText('Pot: r=3 ft', OX + ft(17), OY + ft(9.5));
    ctx.fillText('Wall: 0.3 ft', OX + ft(17), OY + ft(10.5));

    const potPlantable = potInset.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);

    // Hatch the plantable areas
    for (const s of bedInset) {
      const pts = flattenPath(scaleShape(s), 1);
      const b = shapeBounds(scaleShape(s));
      ctx.save();
      ctx.beginPath();
      tracePolyline(ctx, pts);
      ctx.clip();
      ctx.strokeStyle = 'rgba(100,200,100,0.3)';
      ctx.lineWidth = 0.5;
      for (let y = b.y; y < b.y + b.height; y += 6) {
        ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.width, y); ctx.stroke();
      }
      ctx.restore();
    }

    infoEl.textContent = `Bed plantable: ${bedPlantable.toFixed(1)} sq ft (of ${Math.abs(shapeArea(bed)).toFixed(1)})  |  Pot plantable: ${potPlantable.toFixed(1)} sq ft (of ${Math.abs(shapeArea(pot)).toFixed(1)})`;
  }

  function drawScenarioWalkway() {
    ctx.clearRect(0, 0, 900, 500);
    drawGround(25, 14);

    // Zone
    const zone = rectPath(2, 2, 21, 10);
    drawPolyShape(ctx, scaleShape(zone), 'rgba(127,176,105,0.3)', 'rgba(127,176,105,0.5)');

    // Walkway (cross shape)
    const walkH = rectPath(2, 5.5, 21, 3);
    const walkV = rectPath(10.5, 2, 3, 10);
    const walkway = shapeUnion([walkH, walkV]);

    // Draw walkway
    for (const w of walkway) {
      drawPolyShape(ctx, scaleShape(w), 'rgba(180,170,150,0.5)', '#b4aa96', 1.5);
    }

    // Subtract walkway from zone
    let plantable = [zone] as ShapePath[];
    for (const w of walkway) {
      const next: ShapePath[] = [];
      for (const p of plantable) {
        next.push(...shapeDifference(p, [w]));
      }
      plantable = next;
    }

    for (const p of plantable) {
      drawPolyShape(ctx, scaleShape(p), 'rgba(80,160,60,0.4)', '#50a03c', 2);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Zone minus walkways = plantable quadrants', OX + ft(12.5), OY + ft(13));

    const totalPlantable = plantable.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);
    infoEl.textContent = `Zone: ${Math.abs(shapeArea(zone)).toFixed(0)} sq ft  |  Walkway: ${walkway.reduce((s, w) => s + Math.abs(shapeArea(w)), 0).toFixed(0)} sq ft  |  Plantable: ${totalPlantable.toFixed(0)} sq ft  |  ${plantable.length} regions`;
  }

  function drawScenarioCombined() {
    ctx.clearRect(0, 0, 900, 500);
    drawGround(25, 14);

    // Zone
    const zone = rectPath(1, 1, 23, 12);
    drawPolyShape(ctx, scaleShape(zone), 'rgba(127,176,105,0.15)', 'rgba(127,176,105,0.3)');

    // Beds
    const bed1 = rectPath(2, 2, 6, 4);
    const bed2 = rectPath(6, 2, 6, 4);
    const pot1 = ellipsePath(18, 4, 2.5, 2.5);

    // Walkway
    const walk = rectPath(1, 6.5, 23, 2);

    // Bottom beds
    const bed3 = rectPath(2, 9, 5, 3);
    const bed4 = rectPath(8, 9, 5, 3);
    const pot2 = ellipsePath(18, 10.5, 2, 2);

    // Draw walkway
    drawPolyShape(ctx, scaleShape(walk), 'rgba(212,196,168,0.5)', '#d4c4a8', 1);

    // Draw and merge top beds
    const topMerged = shapeUnion([bed1, bed2]);
    for (const m of topMerged) {
      drawPolyShape(ctx, scaleShape(m), 'rgba(139,105,20,0.6)', '#8B6914', 2);
      const inset = shapeOffset(m, -0.3);
      for (const i of inset) drawPolyShape(ctx, scaleShape(i), 'rgba(92,64,51,0.7)', '#5C4033', 1);
    }

    // Pot
    drawPolyShape(ctx, scaleShape(pot1), 'rgba(199,91,57,0.6)', '#C75B39', 2);
    const pot1Inset = shapeOffset(pot1, -0.2, JoinType.Round);
    for (const i of pot1Inset) drawPolyShape(ctx, scaleShape(i), 'rgba(92,64,51,0.7)', '#5C4033', 1);

    // Bottom beds
    drawPolyShape(ctx, scaleShape(bed3), 'rgba(139,105,20,0.6)', '#8B6914', 2);
    drawPolyShape(ctx, scaleShape(bed4), 'rgba(139,105,20,0.6)', '#8B6914', 2);
    const b3Inset = shapeOffset(bed3, -0.3);
    const b4Inset = shapeOffset(bed4, -0.3);
    for (const i of b3Inset) drawPolyShape(ctx, scaleShape(i), 'rgba(92,64,51,0.7)', '#5C4033', 1);
    for (const i of b4Inset) drawPolyShape(ctx, scaleShape(i), 'rgba(92,64,51,0.7)', '#5C4033', 1);

    drawPolyShape(ctx, scaleShape(pot2), 'rgba(199,91,57,0.6)', '#C75B39', 2);
    const pot2Inset = shapeOffset(pot2, -0.2, JoinType.Round);
    for (const i of pot2Inset) drawPolyShape(ctx, scaleShape(i), 'rgba(92,64,51,0.7)', '#5C4033', 1);

    // Compute total plantable
    const allBeds = [bed1, bed2, bed3, bed4];
    const allPots = [pot1, pot2];
    const bedAreas = allBeds.map(b => {
      const inset = shapeOffset(b, -0.3);
      return inset.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);
    });
    const potAreas = allPots.map(p => {
      const inset = shapeOffset(p, -0.2, JoinType.Round);
      return inset.reduce((s, pp) => s + Math.abs(shapeArea(pp)), 0);
    });
    const total = bedAreas.reduce((a, b) => a + b, 0) + potAreas.reduce((a, b) => a + b, 0);

    infoEl.textContent = `Beds plantable: ${bedAreas.reduce((a, b) => a + b, 0).toFixed(1)} sq ft  |  Pots plantable: ${potAreas.reduce((a, b) => a + b, 0).toFixed(1)} sq ft  |  Total: ${total.toFixed(1)} sq ft`;
  }

  const gardenCodeSnippets: Record<string, string> = {
    merge: [
      `<span class="cm">// Merge overlapping beds into a single outline</span>`,
      `<span class="kw">const</span> bed1 = <span class="fn">rectPath</span>(<span class="num">2</span>, <span class="num">2</span>, <span class="num">6</span>, <span class="num">4</span>);`,
      `<span class="kw">const</span> bed2 = <span class="fn">rectPath</span>(<span class="num">5</span>, <span class="num">2</span>, <span class="num">6</span>, <span class="num">4</span>);`,
      `<span class="kw">const</span> bed3 = <span class="fn">rectPath</span>(<span class="num">3</span>, <span class="num">5</span>, <span class="num">5</span>, <span class="num">4</span>);`,
      ``,
      `<span class="kw">const</span> merged = <span class="fn">shapeUnion</span>([bed1, bed2, bed3]);`,
      `<span class="cm">// → 1 shape, total area accounts for overlap</span>`,
    ].join('\n'),
    inset: [
      `<span class="cm">// Compute plantable area after wall inset</span>`,
      `<span class="kw">const</span> bed = <span class="fn">rectPath</span>(<span class="num">2</span>, <span class="num">2</span>, <span class="num">8</span>, <span class="num">6</span>);`,
      `<span class="kw">const</span> plantable = <span class="fn">shapeOffset</span>(bed, <span class="num">-0.5</span>);`,
      ``,
      `<span class="cm">// Round pot with round join for smooth inset</span>`,
      `<span class="kw">const</span> pot = <span class="fn">ellipsePath</span>(<span class="num">17</span>, <span class="num">5</span>, <span class="num">3</span>, <span class="num">3</span>);`,
      `<span class="kw">const</span> potPlantable = <span class="fn">shapeOffset</span>(pot, <span class="num">-0.3</span>, JoinType.<span class="fn">Round</span>);`,
      ``,
      `<span class="kw">const</span> area = <span class="fn">shapeArea</span>(plantable[<span class="num">0</span>]);`,
    ].join('\n'),
    walkway: [
      `<span class="cm">// Subtract walkway paths from planting zone</span>`,
      `<span class="kw">const</span> zone = <span class="fn">rectPath</span>(<span class="num">2</span>, <span class="num">2</span>, <span class="num">21</span>, <span class="num">10</span>);`,
      `<span class="kw">const</span> walkH = <span class="fn">rectPath</span>(<span class="num">2</span>, <span class="num">5.5</span>, <span class="num">21</span>, <span class="num">3</span>);`,
      `<span class="kw">const</span> walkV = <span class="fn">rectPath</span>(<span class="num">10.5</span>, <span class="num">2</span>, <span class="num">3</span>, <span class="num">10</span>);`,
      `<span class="kw">const</span> walkway = <span class="fn">shapeUnion</span>([walkH, walkV]);`,
      ``,
      `<span class="cm">// Subtract each walkway piece from zone</span>`,
      `<span class="kw">const</span> plantable = <span class="fn">shapeDifference</span>(zone, walkway);`,
      `<span class="cm">// → 4 separate planting quadrants</span>`,
    ].join('\n'),
    combined: [
      `<span class="cm">// Full pipeline: merge → inset → subtract</span>`,
      `<span class="kw">const</span> beds = <span class="fn">shapeUnion</span>([bed1, bed2]);`,
      ``,
      `<span class="cm">// Wall inset for plantable area</span>`,
      `<span class="kw">const</span> plantable = <span class="fn">shapeOffset</span>(beds[<span class="num">0</span>], <span class="num">-0.3</span>);`,
      ``,
      `<span class="cm">// Round pot with round-join inset</span>`,
      `<span class="kw">const</span> pot = <span class="fn">ellipsePath</span>(<span class="num">18</span>, <span class="num">4</span>, <span class="num">2.5</span>, <span class="num">2.5</span>);`,
      `<span class="kw">const</span> potArea = <span class="fn">shapeOffset</span>(pot, <span class="num">-0.2</span>, JoinType.<span class="fn">Round</span>);`,
    ].join('\n'),
  };

  function drawGardenDemo() {
    switch (scenarioSelect.value) {
      case 'merge': drawScenarioMerge(); break;
      case 'inset': drawScenarioInset(); break;
      case 'walkway': drawScenarioWalkway(); break;
      case 'combined': drawScenarioCombined(); break;
    }
    gardenCodeEl.innerHTML = gardenCodeSnippets[scenarioSelect.value] ?? '';
  }

  scenarioSelect.addEventListener('change', drawGardenDemo);
  drawGardenDemo();
}

// ── Demo 5: Minkowski Sum ──────────────────────────────────────────────

{
  const panel = document.getElementById('panel-minkowski')!;
  panel.innerHTML = `
    <p class="demo-desc">Sweep a pattern shape around a base shape's boundary. Useful for computing clearance zones and rounded buffers.</p>
    <canvas id="mink-canvas" width="900" height="420"></canvas>
    <div class="controls">
      <label>Base shape: </label>
      <select id="mink-base">
        <option value="rect">Rectangle</option>
        <option value="triangle">Triangle</option>
        <option value="star">Star</option>
        <option value="L">L-Shape</option>
      </select>
      <label>Pattern: </label>
      <select id="mink-pattern">
        <option value="circle">Circle (clearance)</option>
        <option value="square">Square</option>
        <option value="diamond">Diamond</option>
      </select>
      <label>Radius: <span id="mink-radius-val">20</span></label>
      <input type="range" id="mink-radius" min="5" max="60" value="20" step="1">
    </div>
    <div class="info" id="mink-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="mink-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('mink-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const baseSelect = document.getElementById('mink-base') as HTMLSelectElement;
  const patternSelect = document.getElementById('mink-pattern') as HTMLSelectElement;
  const radiusSlider = document.getElementById('mink-radius') as HTMLInputElement;
  const radiusLabel = document.getElementById('mink-radius-val')!;
  const infoEl = document.getElementById('mink-info')!;
  const codeEl = document.getElementById('mink-code')!;

  function makePatternShape(type: string, r: number): ShapePath {
    switch (type) {
      case 'square': return rectPath(-r, -r, r * 2, r * 2);
      case 'diamond': return polygonPath([
        { x: 0, y: -r }, { x: r, y: 0 }, { x: 0, y: r }, { x: -r, y: 0 },
      ]);
      default: return ellipsePath(0, 0, r, r);
    }
  }

  function makeBaseShape(type: string): ShapePath {
    switch (type) {
      case 'triangle': return polygonPath([
        { x: 450, y: 100 }, { x: 600, y: 320 }, { x: 300, y: 320 },
      ]);
      case 'star': {
        const pts: Point2D[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * i) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? 100 : 45;
          pts.push({ x: 450 + r * Math.cos(angle), y: 210 + r * Math.sin(angle) });
        }
        return polygonPath(pts);
      }
      case 'L': return polygonPath([
        { x: 350, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 200 },
        { x: 420, y: 200 }, { x: 420, y: 330 }, { x: 350, y: 330 },
      ]);
      default: return rectPath(350, 120, 200, 180);
    }
  }

  function drawMinkowskiDemo() {
    ctx.clearRect(0, 0, 900, 420);
    const r = Number(radiusSlider.value);
    radiusLabel.textContent = String(r);

    const base = makeBaseShape(baseSelect.value);
    const pattern = makePatternShape(patternSelect.value, r);

    // Draw the Minkowski sum
    const result = minkowskiSum(base, pattern);
    drawShapes(ctx, result, 'rgba(80,180,230,0.25)', '#58b8e8', 2);

    // Draw original shape on top
    drawShape(ctx, base, 'rgba(230,80,80,0.5)', '#e65050', 2);

    // Draw pattern preview in corner
    ctx.save();
    ctx.translate(80, 80);
    const previewPattern = makePatternShape(patternSelect.value, Math.min(r, 30));
    drawShape(ctx, previewPattern, 'rgba(100,220,150,0.4)', '#6ddb8a', 1.5);
    ctx.fillStyle = '#888';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('pattern', 0, Math.min(r, 30) + 16);
    ctx.restore();

    // Labels
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Blue = Minkowski sum (clearance zone around red shape)', 450, 400);

    const baseArea = Math.abs(shapeArea(base));
    const resultArea = result.reduce((s, p) => s + Math.abs(shapeArea(p)), 0);
    infoEl.textContent = `Base area: ${baseArea.toFixed(1)}  |  Minkowski sum area: ${resultArea.toFixed(1)}  |  Clearance buffer: ${(resultArea - baseArea).toFixed(1)}`;

    codeEl.innerHTML = [
      `<span class="cm">// Define a clearance pattern (centered at origin)</span>`,
      patternSelect.value === 'circle'
        ? `<span class="kw">const</span> pattern = <span class="fn">ellipsePath</span>(<span class="num">0</span>, <span class="num">0</span>, <span class="num">${r}</span>, <span class="num">${r}</span>);`
        : patternSelect.value === 'square'
          ? `<span class="kw">const</span> pattern = <span class="fn">rectPath</span>(<span class="num">${-r}</span>, <span class="num">${-r}</span>, <span class="num">${r*2}</span>, <span class="num">${r*2}</span>);`
          : `<span class="kw">const</span> pattern = <span class="fn">polygonPath</span>([...diamondPoints]);`,
      ``,
      `<span class="cm">// Sweep pattern around the base shape's boundary</span>`,
      `<span class="kw">const</span> clearanceZone = <span class="fn">minkowskiSum</span>(base, pattern);`,
      `<span class="cm">// → area grew from ${baseArea.toFixed(0)} to ${resultArea.toFixed(0)}</span>`,
    ].join('\n');
  }

  baseSelect.addEventListener('change', drawMinkowskiDemo);
  patternSelect.addEventListener('change', drawMinkowskiDemo);
  radiusSlider.addEventListener('input', drawMinkowskiDemo);
  drawMinkowskiDemo();
}

// ── Demo 6: Hole Detection ─────────────────────────────────────────────

{
  const panel = document.getElementById('panel-holes')!;
  panel.innerHTML = `
    <p class="demo-desc">Boolean operations can create holes. Signed area and isHole() distinguish outer boundaries from inner holes.</p>
    <canvas id="holes-canvas" width="900" height="420"></canvas>
    <div class="controls">
      <label>Scenario: </label>
      <select id="holes-scenario">
        <option value="difference">Difference (rect - circle = donut)</option>
        <option value="nested">Nested shapes (frame)</option>
        <option value="multi">Multiple holes (Swiss cheese)</option>
      </select>
    </div>
    <div class="info" id="holes-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="holes-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('holes-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const scenarioSelect = document.getElementById('holes-scenario') as HTMLSelectElement;
  const infoEl = document.getElementById('holes-info')!;
  const codeEl = document.getElementById('holes-code')!;

  function drawHolesDemo() {
    ctx.clearRect(0, 0, 900, 420);
    let shapes: ShapePath[] = [];
    switch (scenarioSelect.value) {
      case 'difference': {
        const outer = rectPath(200, 60, 300, 300);
        const inner = ellipsePath(350, 210, 100, 100);
        shapes = shapeDifference(outer, [inner]);
        break;
      }
      case 'nested': {
        const outer = rectPath(150, 40, 400, 340);
        const mid = rectPath(200, 80, 300, 260);
        const inner = rectPath(250, 120, 200, 180);
        // outer - mid gives frame, then union with inner gives frame + center
        const frame = shapeDifference(outer, [mid]);
        shapes = [...frame, ...shapeDifference(inner, [rectPath(300, 170, 100, 80)])];
        break;
      }
      case 'multi': {
        const base = rectPath(150, 40, 400, 340);
        const h1 = ellipsePath(250, 140, 40, 40);
        const h2 = ellipsePath(400, 140, 40, 40);
        const h3 = ellipsePath(300, 250, 50, 50);
        const h4 = ellipsePath(420, 280, 35, 35);
        const h5 = ellipsePath(220, 300, 30, 30);
        shapes = shapeDifference(base, [h1, h2, h3, h4, h5]);
        break;
      }
    }

    // Draw each shape, color-coded by hole status
    const outers: ShapePath[] = [];
    const holes: ShapePath[] = [];

    for (const s of shapes) {
      if (isHole(s)) {
        holes.push(s);
        drawPolyShape(ctx, s, 'rgba(230,80,80,0.4)', '#e65050', 2);
      } else {
        outers.push(s);
        drawPolyShape(ctx, s, 'rgba(80,180,230,0.4)', '#58b8e8', 2);
      }
    }

    // Labels on each shape
    for (const s of shapes) {
      const b = shapeBounds(s);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const area = shapeArea(s);
      const holeFlag = isHole(s);

      ctx.fillStyle = holeFlag ? '#ff8888' : '#88ccff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(holeFlag ? 'HOLE' : 'OUTER', cx, cy - 8);
      ctx.fillText(`area: ${area.toFixed(1)}`, cx, cy + 8);
    }

    // Legend
    ctx.save();
    ctx.translate(680, 60);
    ctx.fillStyle = 'rgba(80,180,230,0.4)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.strokeStyle = '#58b8e8';
    ctx.strokeRect(0, 0, 16, 16);
    ctx.fillStyle = '#aaa';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Outer (area > 0)', 24, 13);

    ctx.fillStyle = 'rgba(230,80,80,0.4)';
    ctx.fillRect(0, 28, 16, 16);
    ctx.strokeStyle = '#e65050';
    ctx.strokeRect(0, 28, 16, 16);
    ctx.fillStyle = '#aaa';
    ctx.fillText('Hole (area < 0)', 24, 41);
    ctx.restore();

    infoEl.textContent = `${shapes.length} shapes total  |  ${outers.length} outer  |  ${holes.length} holes  |  Net area: ${shapes.reduce((s, p) => s + shapeArea(p), 0).toFixed(1)}`;

    const codeSnippets: Record<string, string> = {
      difference: [
        `<span class="cm">// Boolean difference creates a hole</span>`,
        `<span class="kw">const</span> outer = <span class="fn">rectPath</span>(<span class="num">200</span>, <span class="num">60</span>, <span class="num">300</span>, <span class="num">300</span>);`,
        `<span class="kw">const</span> inner = <span class="fn">ellipsePath</span>(<span class="num">350</span>, <span class="num">210</span>, <span class="num">100</span>, <span class="num">100</span>);`,
        `<span class="kw">const</span> result = <span class="fn">shapeDifference</span>(outer, [inner]);`,
        ``,
        `<span class="cm">// Detect holes vs outer boundaries</span>`,
        `result.<span class="fn">forEach</span>(s => {`,
        `  <span class="fn">console.log</span>(<span class="fn">isHole</span>(s), <span class="fn">shapeArea</span>(s));`,
        `}); <span class="cm">// → outer: +area, hole: -area</span>`,
      ].join('\n'),
      nested: [
        `<span class="cm">// Nested differences create frames</span>`,
        `<span class="kw">const</span> frame = <span class="fn">shapeDifference</span>(outer, [middle]);`,
        `<span class="kw">const</span> center = <span class="fn">shapeDifference</span>(inner, [cutout]);`,
        ``,
        `<span class="cm">// Filter by winding direction</span>`,
        `<span class="kw">const</span> solids = result.<span class="fn">filter</span>(s => !<span class="fn">isHole</span>(s));`,
        `<span class="kw">const</span> holes  = result.<span class="fn">filter</span>(s => <span class="fn">isHole</span>(s));`,
      ].join('\n'),
      multi: [
        `<span class="cm">// Punch multiple holes at once</span>`,
        `<span class="kw">const</span> base = <span class="fn">rectPath</span>(<span class="num">150</span>, <span class="num">40</span>, <span class="num">400</span>, <span class="num">340</span>);`,
        `<span class="kw">const</span> holes = [h1, h2, h3, h4, h5].<span class="fn">map</span>(`,
        `  (c, i) => <span class="fn">ellipsePath</span>(c.x, c.y, c.r, c.r)`,
        `);`,
        `<span class="kw">const</span> swiss = <span class="fn">shapeDifference</span>(base, holes);`,
        `<span class="cm">// isHole() on each result shape identifies the cutouts</span>`,
      ].join('\n'),
    };
    codeEl.innerHTML = codeSnippets[scenarioSelect.value] ?? '';
  }

  scenarioSelect.addEventListener('change', drawHolesDemo);
  drawHolesDemo();
}

// ── Demo 7: Triangulation ──────────────────────────────────────────────

{
  const panel = document.getElementById('panel-triangulation')!;
  panel.innerHTML = `
    <p class="demo-desc">Decompose any polygon into triangles. Useful for WebGL rendering, centroid computation, and physics.</p>
    <canvas id="tri-canvas" width="900" height="420"></canvas>
    <div class="controls">
      <label>Shape: </label>
      <select id="tri-shape">
        <option value="rect">Rectangle</option>
        <option value="circle">Circle</option>
        <option value="star">Star</option>
        <option value="L">L-Shape</option>
        <option value="arrow">Arrow</option>
      </select>
      <button id="tri-color-toggle">Toggle colors</button>
    </div>
    <div class="info" id="tri-info"></div>
    <details class="code-block">
      <summary>View code</summary>
      <pre><code id="tri-code"></code></pre>
    </details>
  `;

  const canvas = document.getElementById('tri-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const shapeSelect = document.getElementById('tri-shape') as HTMLSelectElement;
  const colorToggle = document.getElementById('tri-color-toggle')!;
  const infoEl = document.getElementById('tri-info')!;
  const codeEl = document.getElementById('tri-code')!;

  let showColors = true;

  const triColors = [
    'rgba(230,80,80,0.4)', 'rgba(80,180,230,0.4)', 'rgba(100,220,150,0.4)',
    'rgba(220,180,50,0.4)', 'rgba(180,100,220,0.4)', 'rgba(220,120,80,0.4)',
    'rgba(80,220,200,0.4)', 'rgba(200,80,180,0.4)',
  ];

  function makeTriShape(type: string): ShapePath {
    switch (type) {
      case 'circle': return ellipsePath(450, 210, 140, 140);
      case 'star': {
        const pts: Point2D[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * i) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? 150 : 65;
          pts.push({ x: 450 + r * Math.cos(angle), y: 210 + r * Math.sin(angle) });
        }
        return polygonPath(pts);
      }
      case 'L': return polygonPath([
        { x: 280, y: 60 }, { x: 430, y: 60 }, { x: 430, y: 180 },
        { x: 350, y: 180 }, { x: 350, y: 360 }, { x: 280, y: 360 },
      ]);
      case 'arrow': return polygonPath([
        { x: 450, y: 50 }, { x: 600, y: 210 }, { x: 520, y: 210 },
        { x: 520, y: 370 }, { x: 380, y: 370 }, { x: 380, y: 210 },
        { x: 300, y: 210 },
      ]);
      default: return rectPath(280, 80, 340, 260);
    }
  }

  function drawTriDemo() {
    ctx.clearRect(0, 0, 900, 420);
    const shape = makeTriShape(shapeSelect.value);

    // Draw original outline
    drawShape(ctx, shape, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 1);

    // Triangulate
    let tris: ShapePath[];
    try {
      tris = triangulate(shape);
    } catch {
      ctx.fillStyle = '#ff6060';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Triangulation failed for this shape', 450, 210);
      infoEl.textContent = 'Error: triangulation failed';
      return;
    }

    // Draw triangles
    for (let i = 0; i < tris.length; i++) {
      const fill = showColors ? triColors[i % triColors.length] : 'rgba(80,180,230,0.15)';
      const stroke = showColors ? fill.replace('0.4', '0.8') : 'rgba(80,180,230,0.6)';
      drawPolyShape(ctx, tris[i], fill, stroke, 1);
    }

    // Draw triangle centroids
    for (const tri of tris) {
      const pts = flattenPath(tri, 1);
      if (pts.length >= 3) {
        const cx = (pts[0].x + pts[1].x + pts[2].x) / 3;
        const cy = (pts[0].y + pts[1].y + pts[2].y) / 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
      }
    }

    const totalArea = Math.abs(shapeArea(shape));
    const triAreaSum = tris.reduce((s, t) => s + Math.abs(shapeArea(t)), 0);
    infoEl.textContent = `${tris.length} triangles  |  Shape area: ${totalArea.toFixed(1)}  |  Triangle sum: ${triAreaSum.toFixed(1)}  |  Error: ${Math.abs(totalArea - triAreaSum).toFixed(4)}`;

    codeEl.innerHTML = [
      `<span class="cm">// Decompose any shape into triangles</span>`,
      `<span class="kw">const</span> shape = <span class="fn">${shapeSelect.value === 'circle' ? 'ellipsePath' : shapeSelect.value === 'rect' ? 'rectPath' : 'polygonPath'}</span>(...);`,
      `<span class="kw">const</span> triangles = <span class="fn">triangulate</span>(shape);`,
      `<span class="cm">// → ${tris.length} triangles</span>`,
      ``,
      `<span class="cm">// Each triangle is a 3-point ShapePath</span>`,
      `<span class="cm">// Area is conserved: ${totalArea.toFixed(1)} ≈ ${triAreaSum.toFixed(1)}</span>`,
      ``,
      `<span class="cm">// Useful for WebGL rendering, physics, centroids</span>`,
      `<span class="kw">for</span> (<span class="kw">const</span> tri <span class="kw">of</span> triangles) {`,
      `  <span class="fn">traceShapePath</span>(ctx, tri);`,
      `}`,
    ].join('\n');
  }

  shapeSelect.addEventListener('change', drawTriDemo);
  colorToggle.addEventListener('click', () => {
    showColors = !showColors;
    drawTriDemo();
  });
  drawTriDemo();
}
