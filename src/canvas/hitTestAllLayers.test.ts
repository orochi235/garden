import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { hitTestAllLayers } from './hitTest';

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

  it('prefers zones over structures when overlapping (zones render on top)', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('zones');
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

  it('falls through to structures when zones are locked', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    useUiStore.getState().setLayerLocked('zones', true);

    const { structures, zones } = useGardenStore.getState().garden;
    const hit = hitTestAllLayers(2, 2, structures, zones);
    expect(hit).not.toBeNull();
    expect(hit!.layer).toBe('structures');
  });
});
