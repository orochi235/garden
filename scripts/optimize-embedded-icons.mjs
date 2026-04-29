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
  return readFileSync(outPath);
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
      const opt = optimizePngBuffer(buf, scratch, i);
      afterBytes += opt.length;
      entry.iconImage = `data:image/png;base64,${opt.toString('base64')}`;
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
