import type { Structure } from '../model/types';

interface Rect {
  x: number;
  y: number;
  width: number;
  length: number;
}

/** Check if two axis-aligned bounding boxes overlap (exclusive edges). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.length && a.y + a.length > b.y;
}

/** Check if a structure collides with any non-surface structure in the list. */
export function structuresCollide(subject: Structure, others: Structure[]): boolean {
  return others.some((other) => {
    // Surface structures (e.g. patios) can have things placed on them
    if (other.surface || subject.surface) return false;
    return rectsOverlap(subject, other);
  });
}
