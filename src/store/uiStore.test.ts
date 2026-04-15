import { describe, it, expect, beforeEach } from 'vitest';
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
    useUiStore.getState().setZoom(2);
    expect(useUiStore.getState().zoom).toBe(2);
  });

  it('clamps zoom to bounds', () => {
    useUiStore.getState().setZoom(0.01);
    expect(useUiStore.getState().zoom).toBe(0.1);
    useUiStore.getState().setZoom(100);
    expect(useUiStore.getState().zoom).toBe(10);
  });

  it('manages pan', () => {
    useUiStore.getState().setPan(50, 100);
    expect(useUiStore.getState().panX).toBe(50);
    expect(useUiStore.getState().panY).toBe(100);
  });

  it('manages layer visibility', () => {
    useUiStore.getState().setLayerVisible('structures', false);
    expect(useUiStore.getState().layerVisibility.structures).toBe(false);
    expect(useUiStore.getState().layerVisibility.zones).toBe(true);
  });

  it('manages layer opacity', () => {
    useUiStore.getState().setLayerOpacity('zones', 0.5);
    expect(useUiStore.getState().layerOpacity.zones).toBe(0.5);
  });

  it('manages layer lock', () => {
    useUiStore.getState().setLayerLocked('plantings', true);
    expect(useUiStore.getState().layerLocked.plantings).toBe(true);
  });
});
