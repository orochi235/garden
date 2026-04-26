import type { Structure, Zone } from '../model/types';
import type { ShapePath } from './types';
import { rectPath, ellipsePath } from './shapes';

/** Convert a Structure to a ShapePath based on its shape property. */
export function structureToShape(s: Structure): ShapePath {
  if (s.shape === 'circle') {
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    const rx = s.width / 2;
    const ry = s.height / 2;
    return ellipsePath(cx, cy, rx, ry);
  }
  return rectPath(s.x, s.y, s.width, s.height);
}

/** Convert a Zone to a ShapePath (always rectangular for now). */
export function zoneToShape(z: Zone): ShapePath {
  return rectPath(z.x, z.y, z.width, z.height);
}
