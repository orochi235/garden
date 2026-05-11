/**
 * Dev-only fixture loader for visual regression and quick repro.
 *
 * If the URL contains `?fixture=<name>`, fetches
 * `/tests/visual/fixtures/<name>.garden`, parses via `deserializeGarden`,
 * and replaces the current garden in `useGardenStore`. Returns true if a
 * fixture was loaded (caller may want to skip auto-restore from autosave).
 *
 * Gated on `import.meta.env.DEV` so the production bundle short-circuits.
 */

import { deserializeGarden } from '../utils/file';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore, type AppMode } from '../store/uiStore';

const VALID_MODES: ReadonlySet<AppMode> = new Set(['garden', 'nursery']);
// Legacy URL value (pre-rename) — coerced to `nursery` if present.
const LEGACY_NURSERY_MODE = 'seed-starting';

export async function loadFixtureFromUrl(
  url: URL = new URL(window.location.href),
): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const name = url.searchParams.get('fixture');
  if (!name) return false;
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.warn(`[fixtureLoader] rejecting unsafe fixture name: ${name}`);
    return false;
  }
  const res = await fetch(`/tests/visual/fixtures/${name}.garden`);
  if (!res.ok) {
    console.warn(`[fixtureLoader] fixture not found: ${name}`);
    return false;
  }
  const json = await res.text();
  const garden = deserializeGarden(json);
  useGardenStore.setState({ garden });

  const rawMode = url.searchParams.get('mode');
  const mode = rawMode === LEGACY_NURSERY_MODE ? 'nursery' : rawMode;
  if (mode && VALID_MODES.has(mode as AppMode)) {
    useUiStore.getState().setAppMode(mode as AppMode);
  }
  return true;
}
