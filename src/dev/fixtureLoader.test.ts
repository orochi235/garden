import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFixtureFromUrl } from './fixtureLoader';
import { useGardenStore } from '../store/gardenStore';

describe('loadFixtureFromUrl', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns false when no ?fixture param', async () => {
    const r = await loadFixtureFromUrl(new URL('http://localhost/'));
    expect(r).toBe(false);
  });

  it('hydrates the garden store from the fetched JSON', async () => {
    const fakeGarden = {
      version: 1,
      name: 'Test',
      widthFt: 10,
      lengthFt: 10,
      structures: [],
      zones: [],
      plantings: [],
      seedStarting: { trays: [] },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fakeGarden),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const r = await loadFixtureFromUrl(new URL('http://localhost/?fixture=test-fixture'));
    expect(r).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/tests/visual/fixtures/test-fixture.garden');
    expect(useGardenStore.getState().garden.name).toBe('Test');
  });
});
