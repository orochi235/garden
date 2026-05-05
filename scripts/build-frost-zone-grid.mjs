#!/usr/bin/env node
// Build a packed binary grid of USDA hardiness zone + last-spring-frost date.
//
// Two data sources, fused into one 0.5 deg lat/lon grid covering CONUS + AK + HI + PR:
//
//   1. USDA Plant Hardiness Zone Map (PHZM) 2023, prepared by the PRISM Climate
//      Group at OSU. Distributed as ESRI BIL rasters at 30 arcsec (~800 m)
//      resolution; pixel value is the long-term *average annual extreme minimum
//      temperature* in °F — exactly what USDA hardiness zones are defined from.
//      We resample by averaging all in-bounds PHZM pixels per output cell.
//      Source: https://prism.oregonstate.edu/phzm/
//      License: free reproduction/redistribution under PRISM/USDA terms; this
//      script transforms (resamples + quantizes to half-zone), so per their
//      terms any rendered map must carry the "not the official USDA Plant
//      Hardiness Zone Map" disclaimer (consumer-side concern, not this script).
//
//   2. NOAA NCEI 1991-2020 Climate Normals, "by-station" annual/seasonal data —
//      specifically `ANN-TMIN-PRBLST-T32FP50` (median day of last spring frost
//      with TMIN ≤ 32 °F at 50% probability). Rasterized onto the same 0.5 deg
//      grid via station averaging + IDW backfill.
//      Source: https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/
//
// Output: public/data/frost-zone-grid.bin in the existing 18-byte-header,
// 3-byte-per-cell format consumed by src/utils/frostZone.ts.
//
// Idempotent: downloaded archives are cached under .cache/.

import { mkdirSync, existsSync, readFileSync, writeFileSync, createWriteStream, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '.cache');
const OUT_PATH = join(ROOT, 'public', 'data', 'frost-zone-grid.bin');

// ---------- NOAA last-frost source ----------

const NOAA_TAR_URL = 'https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/archive/us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz';
const NOAA_TAR_PATH = join(CACHE_DIR, 'noaa-normals-annualseasonal.tar.gz');
const NOAA_EXTRACT_DIR = join(CACHE_DIR, 'noaa-normals-annualseasonal');

// ---------- PHZM zone source ----------

const PHZM_BASE = 'https://prism.oregonstate.edu/phzm/data/2023';
const PHZM_REGIONS = ['us', 'ak', 'hi', 'pr'];
const PHZM_DIR = join(CACHE_DIR, 'phzm');

// ---------- Output grid ----------

// Covers CONUS + AK + HI + PR.
//   CONUS: ~24.5..49.5 N, -125..-66.5 E
//   AK:    up to ~71.5 N, AK reaches west to ~172E (we cut at -172)
//   HI:    ~19..22 N, ~-160..-155 E
//   PR:    ~17.5..18.7 N, ~-67.5..-65.2 E
const LAT0 = 17.0;       // southernmost row's south edge (PR)
const LAT1 = 72.0;       // northernmost row's north edge (AK)
const LON0 = -172.0;     // westernmost (AK Aleutians cutoff)
const LON1 = -65.0;      // easternmost (PR)
const STEP = 0.5;        // degrees
const N_LAT = Math.round((LAT1 - LAT0) / STEP); // 110
const N_LON = Math.round((LON1 - LON0) / STEP); // 214

const HEADER_BYTES = 18;
const BYTES_PER_CELL = 3;

// USDA hardiness zones: zone N covers avg annual extreme min temp from
// (-60 + (N-1)*10) F to (-60 + N*10) F. Half-zones split each 10F band into
// 5F halves: 'a' is the colder half, 'b' is the warmer half.
// Index 0 = unknown. Index 1..26 maps to '1a'..'13b'.
function tempFToZoneIndex(tempF) {
  if (!Number.isFinite(tempF)) return 0;
  const n = Math.floor((tempF + 60) / 10) + 1;
  if (n < 1) return 1;
  if (n > 13) return 26;
  const bandLow = -60 + (n - 1) * 10;
  const half = tempF < bandLow + 5 ? 0 : 1; // 0 = a, 1 = b
  return (n - 1) * 2 + 1 + half;
}

