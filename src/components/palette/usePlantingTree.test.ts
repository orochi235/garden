import { describe, expect, it } from 'vitest';
import { buildPlantingTree } from './usePlantingTree';
import type { PaletteEntry } from './paletteData';

const makeEntry = (id: string, speciesId: string, speciesName: string, varietyLabel: string, color = '#000'): PaletteEntry => ({
  id,
  name: `${speciesName}${varietyLabel !== speciesName ? ', ' + varietyLabel : ''}`,
  category: 'plantings',
  speciesId,
  speciesName,
  varietyLabel,
  type: 'planting',
  defaultWidth: 0,
  defaultHeight: 0,
  color,
});

describe('buildPlantingTree', () => {
  it('single-cultivar species becomes a leaf node', () => {
    const entries = [makeEntry('carrot', 'carrot', 'Carrot', 'Carrot', '#E0943C')];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('leaf');
    expect(tree[0].speciesName).toBe('Carrot');
    if (tree[0].kind === 'leaf') {
      expect(tree[0].entry.id).toBe('carrot');
    }
  });

  it('multi-cultivar species becomes a group node', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato', '#E05555'),
      makeEntry('black-krim-tomato', 'tomato', 'Tomato', 'Black Krim', '#6B2D3A'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('group');
    if (tree[0].kind === 'group') {
      expect(tree[0].speciesName).toBe('Tomato');
      expect(tree[0].defaultCultivarId).toBe('tomato');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].entry.id).toBe('black-krim-tomato');
    }
  });

  it('sorts groups alphabetically by species name', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('basil', 'basil', 'Basil', 'Basil'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree[0].speciesName).toBe('Basil');
    expect(tree[1].speciesName).toBe('Tomato');
  });

  it('sorts children alphabetically by varietyLabel', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('cherokee', 'tomato', 'Tomato', 'Cherokee Purple'),
      makeEntry('black-krim', 'tomato', 'Tomato', 'Black Krim'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree[0].kind).toBe('group');
    if (tree[0].kind === 'group') {
      expect(tree[0].children.map((c) => c.entry.id)).toEqual([
        'black-krim', 'cherokee',
      ]);
    }
  });

  it('mixes leaf and group nodes', () => {
    const entries = [
      makeEntry('carrot', 'carrot', 'Carrot', 'Carrot'),
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('black-krim', 'tomato', 'Tomato', 'Black Krim'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(2);
    expect(tree[0].kind).toBe('leaf');
    expect(tree[1].kind).toBe('group');
  });
});
