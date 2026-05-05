import { useCallback, useState } from 'react';
import {
  loadFrostZoneGrid,
  lookupFrostZone,
  type FrostZoneLookup,
} from '../utils/frostZone';

export interface FrostZoneResult extends FrostZoneLookup {
  lat: number;
  lon: number;
}

export type FrostZoneStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: FrostZoneResult }
  | { kind: 'error'; message: string };

/**
 * Tiny composable hook: ask the browser for the user's location, then resolve
 * USDA hardiness zone + last-frost date from the locally bundled grid.
 *
 * Returns `{ status, run }`. Call `run()` from a click handler. The hook is
 * deliberately scoped to this single feature — it does not try to be a generic
 * geolocation provider.
 */
export function useFrostZoneByLocation(): {
  status: FrostZoneStatus;
  run: () => void;
} {
  const [status, setStatus] = useState<FrostZoneStatus>({ kind: 'idle' });

  const run = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus({ kind: 'error', message: "Geolocation isn't available in this browser." });
      return;
    }
    setStatus({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const grid = await loadFrostZoneGrid();
          const { latitude, longitude } = pos.coords;
          const hit = lookupFrostZone(latitude, longitude, grid);
          if (!hit) {
            setStatus({
              kind: 'error',
              message: "Couldn't determine zone for this location.",
            });
            return;
          }
          setStatus({
            kind: 'ready',
            result: { lat: latitude, lon: longitude, ...hit },
          });
        } catch (err) {
          setStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load frost zone data.',
          });
        }
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Couldn't get your location."
            : err.message || "Couldn't get your location.";
        setStatus({ kind: 'error', message });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  return { status, run };
}
