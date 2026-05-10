# Visual Regression

Playwright + pixelmatch rig that screenshots each `tests/visual/fixtures/*.garden`
scene through the dev server and compares pixel-for-pixel against committed
baselines in `tests/visual/baselines/*.png`.

## Run

```
npm run test:visual
```

The dev server starts automatically (or reuses one if already running). On the
first run for a new fixture, the spec captures a baseline and SKIPs that test;
re-run to compare.

## Update baselines

When an intentional visual change lands, refresh baselines:

```
rm tests/visual/baselines/*.png
npm run test:visual           # creates fresh baselines, all tests SKIP
npm run test:visual           # re-runs and confirms green
```

## Diff artifacts

Failed runs write `tests/visual/diffs/<name>.diff.png` (highlighted diff) and
`<name>.actual.png` (the screenshot that failed). Both are gitignored.

## Adding a fixture

1. Build the scene in the running dev server (`npm run dev`).
2. File → Download Garden.
3. Move the downloaded `.garden` into `tests/visual/fixtures/<fixture-name>.garden`.
4. Add the name to the `FIXTURES` array in `visual.spec.ts`.
5. Run `npm run test:visual` to capture the new baseline.

## Pinning

Browser version is bound to the installed Playwright (`@playwright/test` in
`package.json`). Bumping that version may shift baselines — review diffs after
upgrades.

## Threshold

Per-pixel YIQ distance: `0.1`. Pass criterion: `< 2%` of pixels differ.
Mirrors weasel's own visual rig settings.
