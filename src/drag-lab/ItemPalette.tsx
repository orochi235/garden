import { useCallback } from 'react';
import { getAllCultivars } from '@/model/cultivars';
import type { LabItem } from './types';

const PX_PER_FT = 160;

/** Create an offscreen canvas drag image sized to the item's actual canvas size. */
function setCircleDragImage(e: React.DragEvent, radiusFt: number, color: string): void {
  const diamPx = Math.round(radiusFt * 2 * PX_PER_FT);
  const size = Math.max(diamPx, 4);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.position = 'fixed';
  canvas.style.left = '-9999px';
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  document.body.appendChild(canvas);
  e.dataTransfer.setDragImage(canvas, size / 2, size / 2);
  requestAnimationFrame(() => canvas.remove());
}

const GENERIC_ITEMS: { color: string; radiusFt: number }[] = [
  { color: '#e07b9b', radiusFt: 0.15 },
  { color: '#5ba4cf', radiusFt: 0.25 },
  { color: '#f2c94c', radiusFt: 0.4 },
  { color: '#7fb069', radiusFt: 0.55 },
  { color: '#d4734a', radiusFt: 0.75 },
  { color: '#a89070', radiusFt: 1.0 },
];

interface ItemPaletteProps {
  mode: 'generic' | 'cultivar';
  onSetMode: (mode: 'generic' | 'cultivar') => void;
  onDragStart: (item: LabItem) => void;
}

export function ItemPalette({ mode, onSetMode, onDragStart }: ItemPaletteProps) {
  const cultivars = getAllCultivars();

  const startGenericDrag = useCallback((e: React.DragEvent, gi: typeof GENERIC_ITEMS[number]) => {
    const item: LabItem = {
      id: crypto.randomUUID(),
      label: 'Item',
      radiusFt: gi.radiusFt,
      color: gi.color,
      x: 0,
      y: 0,
    };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', '');
    setCircleDragImage(e, gi.radiusFt, gi.color);
    onDragStart(item);
  }, [onDragStart]);

  const startCultivarDrag = useCallback((e: React.DragEvent, cultivarId: string) => {
    const c = cultivars.find((cv) => cv.id === cultivarId);
    if (!c) return;
    const item: LabItem = {
      id: crypto.randomUUID(),
      label: c.name,
      radiusFt: c.spacingFt / 2,
      color: c.color,
      x: 0,
      y: 0,
      cultivarId: c.id,
    };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', '');
    setCircleDragImage(e, c.spacingFt / 2, c.color);
    onDragStart(item);
  }, [cultivars, onDragStart]);

  return (
    <div className="dl-palette">
      <div className="dl-palette-tabs">
        <button type="button" className={mode === 'generic' ? 'active' : ''} onClick={() => onSetMode('generic')}>
          Generic
        </button>
        <button type="button" className={mode === 'cultivar' ? 'active' : ''} onClick={() => onSetMode('cultivar')}>
          Cultivars
        </button>
      </div>

      {mode === 'generic' && (
        <div className="dl-palette-circles">
          {GENERIC_ITEMS.map((gi) => {
            const sizePx = Math.max(16, gi.radiusFt * 2 * 40);
            return (
              <div
                key={gi.color}
                className="dl-palette-circle"
                style={{
                  background: gi.color,
                  width: sizePx,
                  height: sizePx,
                }}
                draggable
                onDragStart={(e) => startGenericDrag(e, gi)}
                title={`${gi.radiusFt} ft radius`}
              />
            );
          })}
        </div>
      )}

      {mode === 'cultivar' && (
        <div className="dl-palette-list">
          {cultivars.slice(0, 30).map((c) => (
            <div
              key={c.id}
              className="dl-palette-cultivar"
              draggable
              onDragStart={(e) => startCultivarDrag(e, c.id)}
            >
              <span className="dl-cultivar-dot" style={{ background: c.color }} />
              <span className="dl-cultivar-name">{c.name}</span>
              <span className="dl-cultivar-spacing">{c.spacingFt}ft</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
