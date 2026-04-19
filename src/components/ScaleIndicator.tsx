import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useViewMoving } from '../hooks/useViewMoving';
import { formatMeasurement } from '../utils/units';

interface Props {
  canvasHeight: number;
}

export function ScaleIndicator({ canvasHeight }: Props) {
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);
  const garden = useGardenStore((s) => s.garden);
  const cellSize = garden.gridCellSizeFt;
  const unit = garden.displayUnit;
  const moving = useViewMoving();

  const cellPx = cellSize * zoom;
  const label = formatMeasurement(cellSize, unit, cellSize % 1 === 0 ? 0 : 1);

  const margin = 12;
  const targetLeft = margin;
  const targetBottom = canvasHeight - margin;

  const gridXStart = Math.ceil((targetLeft - panX) / (cellSize * zoom));
  const snapLeft = panX + gridXStart * cellSize * zoom;

  const gridYEnd = Math.floor((targetBottom - panY) / (cellSize * zoom));
  const snapBottom = panY + gridYEnd * cellSize * zoom;
  const snapTop = snapBottom - cellPx;

  return (
    <div
      style={{
        position: 'absolute',
        left: snapLeft,
        top: snapTop,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        zIndex: 10,
        opacity: moving ? 0 : 1,
        transition: moving ? 'opacity 0.15s ease-out' : 'opacity 0.3s ease-in 0.2s',
      }}
    >
      <div
        style={{
          width: cellPx,
          height: cellPx,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(0, 0, 0, 0.35)',
          borderRadius: 1,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(0, 0, 0, 0.5)',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {label}<sup>2</sup>
      </span>
    </div>
  );
}
