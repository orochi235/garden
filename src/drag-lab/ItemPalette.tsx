import { useCallback } from 'react';
import { getAllCultivars } from '@/model/cultivars';
import type { LabItem } from './types';

const GENERIC_COLORS = ['#e07b9b', '#5ba4cf', '#f2c94c', '#7fb069', '#d4734a', '#a89070'];

interface ItemPaletteProps {
  mode: 'generic' | 'cultivar';
  genericRadius: number;
  onSetMode: (mode: 'generic' | 'cultivar') => void;
  onSetGenericRadius: (r: number) => void;
  onDragStart: (item: LabItem) => void;
}

export function ItemPalette({ mode, genericRadius, onSetMode, onSetGenericRadius, onDragStart }: ItemPaletteProps) {
  const cultivars = getAllCultivars();

  const startGenericDrag = useCallback((e: React.DragEvent, color: string) => {
    const item: LabItem = {
      id: crypto.randomUUID(),
      label: 'Item',
      radiusFt: genericRadius,
      color,
      x: 0,
      y: 0,
    };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', '');
    onDragStart(item);
  }, [genericRadius, onDragStart]);

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
        <>
          <label className="dl-slider-row">
            <span>Radius: {genericRadius.toFixed(2)} ft</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={genericRadius}
              onChange={(e) => onSetGenericRadius(Number(e.target.value))}
            />
          </label>
          <div className="dl-palette-grid">
            {GENERIC_COLORS.map((color) => (
              <div
                key={color}
                className="dl-palette-swatch"
                style={{ background: color }}
                draggable
                onDragStart={(e) => startGenericDrag(e, color)}
                title="Drag onto canvas"
              />
            ))}
          </div>
        </>
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
