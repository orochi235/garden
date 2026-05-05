/**
 * Runtime loader and nearest-cell lookup for the static USDA hardiness zone +
 * average last-spring-frost date grid built by `scripts/build-frost-zone-grid.mjs`.
 *
 * The grid is a packed binary covering CONUS + AK + HI at 0.5 deg resolution.
 * Header layout (18 bytes):
 *   bytes 0..3   : ASCII "FZGR"
 *   byte  4      : version (1)
 *   byte  5      : reserved
 *   bytes 6..7   : int16 LE  lat0 * 100   (deg)
 *   bytes 8..9   : int16 LE  lon0 * 100   (deg)
 *   bytes 10..11 : uint16 LE latStep * 1000 (deg)
 *   bytes 12..13 : uint16 LE lonStep * 1000 (deg)
 *   bytes 14..15 : uint16 LE nLat
 *   bytes 16..17 : uint16 LE nLon
 *
 * Body: nLat * nLon cells, row-major (lat-major, south-to-north).
 *   Each cell is 3 bytes:
 *     byte 0..1 : uint16 LE day-of-year of avg last spring frost (1..366; 0 = unknown)
 *     byte 2    : zone index (0 = unknown; 1..26 maps to "1a" .. "13b")
 */

const HEADER_BYTES = 18;
const BYTES_PER_CELL = 3;

export interface FrostZoneGrid {
  lat0: number;
  lon0: number;
  latStep: number;
  lonStep: number;
  nLat: number;
  nLon: number;
  doy: Uint16Array;
  zone: Uint8Array;
}

export interface FrostZoneLookup {
  /** USDA hardiness half-zone, e.g. "7a". */
  zone: string;
  /** Average last spring frost date as "MM-DD" (non-leap reference year). */
  lastFrost: string;
}

let cached: Promise<FrostZoneGrid> | null = null;

export function loadFrostZoneGrid(): Promise<FrostZoneGrid> {
  if (cached) return cached;
  const url = `${import.meta.env.BASE_URL}data/frost-zone-grid.bin`;
  cached = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`failed to load ${url}: ${r.status}`);
      return r.arrayBuffer();
    })
    .then(parseGrid)
    .catch((err) => {
      cached = null; // allow retry
      throw err;
    });
  return cached;
}

export function parseGrid(buf: ArrayBuffer): FrostZoneGrid {
  const view = new DataView(buf);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== 'FZGR') throw new Error(`bad magic: ${magic}`);
  const version = view.getUint8(4);
  if (version !== 1) throw new Error(`unsupported version: ${version}`);
  const lat0 = view.getInt16(6, true) / 100;
  const lon0 = view.getInt16(8, true) / 100;
  const latStep = view.getUint16(10, true) / 1000;
  const lonStep = view.getUint16(12, true) / 1000;
  const nLat = view.getUint16(14, true);
  const nLon = view.getUint16(16, true);

  const cells = nLat * nLon;
  if (buf.byteLength < HEADER_BYTES + cells * BYTES_PER_CELL) {
    throw new Error('frost-zone grid truncated');
  }
  const doy = new Uint16Array(cells);
  const zone = new Uint8Array(cells);
  let off = HEADER_BYTES;
  for (let i = 0; i < cells; i++) {
    doy[i] = view.getUint8(off) | (view.getUint8(off + 1) << 8);
    zone[i] = view.getUint8(off + 2);
    off += 3;
  }
  return { lat0, lon0, latStep, lonStep, nLat, nLon, doy, zone };
}

/**
 * Look up the zone + last-frost for a (lat, lon). If the cell containing the
 * point has unknown values, expands outward in Chebyshev rings up to 3 cells
 * (≈1.5 deg) and uses the nearest non-empty neighbor. Returns null if no data
 * is available within range.
 */
export function lookupFrostZone(
  lat: number,
  lon: number,
  grid: FrostZoneGrid,
): FrostZoneLookup | null {
  const li0 = Math.floor((lat - grid.lat0) / grid.latStep);
  const oi0 = Math.floor((lon - grid.lon0) / grid.lonStep);
  if (li0 < -3 || li0 >= grid.nLat + 3 || oi0 < -3 || oi0 >= grid.nLon + 3) {
    return null;
  }

  // Expand from radius 0 outward; first non-empty wins.
  for (let r = 0; r <= 3; r++) {
    let best: { doy: number; zone: number; dist2: number } | null = null;
    for (let dl = -r; dl <= r; dl++) {
      for (let dn = -r; dn <= r; dn++) {
        if (Math.max(Math.abs(dl), Math.abs(dn)) !== r) continue; // ring only
        const li = li0 + dl;
        const oi = oi0 + dn;
        if (li < 0 || li >= grid.nLat || oi < 0 || oi >= grid.nLon) continue;
        const k = li * grid.nLon + oi;
        const d = grid.doy[k];
        const z = grid.zone[k];
        if (d === 0 && z === 0) continue;
        const dist2 = dl * dl + dn * dn;
        if (!best || dist2 < best.dist2) best = { doy: d, zone: z, dist2 };
      }
    }
    if (best) {
      if (best.zone === 0 && best.doy === 0) continue;
      const zoneStr = best.zone === 0 ? null : zoneIndexToString(best.zone);
      const frostStr = best.doy === 0 ? null : dayOfYearToMmDd(best.doy);
      if (zoneStr && frostStr) return { zone: zoneStr, lastFrost: frostStr };
      // Partial data: search wider rings for the missing field too.
      // (Both fields are correlated so this is rare; bail with what we have.)
      if (zoneStr || frostStr) {
        return {
          zone: zoneStr ?? 'unknown',
          lastFrost: frostStr ?? '',
        };
      }
    }
  }
  return null;
}

/**
 * USDA hardiness half-zones: zone N covers avg annual extreme min temp from
 * (-60 + (N-1)*10) F to (-60 + N*10) F. Each 10F band splits into a colder
 * 'a' half and a warmer 'b' half. Index 1..26 → '1a'..'13b'.
 */
export function zoneIndexToString(idx: number): string {
  if (idx < 1 || idx > 26) return 'unknown';
  const zone = Math.floor((idx - 1) / 2) + 1;
  const half = (idx - 1) % 2 === 0 ? 'a' : 'b';
  return `${zone}${half}`;
}

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Convert day-of-year (1..365 in non-leap reference year) to "MM-DD". */
export function dayOfYearToMmDd(doy: number): string {
  if (doy < 1 || doy > 366) return '';
  let month = 1;
  for (let m = 11; m >= 0; m--) {
    if (doy > DAYS_BEFORE_MONTH[m]) { month = m + 1; break; }
  }
  const day = doy - DAYS_BEFORE_MONTH[month - 1];
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