// ---------- Generic download helper ----------

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

// ---------- NOAA last-frost ingest ----------

async function ensureNoaaTarball() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(NOAA_TAR_PATH) && statSync(NOAA_TAR_PATH).size > 1_000_000) return;
  console.log(`[noaa] fetch ${NOAA_TAR_URL}`);
  await downloadFollow(NOAA_TAR_URL, NOAA_TAR_PATH);
  console.log(`[noaa] wrote ${NOAA_TAR_PATH} (${(statSync(NOAA_TAR_PATH).size / 1e6).toFixed(1)} MB)`);
}

function ensureNoaaExtracted() {
  if (existsSync(NOAA_EXTRACT_DIR) && readdirSync(NOAA_EXTRACT_DIR).length > 100) return;
  mkdirSync(NOAA_EXTRACT_DIR, { recursive: true });
  console.log(`[noaa] extract ${NOAA_TAR_PATH} -> ${NOAA_EXTRACT_DIR}`);
  execFileSync('tar', ['-xzf', NOAA_TAR_PATH, '-C', NOAA_EXTRACT_DIR], { stdio: 'inherit' });
}

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

function readNoaaStations() {
  const candidates = [];
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.csv')) candidates.push(p);
    }
  }
  walk(NOAA_EXTRACT_DIR);
  console.log(`[noaa] csv files: ${candidates.length}`);
  if (candidates.length === 0) throw new Error('no NOAA CSVs extracted');

  const stations = [];
  for (const fp of candidates) {
    const txt = readFileSync(fp, 'utf8');
    const lines = txt.split(/\r?\n/);
    if (lines.length < 2) continue;
    const cols = parseCsvLine(lines[0]).map((c) => c.replace(/^"|"$/g, ''));
    const I_LAT = cols.indexOf('LATITUDE');
    const I_LON = cols.indexOf('LONGITUDE');
    if (I_LAT < 0 || I_LON < 0) continue;
    const I_LSTFRZ = cols.indexOf('ANN-TMIN-PRBLST-T32FP50');
    if (I_LSTFRZ < 0) continue;
    const row = parseCsvLine(lines[1]);
    const lat = parseFloat(row[I_LAT]);
    const lon = parseFloat(row[I_LON]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const lstfrzRaw = row[I_LSTFRZ] ? row[I_LSTFRZ].replace(/"/g, '').trim() : '';
    const doy = mmddToDoy(lstfrzRaw);
    if (doy === 0) continue;
    stations.push({ lat, lon, doy });
  }
  console.log(`[noaa] usable stations (last-frost): ${stations.length}`);
  return stations;
}

function buildLastFrostGrid(stations) {
  const cells = new Array(N_LAT * N_LON).fill(null);
  for (const s of stations) {
    const li = Math.floor((s.lat - LAT0) / STEP);
    const oi = Math.floor((s.lon - LON0) / STEP);
    if (li < 0 || li >= N_LAT || oi < 0 || oi >= N_LON) continue;
    const k = li * N_LON + oi;
    (cells[k] ??= []).push(s.doy);
  }

  const doyAvg = new Uint16Array(N_LAT * N_LON);
  let direct = 0;
  for (let k = 0; k < N_LAT * N_LON; k++) {
    const d = cells[k];
    if (d && d.length) {
      let sum = 0;
      for (const v of d) sum += v;
      doyAvg[k] = Math.round(sum / d.length);
      direct++;
    }
  }
  console.log(`[noaa] direct cells: ${direct} / ${N_LAT * N_LON}`);

  // IDW backfill within ~1.5 deg using 4 nearest stations.
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
      if (doyAvg[k] !== 0) continue;
      const cellLat = LAT0 + (li + 0.5) * STEP;
      const cellLon = LON0 + (oi + 0.5) * STEP;
      const bli = Math.floor((cellLat - LAT0) / BUCKET);
      const boi = Math.floor((cellLon - LON0) / BUCKET);
      const cand = [];
      for (let dl = -2; dl <= 2; dl++) {
        for (let dn = -2; dn <= 2; dn++) {
          const arr = buckets.get(bkey(bli + dl, boi + dn));
          if (arr) for (const s of arr) cand.push(s);
        }
      }
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
      let sw = 0, sv = 0;
      for (const { s, dist } of top) {
        const w = 1 / Math.max(0.05, dist);
        sw += w; sv += w * s.doy;
      }
      if (sw > 0) {
        doyAvg[k] = Math.round(sv / sw);
        idwFilled++;
      }
    }
  }
  console.log(`[noaa] idw-filled cells: ${idwFilled}`);
  return doyAvg;
}

