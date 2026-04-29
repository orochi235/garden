import { describe, expect, it, vi } from 'vitest';
import { SELECTION_LAYERS } from './selectionLayers';
import type { SystemLayerData } from '../layerData';
import type { Planting, Structure, Zone } from '../../model/types';

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 30 }),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

const baseView = { panX: 0, panY: 0, zoom: 1 };

function makeStructure(over: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    type: 'raised-bed',
    x: 0, y: 0, width: 10, height: 10,
    color: '#ccc',
    rotation: 0,
    label: 'Bed',
    container: true,
    plantableArea: null,
    parentStructureId: null,
    children: [],
    ...over,
  } as unknown as Structure;
}

function makeZone(over: Partial<Zone> = {}): Zone {
  return {
    id: 'z1',
    x: 0, y: 0, width: 10, height: 10,
    color: '#aabbcc',
    zIndex: 0,
    label: 'Zone',
    pattern: null,
    ...over,
  } as Zone;
}

function makePlanting(over: Partial<Planting> = {}): Planting {
  return {
    id: 'p1',
    parentId: 's1',
    cultivarId: 'basil-genovese',
    x: 1,
    y: 2,
    label: '',
    icon: null,
    ...over,
  } as Planting;
}

function makeData(over: Partial<SystemLayerData> = {}): SystemLayerData {
  return {
    selectedIds: [],
    structures: [],
    zones: [],
    plantings: [],
    view: baseView,
    canvasWidth: 800,
    canvasHeight: 600,
    ...over,
  };
}

describe('SELECTION_LAYERS', () => {
  it('exposes a single always-on selection-boxes layer', () => {
    expect(SELECTION_LAYERS).toHaveLength(1);
    expect(SELECTION_LAYERS[0].id).toBe('selection-boxes');
    expect(SELECTION_LAYERS[0].alwaysOn).toBe(true);
  });

  it('draws nothing when nothing is selected', () => {
    const ctx = makeCtx();
    SELECTION_LAYERS[0].draw(ctx, makeData({ structures: [makeStructure()] }));
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('draws a dashed bbox + handles for a selected structure', () => {
    const ctx = makeCtx();
    SELECTION_LAYERS[0].draw(ctx, makeData({
      selectedIds: ['s1'],
      structures: [makeStructure()],
    }));
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 3]);
    expect(ctx.strokeRect).toHaveBeenCalled();
    // 8 resize handles, each fillRect + strokeRect
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('draws an ellipse outline for circular selected objects', () => {
    const ctx = makeCtx();
    const z = makeZone({ id: 'z1' }) as Zone & { shape?: string };
    (z as Zone & { shape: string }).shape = 'circle';
    SELECTION_LAYERS[0].draw(ctx, makeData({
      selectedIds: ['z1'],
      zones: [z],
    }));
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it('draws a dashed circle for selected plantings using parent offset', () => {
    const ctx = makeCtx();
    SELECTION_LAYERS[0].draw(ctx, makeData({
      selectedIds: ['p1'],
      structures: [makeStructure({ id: 's1', x: 5, y: 5 } as Partial<Structure>)],
      plantings: [makePlanting({ parentId: 's1', x: 1, y: 2 })],
    }));
    expect(ctx.arc).toHaveBeenCalled();
  });
});
