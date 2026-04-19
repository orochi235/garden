import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { ALL_PERIODS, getCurrentTheme, getTheme, type TimeTheme } from '../utils/timeTheme';

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
  const [cycleIndex, setCycleIndex] = useState(0);
  const [layerFlip, setLayerFlip] = useState(false);
  const prevThemeRef = useRef<TimeTheme | null>(null);

  const isCycling = themeOverride === 'cycle' || themeOverride === 'slow-cycle';
  const interval = themeOverride === 'slow-cycle' ? SLOW_CYCLE_INTERVAL : CYCLE_INTERVAL;

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
  if (isCycling) {
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
