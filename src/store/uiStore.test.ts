import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('initializes with defaults', () => {
    const state = useUiStore.getState();
    expect(state.activeLayer).toBe('structures');
    expect(state.selectedIds).toEqual([]);
    expect(state.gardenZoom).toBe(1);
    expect(state.gardenPanX).toBe(0);
    expect(state.gardenPanY).toBe(0);
    expect(state.gardenViewRequest).toBeNull();
  });

  it('sets active layer', () => {
    useUiStore.getState().setActiveLayer('zones');
    expect(useUiStore.getState().activeLayer).toBe('zones');
  });

  it('manages selection', () => {
    const { select, addToSelection, clearSelection } = useUiStore.getState();
    select('obj-1');
    expect(useUiStore.getState().selectedIds).toEqual(['obj-1']);
    addToSelection('obj-2');
    expect(useUiStore.getState().selectedIds).toEqual(['obj-1', 'obj-2']);
    clearSelection();
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('canvas mirrors local view back to the store', () => {
    useUiStore.getState().setGardenViewMirror(32, 50, 100);
    const s = useUiStore.getState();
    expect(s.gardenZoom).toBe(32);
    expect(s.gardenPanX).toBe(50);
    expect(s.gardenPanY).toBe(100);
  });

  it('outside actors enqueue garden view requests; canvas applies & clears', () => {
    useUiStore.getState().setGardenViewRequest({ kind: 'set-zoom', value: 64 });
    expect(useUiStore.getState().gardenViewRequest).toEqual({ kind: 'set-zoom', value: 64 });
    useUiStore.getState().setGardenViewRequest({ kind: 'set-pan', x: 50, y: 100 });
    expect(useUiStore.getState().gardenViewRequest).toEqual({ kind: 'set-pan', x: 50, y: 100 });
    useUiStore.getState().setGardenViewRequest({ kind: 'reset' });
    expect(useUiStore.getState().gardenViewRequest).toEqual({ kind: 'reset' });
    useUiStore.getState().setGardenViewRequest(null);
    expect(useUiStore.getState().gardenViewRequest).toBeNull();
  });

  it('manages layer visibility', () => {
    useUiStore.getState().setLayerVisible('zones', false);
    expect(useUiStore.getState().layerVisibility.zones).toBe(false);
    expect(useUiStore.getState().layerVisibility.structures).toBe(true);
  });

  it('manages layer opacity', () => {
    useUiStore.getState().setLayerOpacity('zones', 0.5);
    expect(useUiStore.getState().layerOpacity.zones).toBe(0.5);
  });

  it('manages layer lock', () => {
    useUiStore.getState().setLayerLocked('plantings', true);
    expect(useUiStore.getState().layerLocked.plantings).toBe(true);
  });

  it('manages layerSelectorHovered', () => {
    expect(useUiStore.getState().layerSelectorHovered).toBe(false);
    useUiStore.getState().setLayerSelectorHovered(true);
    expect(useUiStore.getState().layerSelectorHovered).toBe(true);
    useUiStore.getState().setLayerSelectorHovered(false);
    expect(useUiStore.getState().layerSelectorHovered).toBe(false);
  });

  it('manages renderLayerVisibility', () => {
    expect(useUiStore.getState().renderLayerVisibility['structure-surfaces']).toBe(false);
    useUiStore.getState().setRenderLayerVisible('structure-surfaces', true);
    expect(useUiStore.getState().renderLayerVisibility['structure-surfaces']).toBe(true);
  });

  it('prevents hiding the active layer', () => {
    useUiStore.getState().setActiveLayer('structures');
    useUiStore.getState().setLayerVisible('structures', false);
    expect(useUiStore.getState().layerVisibility.structures).toBe(true);
  });

  it('allows hiding a non-active layer', () => {
    useUiStore.getState().setActiveLayer('structures');
    useUiStore.getState().setLayerVisible('zones', false);
    expect(useUiStore.getState().layerVisibility.zones).toBe(false);
  });

  it('resets layerSelectorHovered and renderLayerVisibility', () => {
    useUiStore.getState().setLayerSelectorHovered(true);
    useUiStore.getState().setRenderLayerVisible('structure-surfaces', true);
    useUiStore.getState().reset();
    expect(useUiStore.getState().layerSelectorHovered).toBe(false);
    expect(useUiStore.getState().renderLayerVisibility['structure-surfaces']).toBe(false);
  });

  describe('layerFlashCounter', () => {
    it('starts at zero', () => {
      expect(useUiStore.getState().layerFlashCounter).toBe(0);
    });

    it('increments when setActiveLayer called with flash=true', () => {
      useUiStore.getState().setActiveLayer('zones', true);
      expect(useUiStore.getState().layerFlashCounter).toBe(1);
      expect(useUiStore.getState().activeLayer).toBe('zones');
    });

    it('does not increment when setActiveLayer called without flash', () => {
      useUiStore.getState().setActiveLayer('zones');
      expect(useUiStore.getState().layerFlashCounter).toBe(0);
    });

    it('does not increment when setActiveLayer called with flash=false', () => {
      useUiStore.getState().setActiveLayer('zones', false);
      expect(useUiStore.getState().layerFlashCounter).toBe(0);
    });

    it('increments each time flash=true is used', () => {
      useUiStore.getState().setActiveLayer('zones', true);
      useUiStore.getState().setActiveLayer('ground', true);
      useUiStore.getState().setActiveLayer('plantings', true);
      expect(useUiStore.getState().layerFlashCounter).toBe(3);
    });

    it('resets to zero on store reset', () => {
      useUiStore.getState().setActiveLayer('zones', true);
      useUiStore.getState().setActiveLayer('ground', true);
      useUiStore.getState().reset();
      expect(useUiStore.getState().layerFlashCounter).toBe(0);
    });
  });

  describe('renderLayerVisibility', () => {
    it('structure-surfaces starts as false', () => {
      expect(useUiStore.getState().renderLayerVisibility['structure-surfaces']).toBe(false);
    });

    it('planting-measurements starts as false', () => {
      expect(useUiStore.getState().renderLayerVisibility['planting-measurements']).toBe(false);
    });

    it('defaults-true layers are undefined (consumers use ?? true)', () => {
      expect(useUiStore.getState().renderLayerVisibility['planting-spacing']).toBeUndefined();
      expect(useUiStore.getState().renderLayerVisibility['planting-footprint-circles']).toBeUndefined();
    });

    it('toggles a layer on and off', () => {
      useUiStore.getState().setRenderLayerVisible('planting-spacing', false);
      expect(useUiStore.getState().renderLayerVisibility['planting-spacing']).toBe(false);
      useUiStore.getState().setRenderLayerVisible('planting-spacing', true);
      expect(useUiStore.getState().renderLayerVisibility['planting-spacing']).toBe(true);
    });

    it('resets all to defaults on store reset', () => {
      useUiStore.getState().setRenderLayerVisible('planting-spacing', false);
      useUiStore.getState().setRenderLayerVisible('planting-measurements', true);
      useUiStore.getState().reset();
      expect(useUiStore.getState().renderLayerVisibility['planting-spacing']).toBeUndefined();
      expect(useUiStore.getState().renderLayerVisibility['planting-measurements']).toBe(false);
    });
  });

  describe('appMode', () => {
    it('defaults to garden and can switch', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().appMode).toBe('garden');
      useUiStore.getState().setAppMode('nursery');
      expect(useUiStore.getState().appMode).toBe('nursery');
    });

    it('currentTrayId starts null and can be set', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().currentTrayId).toBeNull();
      useUiStore.getState().setCurrentTrayId('tray-1');
      expect(useUiStore.getState().currentTrayId).toBe('tray-1');
    });
  });

  describe('nursery view signals', () => {
    it('nurseryViewResetTick starts at 0 and bumps', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().nurseryViewResetTick).toBe(0);
      useUiStore.getState().bumpNurseryViewResetTick();
      expect(useUiStore.getState().nurseryViewResetTick).toBe(1);
      useUiStore.getState().bumpNurseryViewResetTick();
      expect(useUiStore.getState().nurseryViewResetTick).toBe(2);
    });

    it('palettePointerPayload defaults to null and can be set/cleared', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().palettePointerPayload).toBeNull();
    });

    it('seedFillPreview defaults to null and can be set/cleared', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().seedFillPreview).toBeNull();
      useUiStore.getState().setSeedFillPreview({ trayId: 't1', cultivarId: 'tomato', scope: 'all' });
      expect(useUiStore.getState().seedFillPreview).toEqual({ trayId: 't1', cultivarId: 'tomato', scope: 'all' });
      useUiStore.getState().setSeedFillPreview(null);
      expect(useUiStore.getState().seedFillPreview).toBeNull();
    });

    it('nursery state resets', () => {
      useUiStore.getState().bumpNurseryViewResetTick();
      useUiStore.getState().setSeedFillPreview({ trayId: 't', cultivarId: 'c', scope: 'all' });
      useUiStore.getState().reset();
      expect(useUiStore.getState().nurseryViewResetTick).toBe(0);
      expect(useUiStore.getState().seedFillPreview).toBeNull();
    });
  });

  describe('almanacFilters', () => {
    it('defaults to empty filter set', () => {
      useUiStore.getState().reset();
      const f = useUiStore.getState().almanacFilters;
      expect(f).toEqual({ cellSizes: [], seasons: [], usdaZone: null, lastFrostDate: null });
    });

    it('setAlmanacFilters merges partial patches', () => {
      useUiStore.getState().reset();
      useUiStore.getState().setAlmanacFilters({ cellSizes: ['small'] });
      expect(useUiStore.getState().almanacFilters.cellSizes).toEqual(['small']);
      expect(useUiStore.getState().almanacFilters.seasons).toEqual([]);

      useUiStore.getState().setAlmanacFilters({ usdaZone: 6 });
      expect(useUiStore.getState().almanacFilters.cellSizes).toEqual(['small']);
      expect(useUiStore.getState().almanacFilters.usdaZone).toBe(6);
    });

    it('resetAlmanacFilters clears everything', () => {
      useUiStore.getState().setAlmanacFilters({
        cellSizes: ['small', 'medium'],
        seasons: ['cool'],
        usdaZone: 6,
        lastFrostDate: '2026-05-01',
      });
      useUiStore.getState().resetAlmanacFilters();
      expect(useUiStore.getState().almanacFilters).toEqual({
        cellSizes: [],
        seasons: [],
        usdaZone: null,
        lastFrostDate: null,
      });
    });

    it('almanacFilters reset to defaults on store reset', () => {
      useUiStore.getState().setAlmanacFilters({ cellSizes: ['large'], usdaZone: 9 });
      useUiStore.getState().reset();
      expect(useUiStore.getState().almanacFilters).toEqual({
        cellSizes: [],
        seasons: [],
        usdaZone: null,
        lastFrostDate: null,
      });
    });
  });

  describe('armedCultivarId', () => {
    it('defaults to null', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().armedCultivarId).toBeNull();
    });

    it('setArmedCultivarId sets and clears the armed cultivar', () => {
      useUiStore.getState().reset();
      useUiStore.getState().setArmedCultivarId('tomato');
      expect(useUiStore.getState().armedCultivarId).toBe('tomato');
      useUiStore.getState().setArmedCultivarId(null);
      expect(useUiStore.getState().armedCultivarId).toBeNull();
    });

    it('reset clears armedCultivarId', () => {
      useUiStore.getState().setArmedCultivarId('tomato');
      useUiStore.getState().reset();
      expect(useUiStore.getState().armedCultivarId).toBeNull();
    });
  });

  describe('collectionEditorOpen', () => {
    it('defaults to false and toggles', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().collectionEditorOpen).toBe(false);
      useUiStore.getState().setCollectionEditorOpen(true);
      expect(useUiStore.getState().collectionEditorOpen).toBe(true);
      useUiStore.getState().setCollectionEditorOpen(false);
      expect(useUiStore.getState().collectionEditorOpen).toBe(false);
    });
  });

  it('toggles plantsModalOpen', () => {
    expect(useUiStore.getState().plantsModalOpen).toBe(false);
    useUiStore.getState().setPlantsModalOpen(true);
    expect(useUiStore.getState().plantsModalOpen).toBe(true);
    useUiStore.getState().setPlantsModalOpen(false);
    expect(useUiStore.getState().plantsModalOpen).toBe(false);
  });
});
