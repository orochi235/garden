import { useEffect, useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

const ROTATE_DURATION = 150; // ms

interface CanvasKeyboardDeps {
  clipboard: { copy: () => void; paste: () => void; isEmpty: () => boolean };
  cancelPlotting: () => void;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useCanvasKeyboard({ clipboard, cancelPlotting }: CanvasKeyboardDeps) {
  const rotateAnims = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    function animateRotation(
      id: string,
      layer: 'structures' | 'zones',
      fromW: number,
      fromH: number,
      toW: number,
      toH: number,
      finalRotation: number,
    ) {
      // Cancel any existing animation on this object
      const existing = rotateAnims.current.get(id);
      if (existing) cancelAnimationFrame(existing);

      const { updateStructure, updateZone } = useGardenStore.getState();
      const update = layer === 'structures' ? updateStructure : updateZone;
      const startTime = performance.now();

      function tick(now: number) {
        const rawT = Math.min((now - startTime) / ROTATE_DURATION, 1);
        const t = easeOut(rawT);
        const w = fromW + (toW - fromW) * t;
        const h = fromH + (toH - fromH) * t;
        update(id, { width: w, height: h });

        if (rawT < 1) {
          rotateAnims.current.set(id, requestAnimationFrame(tick));
        } else {
          rotateAnims.current.delete(id);
          // Final snap with rotation value
          const finalUpdate =
            layer === 'structures'
              ? { width: toW, height: toH, rotation: finalRotation }
              : { width: toW, height: toH };
          update(id, finalUpdate);
        }
      }

      rotateAnims.current.set(id, requestAnimationFrame(tick));
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useGardenStore.getState().redo();
        } else {
          useGardenStore.getState().undo();
        }
        return;
      }

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        clipboard.copy();
        return;
      }

      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboard.isEmpty()) return;
        e.preventDefault();
        clipboard.paste();
        return;
      }

      if (e.key === 'Escape') {
        cancelPlotting();
        return;
      }

      // Rotate selected objects
      if (e.key === 'r' || e.key === 'R') {
        if (
          (e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'SELECT'
        )
          return;
        const ids = useUiStore.getState().selectedIds;
        if (ids.length === 0) return;
        const { garden } = useGardenStore.getState();
        const ccw = e.shiftKey; // Shift+R = counter-clockwise
        // Checkpoint once before all rotations
        useGardenStore.getState().checkpoint();
        for (const id of ids) {
          const structure = garden.structures.find((s) => s.id === id);
          if (structure && structure.shape !== 'circle') {
            const newRotation = ccw
              ? (structure.rotation - 90 + 360) % 360
              : (structure.rotation + 90) % 360;
            animateRotation(
              id,
              'structures',
              structure.width,
              structure.height,
              structure.height,
              structure.width,
              newRotation,
            );
            continue;
          }
          const zone = garden.zones.find((z) => z.id === id);
          if (zone) {
            animateRotation(id, 'zones', zone.width, zone.height, zone.height, zone.width, 0);
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          (e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'SELECT'
        )
          return;
        const ids = useUiStore.getState().selectedIds;
        const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();
        for (const id of ids) {
          if (garden.structures.find((s) => s.id === id)) removeStructure(id);
          else if (garden.zones.find((z) => z.id === id)) removeZone(id);
          else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
        }
        useUiStore.getState().clearSelection();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      for (const rafId of rotateAnims.current.values()) {
        cancelAnimationFrame(rafId);
      }
      rotateAnims.current.clear();
    };
  }, [clipboard, cancelPlotting]);
}
