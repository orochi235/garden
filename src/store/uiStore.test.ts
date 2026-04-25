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

  it('manages showSurfaces', () => {
    expect(useUiStore.getState().showSurfaces).toBe(false);
    useUiStore.getState().setShowSurfaces(true);
    expect(useUiStore.getState().showSurfaces).toBe(true);
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

  it('resets layerSelectorHovered and showSurfaces', () => {
    useUiStore.getState().setLayerSelectorHovered(true);
    useUiStore.getState().setShowSurfaces(true);
    useUiStore.getState().reset();
    expect(useUiStore.getState().layerSelectorHovered).toBe(false);
    expect(useUiStore.getState().showSurfaces).toBe(false);
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

  describe('plant rendering toggles', () => {
    it('showSpacingBorders starts as true', () => {
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
    });

    it('showFootprintCircles starts as true', () => {
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
    });

    it('showMeasurements starts as false', () => {
      expect(useUiStore.getState().showMeasurements).toBe(false);
    });

    it('toggles showSpacingBorders on and off', () => {
      useUiStore.getState().setShowSpacingBorders(false);
      expect(useUiStore.getState().showSpacingBorders).toBe(false);
      useUiStore.getState().setShowSpacingBorders(true);
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
    });

    it('toggles showFootprintCircles on and off', () => {
      useUiStore.getState().setShowFootprintCircles(false);
      expect(useUiStore.getState().showFootprintCircles).toBe(false);
      useUiStore.getState().setShowFootprintCircles(true);
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
    });

    it('toggles showMeasurements on and off', () => {
      useUiStore.getState().setShowMeasurements(true);
      expect(useUiStore.getState().showMeasurements).toBe(true);
      useUiStore.getState().setShowMeasurements(false);
      expect(useUiStore.getState().showMeasurements).toBe(false);
    });

    it('resets all to defaults on store reset', () => {
      useUiStore.getState().setShowSpacingBorders(false);
      useUiStore.getState().setShowFootprintCircles(false);
      useUiStore.getState().setShowMeasurements(true);
      useUiStore.getState().reset();
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
      expect(useUiStore.getState().showMeasurements).toBe(false);
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
});
