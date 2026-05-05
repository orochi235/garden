import { useGardenStore } from '../../store/gardenStore';

const ROTATE_DURATION = 150;
const activeAnimations = new Map<string, number>();

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function animateRotation(
  id: string,
  layer: 'structures' | 'zones',
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
  finalRotation: number,
): void {
  const existing = activeAnimations.get(id);
  if (existing) cancelAnimationFrame(existing);

  const { updateStructure, updateZone } = useGardenStore.getState();
  const update = layer === 'structures' ? updateStructure : updateZone;
  const startTime = performance.now();

  function tick(now: number) {
    const rawT = Math.min((now - startTime) / ROTATE_DURATION, 1);
    const t = easeOut(rawT);
    const w = fromW + (toW - fromW) * t;
    const h = fromH + (toH - fromH) * t;
    update(id, { width: w, length: h });

    if (rawT < 1) {
      activeAnimations.set(id, requestAnimationFrame(tick));
    } else {
      activeAnimations.delete(id);
      const finalUpdate =
        layer === 'structures'
          ? { width: toW, length: toH, rotation: finalRotation }
          : { width: toW, length: toH };
      update(id, finalUpdate);
    }
  }

  activeAnimations.set(id, requestAnimationFrame(tick));
}
