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
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
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

  it('manages zoom', () => {
    useUiStore.getState().setZoom(32);
    expect(useUiStore.getState().zoom).toBe(32);
  });

  it('clamps zoom to bounds', () => {
    useUiStore.getState().setZoom(1);
    expect(useUiStore.getState().zoom).toBe(10);
    useUiStore.getState().setZoom(500);
    expect(useUiStore.getState().zoom).toBe(200);
  });

  it('manages pan', () => {
    useUiStore.getState().setPan(50, 100);
    expect(useUiStore.getState().panX).toBe(50);
    expect(useUiStore.getState().panY).toBe(100);
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
      useUiStore.getState().setAppMode('seed-starting');
      expect(useUiStore.getState().appMode).toBe('seed-starting');
    });

    it('currentTrayId starts null and can be set', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().currentTrayId).toBeNull();
      useUiStore.getState().setCurrentTrayId('tray-1');
      expect(useUiStore.getState().currentTrayId).toBe('tray-1');
    });
  });

  describe('dragOverlay', () => {
    it('starts as null', () => {
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });

    it('can be set and cleared', () => {
      const overlay = {
        layer: 'plantings' as const,
        objects: [{ id: 'p1', parentId: 's1', cultivarId: 'tomato', x: 1, y: 2, label: 'Tomato', icon: null }],
        hideIds: ['p1'],
        snapped: false,
      };
      useUiStore.getState().setDragOverlay(overlay);
      expect(useUiStore.getState().dragOverlay).toEqual(overlay);

      useUiStore.getState().clearDragOverlay();
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });

    it('is cleared on reset', () => {
      useUiStore.getState().setDragOverlay({
        layer: 'structures',
        objects: [],
        hideIds: [],
        snapped: false,
      });
      useUiStore.getState().reset();
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });
  });

  describe('seed-starting view state', () => {
    it('seedStartingZoom defaults to 30 and clamps', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().seedStartingZoom).toBe(30);
      useUiStore.getState().setSeedStartingZoom(1);
      expect(useUiStore.getState().seedStartingZoom).toBe(5);
      useUiStore.getState().setSeedStartingZoom(500);
      expect(useUiStore.getState().seedStartingZoom).toBe(100);
    });

    it('seedStartingPan defaults to 0,0 and can be set', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().seedStartingPanX).toBe(0);
      expect(useUiStore.getState().seedStartingPanY).toBe(0);
      useUiStore.getState().setSeedStartingPan(10, 20);
      expect(useUiStore.getState().seedStartingPanX).toBe(10);
      expect(useUiStore.getState().seedStartingPanY).toBe(20);
    });

    it('seedFillPreview defaults to null and can be set/cleared', () => {
      useUiStore.getState().reset();
      expect(useUiStore.getState().seedFillPreview).toBeNull();
      useUiStore.getState().setSeedFillPreview({ trayId: 't1', cultivarId: 'tomato', scope: 'all' });
      expect(useUiStore.getState().seedFillPreview).toEqual({ trayId: 't1', cultivarId: 'tomato', scope: 'all' });
      useUiStore.getState().setSeedFillPreview(null);
      expect(useUiStore.getState().seedFillPreview).toBeNull();
    });

    it('seed-starting state resets', () => {
      useUiStore.getState().setSeedStartingZoom(50);
      useUiStore.getState().setSeedStartingPan(5, 5);
      useUiStore.getState().setSeedFillPreview({ trayId: 't', cultivarId: 'c', scope: 'all' });
      useUiStore.getState().reset();
      expect(useUiStore.getState().seedStartingZoom).toBe(30);
      expect(useUiStore.getState().seedStartingPanX).toBe(0);
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
});
