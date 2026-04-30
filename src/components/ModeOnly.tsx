import type { ReactNode } from 'react';
import type { AppMode } from '../store/uiStore';
import { useUiStore } from '../store/uiStore';

/**
 * Renders children only when the active appMode matches `mode` (or any of the
 * modes when an array is given). Use to hide widgets that don't apply outside
 * a specific mode, e.g. the scale indicator only in garden mode.
 */
export function ModeOnly({ mode, children }: { mode: AppMode | AppMode[]; children: ReactNode }) {
  const appMode = useUiStore((s) => s.appMode);
  const modes = Array.isArray(mode) ? mode : [mode];
  if (!modes.includes(appMode)) return null;
  return <>{children}</>;
}
