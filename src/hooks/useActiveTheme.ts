import { useState, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { getCurrentTheme, getTheme, ALL_PERIODS, type TimeTheme } from '../utils/timeTheme';

const CYCLE_INTERVAL = 5000; // ms per theme
const SLOW_CYCLE_INTERVAL = 20000;

export function useActiveTheme(): TimeTheme {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const [cycleIndex, setCycleIndex] = useState(0);

  const isCycling = themeOverride === 'cycle' || themeOverride === 'slow-cycle';

  useEffect(() => {
    if (!isCycling) return;
    setCycleIndex(0);
    const interval = themeOverride === 'slow-cycle' ? SLOW_CYCLE_INTERVAL : CYCLE_INTERVAL;
    const id = setInterval(() => {
      setCycleIndex((i) => (i + 1) % ALL_PERIODS.length);
    }, interval);
    return () => clearInterval(id);
  }, [themeOverride, isCycling]);

  if (isCycling) return getTheme(ALL_PERIODS[cycleIndex]);
  if (themeOverride) return getTheme(themeOverride);
  return getCurrentTheme();
}
