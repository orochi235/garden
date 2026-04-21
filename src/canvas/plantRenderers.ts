/**
 * Per-plant-type top-down renderers.
 * Each renderer draws a plant centered at (0, 0) within the given radius.
 */

type PlantRenderer = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  color: string,
) => void;

function renderBasil(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  const leafCount = 6;
  const leafLen = radius * 0.75;
  const leafWidth = radius * 0.35;

  // Leaves radiating from center
  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(leafLen * 0.5, 0, leafLen * 0.5, leafWidth, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#2D5A27';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#2D5A27';
  ctx.fill();
}

function renderTomato(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  // Tomato plants from above: sprawling compound pinnate leaves on branching stems
  // Outer canopy — irregular, bushy spread of compound leaves
  const branches = 6;
  for (let i = 0; i < branches; i++) {
    const angle = (i * Math.PI * 2) / branches + (i % 2) * 0.3;
    ctx.save();
    ctx.rotate(angle);

    // Main branch stem
    const branchLen = radius * (0.7 + (i % 3) * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(branchLen, 0);
    ctx.strokeStyle = '#4A6A30';
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.stroke();

    // Compound leaflets along the branch (pinnate arrangement)
    const leaflets = 4;
    for (let j = 1; j <= leaflets; j++) {
      const pos = (j / (leaflets + 0.5)) * branchLen;
      const leafletLen = radius * 0.3 * (1 - j * 0.1);
      const leafletWidth = leafletLen * 0.45;
      const side = j % 2 === 0 ? 1 : -1;

      ctx.save();
      ctx.translate(pos, 0);
      ctx.rotate(side * 0.5);
      ctx.beginPath();
      // Pointed, serrated-looking leaflet shape
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(leafletLen * 0.3, -leafletWidth, leafletLen * 0.7, -leafletWidth * 0.8, leafletLen, 0);
      ctx.bezierCurveTo(leafletLen * 0.7, leafletWidth * 0.8, leafletLen * 0.3, leafletWidth, 0, 0);
      ctx.fillStyle = '#3A6B30';
      ctx.fill();
      ctx.strokeStyle = '#2D5520';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.restore();
    }

    // Terminal leaflet (larger)
    ctx.save();
    ctx.translate(branchLen, 0);
    const termLen = radius * 0.28;
    const termWidth = termLen * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(termLen * 0.4, -termWidth, termLen * 0.8, -termWidth * 0.7, termLen, 0);
    ctx.bezierCurveTo(termLen * 0.8, termWidth * 0.7, termLen * 0.4, termWidth, 0, 0);
    ctx.fillStyle = '#4A7A38';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // Center — visible fruit clusters peeking through foliage
  ctx.beginPath();
  ctx.arc(radius * 0.12, -radius * 0.08, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#2D5520';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-radius * 0.08, radius * 0.1, radius * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function renderPepper(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  // Pepper plant from above: upright, compact with broad pointed leaves in pairs
  // More structured/symmetrical than tomato, with a visible Y-branching habit
  const branchPairs = 4;

  for (let i = 0; i < branchPairs; i++) {
    const angle = (i * Math.PI * 2) / branchPairs + 0.2;
    ctx.save();
    ctx.rotate(angle);

    // Branch
    const branchLen = radius * (0.55 + (i % 2) * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(branchLen, 0);
    ctx.strokeStyle = '#3A5A28';
    ctx.lineWidth = Math.max(1, radius * 0.07);
    ctx.stroke();

    // Broad, pointed ovate leaves — peppers have smooth-edged, waxy leaves
    const leafLen = radius * 0.45;
    const leafWidth = leafLen * 0.4;

    // Left leaf
    ctx.save();
    ctx.translate(branchLen * 0.5, 0);
    ctx.rotate(-0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(leafLen * 0.2, -leafWidth, leafLen * 0.6, -leafWidth * 0.9, leafLen, 0);
    ctx.bezierCurveTo(leafLen * 0.6, leafWidth * 0.9, leafLen * 0.2, leafWidth, 0, 0);
    ctx.fillStyle = '#4A8040';
    ctx.fill();
    ctx.strokeStyle = '#2D5A20';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // Midrib
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leafLen * 0.9, 0);
    ctx.strokeStyle = '#3A6A30';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.restore();

    // Right leaf
    ctx.save();
    ctx.translate(branchLen * 0.75, 0);
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(leafLen * 0.2, -leafWidth, leafLen * 0.6, -leafWidth * 0.9, leafLen, 0);
    ctx.bezierCurveTo(leafLen * 0.6, leafWidth * 0.9, leafLen * 0.2, leafWidth, 0, 0);
    ctx.fillStyle = '#3D7538';
    ctx.fill();
    ctx.strokeStyle = '#2D5A20';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // Center stem node
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#3A5A28';
  ctx.fill();

  // A pepper or two visible among leaves
  ctx.save();
  ctx.translate(radius * 0.15, radius * 0.05);
  ctx.rotate(0.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.06, radius * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#2D5A20';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.restore();
}

function renderLettuce(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  // Rosette of overlapping rounded leaves
  const layers = 3;
  for (let layer = layers; layer >= 1; layer--) {
    const count = layer + 3;
    const r = radius * (layer / layers) * 0.85;
    const w = r * 0.5;
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count + (layer * 0.3);
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(r * 0.4, 0, r * 0.45, w, 0, 0, Math.PI * 2);
      ctx.fillStyle = layer === 1 ? '#A8D48A' : color;
      ctx.fill();
      ctx.restore();
    }
  }
}

function renderCucumber(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  // Large palmate leaves radiating from center, like a vine viewed from above
  const leafCount = 5;
  const leafLen = radius * 0.9;
  const leafWidth = radius * 0.45;

  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount;
    ctx.save();
    ctx.rotate(angle);

    // Broad, lobed leaf shape
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(leafLen * 0.3, -leafWidth * 0.6, leafLen * 0.7, -leafWidth * 0.8, leafLen, -leafWidth * 0.2);
    ctx.bezierCurveTo(leafLen * 1.05, 0, leafLen * 1.05, 0, leafLen, leafWidth * 0.2);
    ctx.bezierCurveTo(leafLen * 0.7, leafWidth * 0.8, leafLen * 0.3, leafWidth * 0.6, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#1A5C18';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Leaf vein
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leafLen * 0.85, 0);
    ctx.strokeStyle = '#1A5C18';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.restore();
  }

  // Center node
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = '#1A5C18';
  ctx.fill();

  // Curling tendrils
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + Math.PI / 5;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(radius * 0.4, 0);
    ctx.quadraticCurveTo(radius * 0.7, -radius * 0.15, radius * 0.6, -radius * 0.3);
    ctx.strokeStyle = '#5DAE55';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }
}

function renderCarrot(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  // Feathery carrot tops viewed from above — fine fronds radiating from center
  const frondCount = 8;

  for (let i = 0; i < frondCount; i++) {
    const angle = (i * Math.PI * 2) / frondCount;
    const frondLen = radius * (0.75 + Math.random() * 0.2);
    ctx.save();
    ctx.rotate(angle);

    // Main stem of frond
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(frondLen, 0);
    ctx.strokeStyle = '#3A7A30';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Tiny leaflets along the stem
    const leaflets = 4;
    for (let j = 1; j <= leaflets; j++) {
      const pos = (j / (leaflets + 1)) * frondLen;
      const leafletLen = radius * 0.18;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos + leafletLen * 0.3, -leafletLen);
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos + leafletLen * 0.3, leafletLen);
      ctx.strokeStyle = '#4A9A40';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Center crown (top of the root showing)
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#C07830';
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function renderGeneric(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = radius * 0.25;
  ctx.setLineDash([radius * 0.3, radius * 0.2]);
  ctx.stroke();
  ctx.setLineDash([]);
}

const renderers: Record<string, PlantRenderer> = {
  basil: renderBasil,
  'thai-basil': renderBasil,
  tomato: renderTomato,
  'black-krim-tomato': renderTomato,
  'cherokee-purple-tomato': renderTomato,
  'valencia-tomato': renderTomato,
  'chocolate-cherry-tomato': renderTomato,
  'san-marzano-tomato': renderTomato,
  'bell-pepper': renderPepper,
  jalapeno: renderPepper,
  poblano: renderPepper,
  shishito: renderPepper,
  anaheim: renderPepper,
  habanero: renderPepper,
  tomatillo: renderTomato,
  'ground-cherry': renderTomato,
  eggplant: renderPepper,
  lettuce: renderLettuce,
  kale: renderLettuce,
  cucumber: renderCucumber,
  honeydew: renderCucumber,
  watermelon: renderCucumber,
  carrot: renderCarrot,
  radish: renderCarrot,
  parsnip: renderCarrot,
  potato: renderCarrot,
  zucchini: renderCucumber,
  'summer-squash': renderCucumber,
  strawberry: renderLettuce,
};

export function renderPlant(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
): void {
  const renderer = renderers[cultivarId] ?? renderGeneric;
  renderer(ctx, radius, color);
}
