import { useState, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { getCurrentTheme, getTheme, ALL_PERIODS, type TimeTheme } from '../utils/timeTheme';

const CYCLE_INTERVAL = 5000; // ms per theme

export function useActiveTheme(): TimeTheme {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    if (themeOverride !== 'cycle') return;
    setCycleIndex(0);
    const id = setInterval(() => {
      setCycleIndex((i) => (i + 1) % ALL_PERIODS.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(id);
  }, [themeOverride]);

  if (themeOverride === 'cycle') return getTheme(ALL_PERIODS[cycleIndex]);
  if (themeOverride) return getTheme(themeOverride);
  return getCurrentTheme();
}
