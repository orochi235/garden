import { getAllCultivars } from '@/model/cultivars';
import type { LabItem } from './types';

const GENERIC_COLORS = ['#e07b9b', '#5ba4cf', '#f2c94c', '#7fb069', '#d4734a', '#a89070'];

interface ItemPaletteProps {
  mode: 'generic' | 'cultivar';
  genericRadius: number;
  onSetMode: (mode: 'generic' | 'cultivar') => void;
  onSetGenericRadius: (r: number) => void;
  onPickItem: (item: LabItem) => void;
}

export function ItemPalette({ mode, genericRadius, onSetMode, onSetGenericRadius, onPickItem }: ItemPaletteProps) {
  const cultivars = getAllCultivars();

  const handleGenericClick = (color: string) => {
    onPickItem({
      id: crypto.randomUUID(),
      label: 'Item',
      radiusFt: genericRadius,
      color,
      x: 0,
      y: 0,
    });
  };

  const handleCultivarClick = (cultivarId: string) => {
    const c = cultivars.find((cv) => cv.id === cultivarId);
    if (!c) return;
    onPickItem({
      id: crypto.randomUUID(),
      label: c.name,
      radiusFt: c.spacingFt / 2,
      color: c.color,
      x: 0,
      y: 0,
      cultivarId: c.id,
    });
  };

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
              <button
                key={color}
                type="button"
                className="dl-palette-swatch"
                style={{ background: color }}
                onClick={() => handleGenericClick(color)}
                title="Click to pick, then click canvas to place"
              />
            ))}
          </div>
        </>
      )}

      {mode === 'cultivar' && (
        <div className="dl-palette-list">
          {cultivars.slice(0, 30).map((c) => (
            <button
              key={c.id}
              type="button"
              className="dl-palette-cultivar"
              onClick={() => handleCultivarClick(c.id)}
            >
              <span className="dl-cultivar-dot" style={{ background: c.color }} />
              <span className="dl-cultivar-name">{c.name}</span>
              <span className="dl-cultivar-spacing">{c.spacingFt}ft</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
