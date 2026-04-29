import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { getSolarTimes } from '../utils/sunCalc';
import {
  ALL_PERIODS,
  getCurrentTheme,
  getSolarTimePeriod,
  getTheme,
  type TimeTheme,
} from '../utils/timeTheme';

const CYCLE_INTERVAL = 5000;
const SLOW_CYCLE_INTERVAL = 20000;
const LIVE_UPDATE_INTERVAL = 60000; // re-check every minute

interface CycleState {
  /** The theme currently visible */
  theme: TimeTheme;
  /** The theme being faded in (for crossfade layers) */
  prevTheme: TimeTheme | null;
  /** 0 or 1 — which layer is "on top" (toggles on each transition) */
  layerFlip: boolean;
  /** CSS transition duration string */
  transitionDuration: string;
}

interface GeoPosition {
  lat: number;
  lng: number;
}

function useLiveTheme(enabled: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [period, setPeriod] = useState(() =>
    getCurrentTheme(),
  );

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silently fall back to clock-based
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !position) return;

    function update() {
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      const solar = getSolarTimes(now, position!.lat, position!.lng);
      const tp = getSolarTimePeriod(hour, solar);
      setPeriod(getTheme(tp));
    }

    update();
    const id = setInterval(update, LIVE_UPDATE_INTERVAL);
    return () => clearInterval(id);
  }, [enabled, position]);

  return period;
}

export function useActiveTheme(): CycleState {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const appMode = useUiStore((s) => s.appMode);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [layerFlip, setLayerFlip] = useState(false);
  const prevThemeRef = useRef<TimeTheme | null>(null);

  const isCycling = themeOverride === 'cycle' || themeOverride === 'slow-cycle';
  const interval = themeOverride === 'slow-cycle' ? SLOW_CYCLE_INTERVAL : CYCLE_INTERVAL;

  const liveTheme = useLiveTheme(themeOverride === 'live');

  useEffect(() => {
    if (!isCycling) return;
    setCycleIndex(0);
    prevThemeRef.current = null;
    const id = setInterval(() => {
      setCycleIndex((prev) => {
        prevThemeRef.current = getTheme(ALL_PERIODS[prev]);
        return (prev + 1) % ALL_PERIODS.length;
      });
      setLayerFlip((f) => !f);
    }, interval);
    return () => clearInterval(id);
  }, [themeOverride, isCycling, interval]);

  let theme: TimeTheme;
  if (appMode === 'seed-starting') {
    theme = getTheme('basement');
  } else if (themeOverride === 'live') {
    theme = liveTheme;
  } else if (isCycling) {
    theme = getTheme(ALL_PERIODS[cycleIndex]);
  } else if (themeOverride) {
    theme = getTheme(themeOverride);
  } else {
    theme = getCurrentTheme();
  }

  return {
    theme,
    prevTheme: isCycling ? prevThemeRef.current : null,
    layerFlip,
    transitionDuration:
      themeOverride === 'slow-cycle' ? '20s' : themeOverride === 'cycle' ? '5s' : '0s',
  };
}
