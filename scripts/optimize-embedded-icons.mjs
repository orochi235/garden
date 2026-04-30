#!/usr/bin/env node
// Resize and quantize the base64-embedded plant icons in cultivars.json and
// species.json. Source PNGs in /icons/ are untouched.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TARGET_PX = 128;
const TARGET_COLORS = 128;

const FILES = [
  'src/data/cultivars.json',
  'src/data/species.json',
];

function optimizePngBuffer(buf, scratchDir, idx) {
  const inPath = join(scratchDir, `in-${idx}.png`);
  const outPath = join(scratchDir, `out-${idx}.png`);
  writeFileSync(inPath, buf);
  execFileSync('magick', [
    inPath,
    '-resize', `${TARGET_PX}x${TARGET_PX}`,
    '-strip',
    '-colors', String(TARGET_COLORS),
    '-define', 'png:compression-level=9',
    outPath,
  ]);
  return { buf: readFileSync(outPath), path: outPath };
}

// Sample inside the seal script's feather zone (~6px) so we capture the
// icon's visible rim color, not the feathered fade-out at the very edge.
const INSET = 8;
const PATCH = 6;

function samplePatch(pngPath, x, y, w, h) {
  const out = execFileSync('magick', [
    pngPath, '-alpha', 'off',
    '-crop', `${w}x${h}+${x}+${y}`,
    '-format', '%[fx:int(mean.r*255)] %[fx:int(mean.g*255)] %[fx:int(mean.b*255)]',
    'info:',
  ]).toString().trim().split(/\s+/).map((s) => parseInt(s, 10));
  return out;
}

function colorDist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function sampleEdgeColor(pngPath) {
  const dims = execFileSync('magick', ['identify', '-format', '%w %h', pngPath])
    .toString().trim().split(/\s+/);
  const W = parseInt(dims[0], 10);
  const H = parseInt(dims[1], 10);
  // 8 patches arranged around the icon, each PATCHxPATCH, INSET pixels in
  // from the corresponding edge.
  const xL = INSET;
  const xR = W - INSET - PATCH;
  const yT = INSET;
  const yB = H - INSET - PATCH;
  const xMid = Math.round((W - PATCH) / 2);
  const yMid = Math.round((H - PATCH) / 2);
  const patches = [
    [xL, yT], [xR, yT], [xL, yB], [xR, yB],
    [xMid, yT], [xMid, yB], [xL, yMid], [xR, yMid],
  ];
  const samples = patches.map(([x, y]) => samplePatch(pngPath, x, y, PATCH, PATCH));

  // Robust central estimate: median per channel, then keep samples within
  // a tolerance of the median and average those. Outliers (e.g. patches
  // that landed on the subject) get dropped.
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const med = [0, 1, 2].map((i) => median(samples.map((s) => s[i])));
  const TOL = 24;
  const kept = samples.filter((s) => colorDist(s, med) <= TOL);
  const pool = kept.length >= 3 ? kept : samples;
  const sum = pool.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]);
  const r = Math.round(sum[0] / pool.length);
  const g = Math.round(sum[1] / pool.length);
  const b = Math.round(sum[2] / pool.length);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function processFile(rel) {
  const path = join(process.cwd(), rel);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'icon-opt-'));
  let beforeBytes = 0;
  let afterBytes = 0;
  let touched = 0;
  try {
    data.forEach((entry, i) => {
      if (typeof entry.iconImage !== 'string') return;
      const m = entry.iconImage.match(/^data:image\/png;base64,(.+)$/);
      if (!m) return;
      const buf = Buffer.from(m[1], 'base64');
      beforeBytes += buf.length;
      const { buf: optBuf, path: optPath } = optimizePngBuffer(buf, scratch, i);
      afterBytes += optBuf.length;
      entry.iconImage = `data:image/png;base64,${optBuf.toString('base64')}`;
      // Resample iconBgColor from the optimized image so it matches what's actually rendered.
      if ('iconBgColor' in entry) entry.iconBgColor = sampleEdgeColor(optPath);
      touched++;
      if (touched % 20 === 0) process.stdout.write(`  ${touched} done\n`);
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `${rel}: ${touched} icons, ${(beforeBytes / 1e6).toFixed(1)}MB → ${(afterBytes / 1e6).toFixed(2)}MB`,
  );
}

for (const f of FILES) processFile(f);
