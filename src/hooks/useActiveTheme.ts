import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import {
  CYCLE_PERIODS,
  getCurrentTheme,
  getTheme,
  type TimeTheme,
} from '../utils/timeTheme';

const CYCLE_INTERVAL = 5000;
const SLOW_CYCLE_INTERVAL = 20000;

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

export function useActiveTheme(): CycleState {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const appMode = useUiStore((s) => s.appMode);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [layerFlip, setLayerFlip] = useState(false);
  const prevThemeRef = useRef<TimeTheme | null>(null);

  const isCycling = themeOverride === 'cycle' || themeOverride === 'slow-cycle';
  const interval = themeOverride === 'slow-cycle' ? SLOW_CYCLE_INTERVAL : CYCLE_INTERVAL;

  // Re-render every minute while in seed-starting mode so the basement theme
  // can switch between day/night variants at the 21:00 / 05:00 boundary.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (appMode !== 'seed-starting') return;
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [appMode]);

  useEffect(() => {
    if (!isCycling) return;
    setCycleIndex(0);
    prevThemeRef.current = null;
    const id = setInterval(() => {
      setCycleIndex((prev) => {
        prevThemeRef.current = getTheme(CYCLE_PERIODS[prev]);
        return (prev + 1) % CYCLE_PERIODS.length;
      });
      setLayerFlip((f) => !f);
    }, interval);
    return () => clearInterval(id);
  }, [themeOverride, isCycling, interval]);

  let theme: TimeTheme;
  if (appMode === 'seed-starting') {
    const hour = new Date().getHours();
    const afterDark = hour >= 21 || hour < 5;
    theme = getTheme(afterDark ? 'cellar' : 'basement');
  } else if (isCycling) {
    theme = getTheme(CYCLE_PERIODS[cycleIndex]);
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
