#!/usr/bin/env node
// Hard-paints the outermost TRIM pixels of each icon with its sampled
// background color. Eliminates gridline artifacts left over from the source
// grid crop (dark borders, anti-aliased seams, stray pixels) without
// softening the interior — the icon edge stays sharp.
//
// Operates on:
//   - data URIs embedded in src/data/cultivars.json and src/data/species.json
//   - PNG files in icons/, icons/opaque/, icons/transparent/, icons/dist/
//
// Algorithm per image:
//   1. Sample the bg color from 8 PATCH-sized swatches arranged around the
//      perimeter, INSET pixels in from each edge. Median-filter outliers
//      (patches that landed on the subject), then average the inliers.
//   2. Paint the outermost TRIM rows/columns of the image with that color.
//
// Usage:
//   node scripts/seal-icon-edges.mjs           # processes everything
//   node scripts/seal-icon-edges.mjs --json    # only the embedded JSON
//   node scripts/seal-icon-edges.mjs --files   # only the PNG files
//   node scripts/seal-icon-edges.mjs --dry     # report only

import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const TRIM = 2;     // px of edge to overwrite with bg color
const INSET = 8;    // sample patches start this many px from the edge
const PATCH = 6;    // sample patch side
const TOL = 24;     // L1 distance from median to keep a patch

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const ONLY_JSON = args.has('--json');
const ONLY_FILES = args.has('--files');

function magick(...a) {
  return execFileSync('magick', a, { maxBuffer: 1 << 26 });
}

function samplePatch(path, x, y, w, h) {
  return magick(
    path, '-alpha', 'off',
    '-crop', `${w}x${h}+${x}+${y}`,
    '-format', '%[fx:int(mean.r*255)] %[fx:int(mean.g*255)] %[fx:int(mean.b*255)]',
    'info:',
  ).toString().trim().split(/\s+/).map((s) => parseInt(s, 10));
}

function sampleBg(path, W, H) {
  const xL = INSET;
  const xR = W - INSET - PATCH;
  const yT = INSET;
  const yB = H - INSET - PATCH;
  const xMid = Math.round((W - PATCH) / 2);
  const yMid = Math.round((H - PATCH) / 2);
  const points = [
    [xL, yT], [xR, yT], [xL, yB], [xR, yB],
    [xMid, yT], [xMid, yB], [xL, yMid], [xR, yMid],
  ];
  const samples = points.map(([x, y]) => samplePatch(path, x, y, PATCH, PATCH));
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const med = [0, 1, 2].map((i) => median(samples.map((s) => s[i])));
  const dist = (a) => Math.abs(a[0] - med[0]) + Math.abs(a[1] - med[1]) + Math.abs(a[2] - med[2]);
  const kept = samples.filter((s) => dist(s) <= TOL);
  const pool = kept.length >= 3 ? kept : samples;
  const sum = pool.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]);
  return [
    Math.round(sum[0] / pool.length),
    Math.round(sum[1] / pool.length),
    Math.round(sum[2] / pool.length),
  ];
}

function rgbHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function sealOne(inBuf, scratchDir, idx) {
  const inPath = join(scratchDir, `in-${idx}.png`);
  const outPath = join(scratchDir, `out-${idx}.png`);
  writeFileSync(inPath, inBuf);

  const dims = magick('identify', '-format', '%w %h', inPath).toString().trim().split(/\s+/);
  const W = parseInt(dims[0], 10);
  const H = parseInt(dims[1], 10);
  if (!W || !H) throw new Error('bad dims');

  const [r, g, b] = sampleBg(inPath, W, H);
  const bg = `rgb(${r},${g},${b})`;

  // Hard-paint the four border bands. Each rectangle is inclusive in IM.
  magick(
    inPath,
    '-fill', bg,
    '-draw', `rectangle 0,0 ${W - 1},${TRIM - 1}`,
    '-draw', `rectangle 0,${H - TRIM} ${W - 1},${H - 1}`,
    '-draw', `rectangle 0,0 ${TRIM - 1},${H - 1}`,
    '-draw', `rectangle ${W - TRIM},0 ${W - 1},${H - 1}`,
    outPath,
  );

  return { buf: readFileSync(outPath), bg: rgbHex([r, g, b]) };
}

function processJson(rel) {
  const path = join(ROOT, rel);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'icon-seal-'));
  let touched = 0;
  try {
    data.forEach((entry, i) => {
      if (typeof entry.iconImage !== 'string') return;
      const m = entry.iconImage.match(/^data:image\/png;base64,(.+)$/);
      if (!m) return;
      const buf = Buffer.from(m[1], 'base64');
      const { buf: outBuf, bg } = sealOne(buf, scratch, i);
      if (!DRY) {
        entry.iconImage = `data:image/png;base64,${outBuf.toString('base64')}`;
        if ('iconBgColor' in entry) entry.iconBgColor = bg;
      }
      touched++;
      if (touched % 25 === 0) process.stdout.write(`  ${rel}: ${touched}\n`);
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!DRY) writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`${rel}: sealed ${touched} icons${DRY ? ' (dry-run)' : ''}`);
}

function processDir(rel) {
  const dir = join(ROOT, rel);
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  const pngs = entries.filter((f) => f.toLowerCase().endsWith('.png'));
  if (pngs.length === 0) return;
  const scratch = mkdtempSync(join(tmpdir(), 'icon-seal-'));
  let touched = 0;
  try {
    pngs.forEach((f, i) => {
      const path = join(dir, f);
      const stat = statSync(path);
      if (stat.size > 50 * 1024 * 1024) {
        console.log(`  skip ${f} (too large: ${(stat.size/1e6).toFixed(0)}MB)`);
        return;
      }
      const buf = readFileSync(path);
      const { buf: outBuf } = sealOne(buf, scratch, i);
      if (!DRY) writeFileSync(path, outBuf);
      touched++;
      if (touched % 25 === 0) process.stdout.write(`  ${rel}: ${touched}/${pngs.length}\n`);
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`${rel}: sealed ${touched} files${DRY ? ' (dry-run)' : ''}`);
}

if (!ONLY_FILES) {
  for (const f of ['src/data/cultivars.json', 'src/data/species.json']) processJson(f);
}
if (!ONLY_JSON) {
  for (const d of ['icons', 'icons/opaque', 'icons/transparent', 'icons/dist']) processDir(d);
}
