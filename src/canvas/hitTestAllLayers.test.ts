import { describe, it, expect, beforeEach } from 'vitest';
import { hitTestAllLayers } from './hitTest';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';

describe('hitTestAllLayers', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('hits a structure regardless of active layer', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useUiStore.getState().setActiveLayer('zones');

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('structures');
  });

  it('hits a zone regardless of active layer', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    useUiStore.getState().setActiveLayer('structures');

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('zones');
  });

  it('prefers structures over zones when overlapping', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('structures');
  });

  it('returns null when nothing is hit', () => {
    const hit = hitTestAllLayers(100, 100, [], []);
    expect(hit).toBeNull();
  });

  it('skips locked layers', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useUiStore.getState().setLayerLocked('structures', true);

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).toBeNull();
  });

  it('falls through to zones when structures are locked', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    useUiStore.getState().setLayerLocked('structures', true);

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('zones');
  });
});
