import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const FIXTURES = [
  'garden-empty',
  'garden-mixed',
  'garden-mixed-selected',
  'garden-zoomed-in',
  'seed-empty',
  'seed-with-seedlings',
  'seed-sown-cells',
];

const BASELINE_DIR = path.join(__dirname, 'baselines');
const DIFF_DIR = path.join(__dirname, 'diffs');
const PIXEL_THRESHOLD = 0.1;
const FAIL_RATIO = 0.02;

for (const name of FIXTURES) {
  test(`fixture: ${name}`, async ({ page }) => {
    await page.goto(`/?fixture=${name}`);
    await page.waitForSelector('[data-canvas-ready="true"]', { timeout: 10_000 });
    const canvas = page.locator('canvas').first();
    const actualBuf = await canvas.screenshot();
    const baselinePath = path.join(BASELINE_DIR, `${name}.png`);

    if (!fs.existsSync(baselinePath)) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(baselinePath, actualBuf);
      test.skip(true, `Baseline created at ${baselinePath}; re-run to compare.`);
      return;
    }

    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const actual = PNG.sync.read(actualBuf);
    expect(actual.width, 'actual width').toBe(baseline.width);
    expect(actual.height, 'actual height').toBe(baseline.height);

    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const numDiff = pixelmatch(
      baseline.data, actual.data, diff.data,
      baseline.width, baseline.height,
      { threshold: PIXEL_THRESHOLD },
    );
    const ratio = numDiff / (baseline.width * baseline.height);
    if (ratio > FAIL_RATIO) {
      fs.mkdirSync(DIFF_DIR, { recursive: true });
      fs.writeFileSync(path.join(DIFF_DIR, `${name}.diff.png`), PNG.sync.write(diff));
      fs.writeFileSync(path.join(DIFF_DIR, `${name}.actual.png`), actualBuf);
    }
    expect(ratio, `pixel diff ratio for ${name}`).toBeLessThanOrEqual(FAIL_RATIO);
  });
}
