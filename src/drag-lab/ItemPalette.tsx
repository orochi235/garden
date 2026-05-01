import { useCallback } from 'react';
import { getAllCultivars } from '@/model/cultivars';
import type { LabItem } from './types';
import { useDragHandle, type DragPayload } from '@orochi235/weasel';

function makeCircleGhost(radiusFt: number, color: string): HTMLElement {
  const diamPx = Math.max(Math.round(radiusFt * 2 * 40), 16);
  const wrap = document.createElement('div');
  wrap.style.width = `${diamPx}px`;
  wrap.style.height = `${diamPx}px`;
  wrap.style.borderRadius = '50%';
  wrap.style.background = color;
  wrap.style.border = '1.5px solid #fff';
  wrap.style.opacity = '0.85';
  return wrap;
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
}

export function ItemPalette({ mode, onSetMode }: ItemPaletteProps) {
  const cultivars = getAllCultivars();

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
              <GenericPaletteItem
                key={gi.color}
                gi={gi}
                sizePx={sizePx}
              />
            );
          })}
        </div>
      )}

      {mode === 'cultivar' && (
        <div className="dl-palette-list">
          {cultivars.slice(0, 30).map((c) => (
            <CultivarPaletteItem key={c.id} cultivar={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenericPaletteItem({ gi, sizePx }: { gi: { color: string; radiusFt: number }; sizePx: number }) {
  const getPayload = useCallback((): DragPayload => {
    const item: LabItem = {
      id: crypto.randomUUID(),
      label: 'Item',
      radiusFt: gi.radiusFt,
      color: gi.color,
      x: 0,
      y: 0,
    };
    return { kind: 'lab-item', ids: [item.id], data: item };
  }, [gi]);

  const handle = useDragHandle(getPayload, {
    createGhost: () => makeCircleGhost(gi.radiusFt, gi.color),
  });

  return (
    <div
      className="dl-palette-circle"
      style={{
        background: gi.color,
        width: sizePx,
        height: sizePx,
        ...handle.style,
      }}
      onPointerDown={handle.onPointerDown}
      title={`${gi.radiusFt} ft radius`}
    />
  );
}

function CultivarPaletteItem({ cultivar }: { cultivar: ReturnType<typeof getAllCultivars>[number] }) {
  const getPayload = useCallback((): DragPayload => {
    const item: LabItem = {
      id: crypto.randomUUID(),
      label: cultivar.name,
      radiusFt: cultivar.spacingFt / 2,
      color: cultivar.color,
      x: 0,
      y: 0,
      cultivarId: cultivar.id,
    };
    return { kind: 'lab-item', ids: [item.id], data: item };
  }, [cultivar]);

  const handle = useDragHandle(getPayload, {
    createGhost: () => makeCircleGhost(cultivar.spacingFt / 2, cultivar.color),
  });

  return (
    <div
      className="dl-palette-cultivar"
      style={handle.style}
      onPointerDown={handle.onPointerDown}
    >
      <span className="dl-cultivar-dot" style={{ background: cultivar.color }} />
      <span className="dl-cultivar-name">{cultivar.name}</span>
      <span className="dl-cultivar-spacing">{cultivar.spacingFt}ft</span>
    </div>
  );
}
