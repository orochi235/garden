#!/usr/bin/env node
// Build a packed binary grid of USDA hardiness zone + last-spring-frost date
// from NOAA NCEI 1991-2020 Climate Normals "by-station" annual/seasonal data.
//
// Pulls a single tarball (~54 MB) from NCEI, extracts per-station CSVs,
// rasterizes onto a 0.5 deg x 0.5 deg lat/lon grid covering CONUS + AK + HI,
// and writes a packed .bin to public/data/frost-zone-grid.bin.
//
// Idempotent: tarball + extract are cached under .cache/.

import { mkdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '.cache');
const TAR_URL = 'https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/archive/us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz';
const TAR_PATH = join(CACHE_DIR, 'noaa-normals-annualseasonal.tar.gz');
const EXTRACT_DIR = join(CACHE_DIR, 'noaa-normals-annualseasonal');
const OUT_PATH = join(ROOT, 'public', 'data', 'frost-zone-grid.bin');

// Grid covers CONUS + AK + HI:
//   AK reaches west to ~172E (we ignore the dateline crossing — Aleutians beyond
//   180 are excluded).
//   HI is ~155-160 W, ~19-22 N.
//   CONUS is ~24.5-49.5 N, -125 to -66.5 E.
//   AK is up to ~71.5 N.
const LAT0 = 18.0;       // southernmost row's south edge (HI)
const LAT1 = 72.0;       // northernmost row's north edge (AK)
const LON0 = -172.0;     // westernmost (AK Aleutians cutoff)
const LON1 = -66.0;      // easternmost (Maine)
const STEP = 0.5;        // degrees
const N_LAT = Math.round((LAT1 - LAT0) / STEP); // 108
const N_LON = Math.round((LON1 - LON0) / STEP); // 212

// Header is 16 bytes: 'FZGR'(4) ver(1) lat0(2) lon0(2) latStep(2) lonStep(2) nLat(2) nLon(2) = 17.
// Pack as: magic(4) ver(1) PAD(1) lat0(2) lon0(2) latStep(2) lonStep(2) nLat(2) nLon(2) = 18; trim by removing pad.
// Per requirements: 16 bytes — magic(4)+ver(1)+lat0(2)+lon0(2)+latStep(2)+lonStep(2)+nLat(2)+nLon(2) = 17.
// Add 1 reserved byte to align body on even offset → 18 bytes header.
const HEADER_BYTES = 18;
const BYTES_PER_CELL = 3;

// USDA hardiness zones: zone N covers avg annual extreme min temp from
// (-60 + (N-1)*10) F to (-60 + N*10) F. Half-zones split each 10F band into
// 5F halves: 'a' is the colder half, 'b' is the warmer half.
// Index 0 = unknown. Index 1..26 maps to '1a'..'13b'.
function tempFToZoneIndex(tempF) {
  if (!Number.isFinite(tempF)) return 0;
  // Zone band: integer N where -60 + (N-1)*10 <= t < -60 + N*10
  const n = Math.floor((tempF + 60) / 10) + 1;
  if (n < 1) return 1;
  if (n > 13) return 26;
  // Within band, lower 5F = 'a', upper 5F = 'b'
  const bandLow = -60 + (n - 1) * 10;
  const half = tempF < bandLow + 5 ? 0 : 1; // 0 = a, 1 = b
  return (n - 1) * 2 + 1 + half;
}

async function ensureTarball() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(TAR_PATH) && statSync(TAR_PATH).size > 1_000_000) {
    return;
  }
  console.log(`[fetch] ${TAR_URL}`);
  await downloadFollow(TAR_URL, TAR_PATH);
  console.log(`[fetch] wrote ${TAR_PATH} (${(statSync(TAR_PATH).size / 1e6).toFixed(1)} MB)`);
}