// ---------- PHZM ingest ----------

async function ensurePhzmRegion(region) {
  mkdirSync(PHZM_DIR, { recursive: true });
  const zipPath = join(PHZM_DIR, `phzm_${region}_grid_2023.zip`);
  const bilPath = join(PHZM_DIR, `phzm_${region}_grid_2023.bil`);
  const hdrPath = join(PHZM_DIR, `phzm_${region}_grid_2023.hdr`);
  if (existsSync(bilPath) && existsSync(hdrPath)) return { bilPath, hdrPath };
  if (!existsSync(zipPath) || statSync(zipPath).size < 1000) {
    const url = `${PHZM_BASE}/phzm_${region}_grid_2023.zip`;
    console.log(`[phzm] fetch ${url}`);
    await downloadFollow(url, zipPath);
  }
  console.log(`[phzm] unzip ${zipPath}`);
  execFileSync('unzip', ['-o', zipPath, '-d', PHZM_DIR], { stdio: 'inherit' });
  return { bilPath, hdrPath };
}

function parsePhzmHeader(hdrPath) {
  const txt = readFileSync(hdrPath, 'utf8');
  const fields = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = /^(\w+)\s+(\S.*?)\s*$/.exec(line);
    if (m) fields[m[1].toUpperCase()] = m[2];
  }
  if (fields.LAYOUT !== 'BIL') throw new Error(`unsupported layout: ${fields.LAYOUT}`);
  if (fields.PIXELTYPE !== 'FLOAT' || fields.NBITS !== '32') {
    throw new Error(`unsupported pixel: ${fields.PIXELTYPE}/${fields.NBITS}`);
  }
  if (fields.BYTEORDER !== 'I') throw new Error(`unsupported byteorder: ${fields.BYTEORDER}`);
  return {
    nrows: parseInt(fields.NROWS, 10),
    ncols: parseInt(fields.NCOLS, 10),
    ulx: parseFloat(fields.ULXMAP),     // longitude of center of upper-left pixel
    uly: parseFloat(fields.ULYMAP),     // latitude of center of upper-left pixel
    xdim: parseFloat(fields.XDIM),
    ydim: parseFloat(fields.YDIM),
    nodata: parseFloat(fields.NODATA),
  };
}

