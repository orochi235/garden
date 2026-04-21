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
  const leafCount = 5;
  const leafLen = radius * 0.85;
  const leafWidth = radius * 0.2;

  // Compound leaves (longer, narrower)
  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount + 0.2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(leafLen * 0.5, 0, leafLen * 0.5, leafWidth, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3A6B30';
    ctx.fill();
    ctx.strokeStyle = '#2D5A27';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // Center stem
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#2D5A27';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function renderPepper(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  const leafCount = 4;
  const leafLen = radius * 0.8;
  const leafWidth = radius * 0.3;

  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount + Math.PI / 4;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(leafLen * 0.45, 0, leafLen * 0.5, leafWidth, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4A8040';
    ctx.fill();
    ctx.strokeStyle = '#2D5A27';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
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

function renderGeneric(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#2D4F3A';
  ctx.lineWidth = 1;
  ctx.stroke();
}

const renderers: Record<string, PlantRenderer> = {
  basil: renderBasil,
  tomato: renderTomato,
  pepper: renderPepper,
  lettuce: renderLettuce,
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