function downloadFollow(url, destPath, depth = 0) {
  if (depth > 5) throw new Error('too many redirects');
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFollow(res.headers.location, destPath, depth + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const out = createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

function ensureExtracted() {
  if (existsSync(EXTRACT_DIR) && readdirSync(EXTRACT_DIR).length > 100) return;
  mkdirSync(EXTRACT_DIR, { recursive: true });
  console.log(`[extract] ${TAR_PATH} -> ${EXTRACT_DIR}`);
  execFileSync('tar', ['-xzf', TAR_PATH, '-C', EXTRACT_DIR], { stdio: 'inherit' });
}

// CSV parser sufficient for NOAA files: comma separator, double-quoted fields
// may contain commas. No escaped quotes in observed data.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Parse "MM/DD" or "  MM/DD" date string -> day-of-year (1..365 in non-leap).
// Returns 0 if invalid.
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function mmddToDoy(s) {
  if (typeof s !== 'string') return 0;
  const t = s.trim();
  const m = /^(\d{1,2})[/-](\d{1,2})$/.exec(t);
  if (!m) return 0;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
  return DAYS_BEFORE_MONTH[month - 1] + day;
}

function readStations() {
  // Find the directory inside EXTRACT_DIR that holds CSVs.
  const candidates = [];
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.csv')) candidates.push(p);
    }
  }
  walk(EXTRACT_DIR);
  console.log(`[scan] found ${candidates.length} csv files`);

  if (candidates.length === 0) throw new Error('no CSVs extracted');

  const stations = [];
  for (const fp of candidates) {
    const txt = readFileSync(fp, 'utf8');
    const lines = txt.split(/\r?\n/);
    if (lines.length < 2) continue;
    const cols = parseCsvLine(lines[0]).map((c) => c.replace(/^"|"$/g, ''));
    const I_LAT = cols.indexOf('LATITUDE');
    const I_LON = cols.indexOf('LONGITUDE');
    if (I_LAT < 0 || I_LON < 0) continue;
    const I_TMIN = cols.indexOf('ANN-TMIN-NORMAL');
    const I_LSTFRZ = cols.indexOf('ANN-TMIN-PRBLST-T32FP50');
    if (I_TMIN < 0 && I_LSTFRZ < 0) continue;
    const row = parseCsvLine(lines[1]);
    const lat = parseFloat(row[I_LAT]);
    const lon = parseFloat(row[I_LON]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tminRaw = I_TMIN >= 0 && row[I_TMIN] ? row[I_TMIN].trim() : '';
    const tmin = tminRaw === '' ? NaN : parseFloat(tminRaw);
    const lstfrzRaw = I_LSTFRZ >= 0 && row[I_LSTFRZ] ? row[I_LSTFRZ].replace(/"/g, '').trim() : '';
    const doy = mmddToDoy(lstfrzRaw);
    // NOAA uses sentinels like -7777, -8888, -9999 for missing/insufficient.
    const tminF = (Number.isFinite(tmin) && tmin > -200 && tmin < 200) ? tmin : NaN;
    if (Number.isNaN(tminF) && doy === 0) continue;
    stations.push({ lat, lon, tminF, doy });
  }
  console.log(`[scan] usable stations: ${stations.length}`);
  return stations;
}

function buildGrid(stations) {
  // Per cell: arrays of contributing values, then averaged.
  const cellTmin = new Array(N_LAT * N_LON).fill(null);
  const cellDoy = new Array(N_LAT * N_LON).fill(null);
  for (const s of stations) {
    const li = Math.floor((s.lat - LAT0) / STEP);
    const oi = Math.floor((s.lon - LON0) / STEP);
    if (li < 0 || li >= N_LAT || oi < 0 || oi >= N_LON) continue;
    const k = li * N_LON + oi;
    if (Number.isFinite(s.tminF)) {
      (cellTmin[k] ??= []).push(s.tminF);
    }
    if (s.doy > 0) {
      (cellDoy[k] ??= []).push(s.doy);
    }
  }

  const tminAvg = new Float32Array(N_LAT * N_LON);
  const doyAvg = new Uint16Array(N_LAT * N_LON);
  let filled = 0;
  for (let k = 0; k < N_LAT * N_LON; k++) {
    const t = cellTmin[k];
    const d = cellDoy[k];
    let hasT = false, hasD = false;
    if (t && t.length) {
      let sum = 0; for (const v of t) sum += v;
      tminAvg[k] = sum / t.length; hasT = true;
    } else tminAvg[k] = NaN;
    if (d && d.length) {
      let sum = 0; for (const v of d) sum += v;
      doyAvg[k] = Math.round(sum / d.length); hasD = true;
    } else doyAvg[k] = 0;
    if (hasT || hasD) filled++;
  }
  console.log(`[grid] direct-station cells: ${filled} / ${N_LAT * N_LON}`);

  // IDW fill: for cells still missing, interpolate from nearest 4 stations
  // within ~1.5 degrees. This smooths sparse coverage in the West and AK.
  // Build a coarse spatial bucket of stations.
  const RADIUS_DEG = 1.5;
  const BUCKET = 1.0;
  const buckets = new Map();
  const bkey = (li, oi) => `${li},${oi}`;
  for (const s of stations) {
    const li = Math.floor((s.lat - LAT0) / BUCKET);
    const oi = Math.floor((s.lon - LON0) / BUCKET);
    const key = bkey(li, oi);
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(s);
  }

  let idwFilled = 0;
  for (let li = 0; li < N_LAT; li++) {
    for (let oi = 0; oi < N_LON; oi++) {
      const k = li * N_LON + oi;
      const needsT = !Number.isFinite(tminAvg[k]);
      const needsD = doyAvg[k] === 0;
      if (!needsT && !needsD) continue;
      const cellLat = LAT0 + (li + 0.5) * STEP;
      const cellLon = LON0 + (oi + 0.5) * STEP;
      // Collect candidates from nearby buckets
      const bli = Math.floor((cellLat - LAT0) / BUCKET);
      const boi = Math.floor((cellLon - LON0) / BUCKET);
      const cand = [];
      for (let dl = -2; dl <= 2; dl++) {
        for (let dn = -2; dn <= 2; dn++) {
          const arr = buckets.get(bkey(bli + dl, boi + dn));
          if (arr) for (const s of arr) cand.push(s);
        }
      }
      // Pick nearest 4 within RADIUS_DEG
      const scored = [];
      for (const s of cand) {
        const dlat = s.lat - cellLat;
        const dlon = s.lon - cellLon;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        if (dist <= RADIUS_DEG) scored.push({ s, dist });
      }
      scored.sort((a, b) => a.dist - b.dist);
      const top = scored.slice(0, 4);
      if (top.length === 0) continue;
      if (needsT) {
        let sw = 0, sv = 0;
        for (const { s, dist } of top) {
          if (!Number.isFinite(s.tminF)) continue;
          const w = 1 / Math.max(0.05, dist);
          sw += w; sv += w * s.tminF;
        }
        if (sw > 0) tminAvg[k] = sv / sw;
      }
      if (needsD) {
        let sw = 0, sv = 0;
        for (const { s, dist } of top) {
          if (s.doy <= 0) continue;
          const w = 1 / Math.max(0.05, dist);
          sw += w; sv += w * s.doy;
        }
        if (sw > 0) doyAvg[k] = Math.round(sv / sw);
      }
      if (Number.isFinite(tminAvg[k]) || doyAvg[k] > 0) idwFilled++;
    }
  }
  console.log(`[grid] idw-filled cells: ${idwFilled}`);

  return { tminAvg, doyAvg };
}

function pack({ tminAvg, doyAvg }) {
  const total = HEADER_BYTES + N_LAT * N_LON * BYTES_PER_CELL;
  const buf = Buffer.alloc(total);
  // Header
  buf.write('FZGR', 0, 'ascii');
  buf.writeUInt8(1, 4);          // version
  buf.writeUInt8(0, 5);          // reserved
  buf.writeInt16LE(Math.round(LAT0 * 100), 6);
  buf.writeInt16LE(Math.round(LON0 * 100), 8);
  buf.writeUInt16LE(Math.round(STEP * 1000), 10);
  buf.writeUInt16LE(Math.round(STEP * 1000), 12);
  buf.writeUInt16LE(N_LAT, 14);
  buf.writeUInt16LE(N_LON, 16);
  // Body: row-major (lat-major), each cell = [doyLo, doyHi, zoneIndex]
  let off = HEADER_BYTES;
  let nonEmpty = 0;
  for (let k = 0; k < N_LAT * N_LON; k++) {
    const doy = doyAvg[k] > 366 ? 0 : doyAvg[k];
    const zone = tempFToZoneIndex(tminAvg[k]);
    buf.writeUInt8(doy & 0xff, off);
    buf.writeUInt8((doy >> 8) & 0xff, off + 1);
    buf.writeUInt8(zone, off + 2);
    off += 3;
    if (doy > 0 || zone > 0) nonEmpty++;
  }
  console.log(`[pack] non-empty cells: ${nonEmpty} / ${N_LAT * N_LON}`);
  return buf;
}

async function main() {
  await ensureTarball();
  ensureExtracted();
  const stations = readStations();
  const grid = buildGrid(stations);
  const buf = pack(grid);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, buf);
  console.log(`[done] ${OUT_PATH}`);
  console.log(`[done] grid ${N_LAT} x ${N_LON} = ${N_LAT * N_LON} cells`);
  console.log(`[done] file size: ${buf.length} bytes (${(buf.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
