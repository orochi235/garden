import { useSyncExternalStore } from 'react';
import type { RenderLayer } from '@orochi235/weasel';

/**
 * Lightweight registry the canvas prototypes publish into so the sidebar
 * RenderLayersPanel can list whatever layers are actually being drawn — no
 * duplicated static lists to keep in sync.
 *
 * The prototype calls `setRegisteredLayers(mode, baseList)` once per `useMemo`
 * recompute (which is already once per mount). The panel reads via
 * `useRegisteredLayers(mode)` and re-renders when the registration changes.
 *
 * We store only the metadata needed to render checkboxes (id, label,
 * defaultVisible, alwaysOn) — not the draw closures — so this stays decoupled
 * from layer execution and safe to keep alive across mounts.
 */
export interface RegisteredLayer {
  id: string;
  label: string;
  defaultVisible?: boolean;
  alwaysOn?: boolean;
}

export type RegistryMode = 'garden' | 'seed-starting';

const registries: Record<RegistryMode, RegisteredLayer[]> = {
  garden: [],
  'seed-starting': [],
};

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  for (const cb of listeners) cb();
}

function shallowSameMeta(a: RegisteredLayer[], b: RegisteredLayer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.label !== y.label || x.defaultVisible !== y.defaultVisible || x.alwaysOn !== y.alwaysOn) {
      return false;
    }
  }
  return true;
}

export function setRegisteredLayers(mode: RegistryMode, layers: RenderLayer<unknown>[]): void {
  const meta: RegisteredLayer[] = layers.map((l) => ({
    id: l.id,
    label: l.label,
    defaultVisible: l.defaultVisible,
    alwaysOn: l.alwaysOn,
  }));
  if (shallowSameMeta(registries[mode], meta)) return;
  registries[mode] = meta;
  notify();
}

export function getRegisteredLayers(mode: RegistryMode): RegisteredLayer[] {
  return registries[mode];
}

export function useRegisteredLayers(mode: RegistryMode): RegisteredLayer[] {
  return useSyncExternalStore(
    subscribe,
    () => registries[mode],
    () => registries[mode],
  );
}