// Resample one PHZM raster onto the output grid by averaging all PHZM pixels
// whose center falls inside each output cell. Returns parallel sum/count
// arrays so multiple regions can be merged before averaging.
function accumulatePhzmRegion({ bilPath, hdrPath }, sumF, countN) {
  const hdr = parsePhzmHeader(hdrPath);
  const buf = readFileSync(bilPath);
  if (buf.length < hdr.nrows * hdr.ncols * 4) {
    throw new Error(`bil truncated: ${bilPath}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let added = 0, nodata = 0, oob = 0;
  for (let r = 0; r < hdr.nrows; r++) {
    const lat = hdr.uly - r * hdr.ydim;
    const li = Math.floor((lat - LAT0) / STEP);
    if (li < 0 || li >= N_LAT) { oob += hdr.ncols; continue; }
    const rowOff = r * hdr.ncols * 4;
    for (let c = 0; c < hdr.ncols; c++) {
      const lon = hdr.ulx + c * hdr.xdim;
      const oi = Math.floor((lon - LON0) / STEP);
      if (oi < 0 || oi >= N_LON) { oob++; continue; }
      const v = view.getFloat32(rowOff + c * 4, true);
      if (!Number.isFinite(v) || v === hdr.nodata || v < -200) { nodata++; continue; }
      const k = li * N_LON + oi;
      sumF[k] += v;
      countN[k] += 1;
      added++;
    }
  }
  console.log(`[phzm] ${bilPath.split('/').pop()}: added=${added} nodata=${nodata} oob=${oob}`);
}

async function buildZoneGrid() {
  const cells = N_LAT * N_LON;
  const sumF = new Float64Array(cells);
  const countN = new Uint32Array(cells);
  for (const r of PHZM_REGIONS) {
    const paths = await ensurePhzmRegion(r);
    accumulatePhzmRegion(paths, sumF, countN);
  }
  const tminAvg = new Float32Array(cells);
  const zoneIdx = new Uint8Array(cells);
  let direct = 0;
  for (let k = 0; k < cells; k++) {
    if (countN[k] > 0) {
      tminAvg[k] = sumF[k] / countN[k];
      zoneIdx[k] = tempFToZoneIndex(tminAvg[k]);
      direct++;
    } else {
      tminAvg[k] = NaN;
    }
  }
  console.log(`[phzm] direct cells: ${direct} / ${cells}`);

  // Nearest-neighbor backfill within 3 cells (1.5 deg) for cells that fall
  // between PHZM regions (e.g. coastal/ocean cells touched only at corners).
  // Mirrors the consumer's expansion radius so fallback agrees with lookup.
  let backfilled = 0;
  for (let li = 0; li < N_LAT; li++) {
    for (let oi = 0; oi < N_LON; oi++) {
      const k = li * N_LON + oi;
      if (zoneIdx[k] !== 0) continue;
      let best = null;
      for (let r = 1; r <= 3 && !best; r++) {
        for (let dl = -r; dl <= r; dl++) {
          for (let dn = -r; dn <= r; dn++) {
            if (Math.max(Math.abs(dl), Math.abs(dn)) !== r) continue;
            const li2 = li + dl;
            const oi2 = oi + dn;
            if (li2 < 0 || li2 >= N_LAT || oi2 < 0 || oi2 >= N_LON) continue;
            const k2 = li2 * N_LON + oi2;
            if (zoneIdx[k2] !== 0) {
              const dist2 = dl * dl + dn * dn;
              if (!best || dist2 < best.dist2) best = { idx: zoneIdx[k2], dist2 };
            }
          }
        }
      }
      if (best) { zoneIdx[k] = best.idx; backfilled++; }
    }
  }
  console.log(`[phzm] nn-backfilled cells: ${backfilled}`);
  return zoneIdx;
}

// ---------- Pack ----------

function pack(zoneIdx, doyAvg) {
  const total = HEADER_BYTES + N_LAT * N_LON * BYTES_PER_CELL;
  const buf = Buffer.alloc(total);
  buf.write('FZGR', 0, 'ascii');
  buf.writeUInt8(1, 4);          // version
  buf.writeUInt8(0, 5);          // reserved
  buf.writeInt16LE(Math.round(LAT0 * 100), 6);
  buf.writeInt16LE(Math.round(LON0 * 100), 8);
  buf.writeUInt16LE(Math.round(STEP * 1000), 10);
  buf.writeUInt16LE(Math.round(STEP * 1000), 12);
  buf.writeUInt16LE(N_LAT, 14);
  buf.writeUInt16LE(N_LON, 16);
  let off = HEADER_BYTES;
  let nonEmpty = 0;
  for (let k = 0; k < N_LAT * N_LON; k++) {
    const doy = doyAvg[k] > 366 ? 0 : doyAvg[k];
    const zone = zoneIdx[k];
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
  // PHZM zone grid
  const zoneIdx = await buildZoneGrid();
  // NOAA last-frost grid
  await ensureNoaaTarball();
  ensureNoaaExtracted();
  const noaaStations = readNoaaStations();
  const doyAvg = buildLastFrostGrid(noaaStations);

  const buf = pack(zoneIdx, doyAvg);
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
