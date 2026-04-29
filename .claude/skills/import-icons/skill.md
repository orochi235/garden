---
name: import-icons
description: Use when the user provides a grid image of plant icons (herbs, vegetables, fruits, etc.) and wants to cut it into individual icon PNGs, or update existing icons from a new source image
---

# Import Icons from Grid Image

Takes a grid image of plant/produce icons, identifies each item, cuts the grid into individual PNG files, and updates the species/cultivar database with base64-encoded icon images.

## Prerequisites

- ImageMagick must be installed (`brew install imagemagick` if missing)
- The source image should be a grid of evenly-spaced icons (e.g. 6x6)
- Each cell must have a **solid background color** (not checkerboard/gradient) that contrasts with the subject

## Inputs

Ask the user for any that are missing:

| Parameter | Description | Example |
|-----------|-------------|---------|
| **source image** | Path to the grid image file | `/Users/mike/Downloads/herbs.png` |
| **grid size** | Rows x columns (default: 6x6) | `6x6` |
| **has gridlines** | Whether there are visible gridlines between cells (default: auto-detect visually) | yes/no |
| **output size** | Side length in pixels for final distribution icons (default: 128) | `128` |

## Steps

### 1. Analyze the source image

```bash
magick identify "$SOURCE_IMAGE"
magick identify -verbose "$SOURCE_IMAGE" | grep -iE "alpha|type|channels"
```

Get the dimensions. Calculate cell size: `cell_width = image_width / cols`, `cell_height = image_height / rows`.

If the image has gridlines, set `INSET=4` (pixels to trim from each cell edge at source resolution). Otherwise `INSET=0`.

Determine alpha status:
- `Type: TrueColorAlpha` / `Channels: 4` → has real alpha, skip background removal
- `Type: TrueColor` / `Channels: 3` → needs background removal

### 2. Identify the icons

Look at the source image visually. Identify each plant/produce item in the grid, reading left-to-right, top-to-bottom. Build a flat array of names using kebab-case (e.g. `cherry-tomato`, `bay-leaf`, `lemon-balm`).

**Naming rules:**
- Use the common English name in kebab-case
- Match existing species IDs from `src/data/species.json` where possible
- Match existing cultivar IDs from `src/data/cultivars.json` where possible
- For items not in the database, use a reasonable common name

### 3. Handle duplicate names

Before writing files, check if any name in the new batch duplicates a name from a *different* source image that already exists in `icons/`. If the new image is visually different from the existing one (i.e. it's not just a re-import of the same grid), add a numeric suffix to the new icon: `basil-2.png`, `basil-3.png`, etc.

If the user is explicitly re-importing the same grid (updating existing icons), overwrite without suffixes.

### 4. Slice into opaque icons

Crop every cell from the source image and save to `icons/opaque/`. These are the raw slices with their original backgrounds intact. The default icon size is 683x683 (`4096/6`); use the actual cell dimensions from the source image when they differ.

After cropping each cell, trim 1% off each edge to remove any stray gridlines, border artifacts, or dark vignettes that bleed between cells. This trim happens at source resolution before the final resize.

```bash
mkdir -p icons/opaque

ICON_SIZE=$(node -e "const m = require('fs').readFileSync('src/config/constants.ts','utf8').match(/ICON_SIZE\s*=\s*(\d+)/); console.log(m[1])")
i=1
for row in 0 1 2 ... ; do
  for col in 0 1 2 ... ; do
    x=$((col * CELL_WIDTH + INSET))
    y=$((row * CELL_HEIGHT + INSET))
    crop_w=$((CELL_WIDTH - INSET * 2))
    crop_h=$((CELL_HEIGHT - INSET * 2))
    # 1% edge trim to remove border artifacts
    trim=$((crop_w / 100))
    trim_x=$((x + trim))
    trim_y=$((y + trim))
    trim_w=$((crop_w - trim * 2))
    trim_h=$((crop_h - trim * 2))
    name="${names[$i]}"
    magick "$SOURCE_IMAGE" \
      -crop "${trim_w}x${trim_h}+${trim_x}+${trim_y}" +repage \
      -resize "${ICON_SIZE}x${ICON_SIZE}" \
      "icons/opaque/${name}.png"
    i=$((i + 1))
  done
done
```

**Important:** When iterating with zsh arrays, indexing starts at 1, not 0.

### 5. Remove backgrounds

Process each opaque icon to remove its solid background and save to `icons/transparent/`.

```bash
mkdir -p icons/transparent
```

**If source already has a real alpha channel:** Just copy from `opaque/` to `transparent/`.

**If source needs background removal:**

Sample each icon's corner pixel to detect its specific background color, then floodfill from evenly-spaced border seed points. This handles grids where different cells may have different background colors.

```bash
for icon in icons/opaque/*.png; do
  name=$(basename "$icon")
  # Get image dimensions
  sz=$(magick identify -format "%w" "$icon")
  last=$((sz - 1))
  mid=$((sz / 2))
  q1=$((sz / 4))
  q3=$((sz * 3 / 4))

  # Sample at (10,10) to avoid any residual border artifacts
  bg=$(magick "$icon" -format "%[hex:u.p{10,10}]" info:-)

  magick "$icon" \
    -alpha set -fuzz 18% -fill none \
    -draw "color 0,0 floodfill"       -draw "color ${last},0 floodfill" \
    -draw "color 0,${last} floodfill" -draw "color ${last},${last} floodfill" \
    -draw "color ${mid},0 floodfill"  -draw "color ${mid},${last} floodfill" \
    -draw "color 0,${mid} floodfill"  -draw "color ${last},${mid} floodfill" \
    -draw "color ${q1},0 floodfill"   -draw "color ${q3},0 floodfill" \
    -draw "color ${q1},${last} floodfill" -draw "color ${q3},${last} floodfill" \
    -draw "color 0,${q1} floodfill"   -draw "color 0,${q3} floodfill" \
    -draw "color ${last},${q1} floodfill" -draw "color ${last},${q3} floodfill" \
    -fuzz 8% -transparent "#${bg}" \
    "icons/transparent/${name}.png"
  echo "Processed ${name}"
done
```

How this works:
1. **Floodfill from 16 border points** at 18% fuzz removes the connected background region. Seeding from corners, midpoints, and quartiles ensures coverage even if the subject touches one edge.
2. **Global `-transparent`** at 8% fuzz cleans up any small enclosed patches of background that the floodfill couldn't reach (e.g. background peeking through gaps in thin subjects like dill fronds). The color is sampled at (10,10) — slightly inset from the corner to avoid any residual border artifacts — so it adapts to per-cell background variation.

**Tuning:** If subjects have colors close to the background and get eaten, reduce fuzz values. If background remnants persist, increase them. For very light subjects (white mushroom, garlic) on a white/light background, this approach will fail — request icons with a contrasting background color instead.

### 6. Deploy transparent icons

Copy the scrubbed icons from `icons/transparent/` to `icons/` (the final location used by the app):

```bash
cp icons/transparent/*.png icons/
```

### 7. Update the species/cultivar database

After all icons are deployed to `icons/`, run this Node script to re-encode matching icons as base64 data URLs into the JSON data files:

```bash
node -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'icons');
const opaqueDir = path.join(__dirname, 'icons/opaque');
const iconFiles = new Set(
  fs.readdirSync(iconsDir)
    .filter(f => f.endsWith('.png'))
    .map(f => f.replace('.png', ''))
);

// Sample background colors from opaque icons at (10,10) to avoid border artifacts
const bgColors = {};
for (const id of iconFiles) {
  const opaquePath = path.join(opaqueDir, id + '.png');
  if (fs.existsSync(opaquePath)) {
    const hex = execSync('magick \"' + opaquePath + '\" -format \"%[hex:u.p{10,10}]\" info:-', { encoding: 'utf8' }).trim();
    bgColors[id] = '#' + hex;
  }
}

// Update species.json
const speciesPath = path.join(__dirname, 'src/data/species.json');
const species = JSON.parse(fs.readFileSync(speciesPath, 'utf8'));
let speciesMatches = 0;
for (const s of species) {
  if (iconFiles.has(s.id)) {
    const png = fs.readFileSync(path.join(iconsDir, s.id + '.png'));
    s.iconImage = 'data:image/png;base64,' + png.toString('base64');
    s.iconBgColor = bgColors[s.id] || null;
    speciesMatches++;
    console.log('Species match: ' + s.id);
  } else {
    if (!s.iconImage) s.iconImage = null;
    if (!s.iconBgColor) s.iconBgColor = null;
  }
}
fs.writeFileSync(speciesPath, JSON.stringify(species, null, 2) + '\n');
console.log('Species matches: ' + speciesMatches + '/' + species.length);

// Update cultivars.json - only add overrides where cultivar ID matches but species ID doesn't
const cultivarsPath = path.join(__dirname, 'src/data/cultivars.json');
const cultivars = JSON.parse(fs.readFileSync(cultivarsPath, 'utf8'));
const speciesWithIcons = new Set(species.filter(s => s.iconImage).map(s => s.id));
let cultivarMatches = 0;
for (const c of cultivars) {
  if (iconFiles.has(c.id) && !speciesWithIcons.has(c.id)) {
    const png = fs.readFileSync(path.join(iconsDir, c.id + '.png'));
    c.iconImage = 'data:image/png;base64,' + png.toString('base64');
    c.iconBgColor = bgColors[c.id] || null;
    cultivarMatches++;
    console.log('Cultivar match: ' + c.id);
  }
}
fs.writeFileSync(cultivarsPath, JSON.stringify(cultivars, null, 2) + '\n');
console.log('Cultivar matches: ' + cultivarMatches);
"
```

### 8. Optimize embedded icons

The base64 PNGs just embedded into `species.json` / `cultivars.json` are at full
source resolution (~683×683, RGB). The app only renders icons at small sizes,
so leaving them at source resolution bloats the JS bundle dramatically (90+ MB
chunk). Run the project optimizer to downsample and quantize the embedded
images in place — source files in `icons/` are untouched.

```bash
node scripts/optimize-embedded-icons.mjs
```

The script resizes each embedded PNG to 128×128 and quantizes to a 128-color
palette. Typical reduction: ~90 MB of icon data → ~1 MB. Re-run this any time
new icons are embedded.

### 9. Generate distribution icons

Resize each final icon to `OUTPUT_SIZE x OUTPUT_SIZE` and save to `icons/dist/`:

```bash
mkdir -p icons/dist
OUTPUT_SIZE=${OUTPUT_SIZE:-128}
for icon in icons/*.png; do
  name=$(basename "$icon")
  magick "$icon" -resize "${OUTPUT_SIZE}x${OUTPUT_SIZE}" "icons/dist/${name}"
done
echo "Generated $(ls icons/dist/*.png | wc -l) dist icons at ${OUTPUT_SIZE}x${OUTPUT_SIZE}"
```

### 9. Verify

Spot-check 2-3 icons by reading the PNG files to confirm:
- Correct crop (no gridline artifacts)
- Transparency is correct (no colored fringe, no eaten subjects)
- Content matches the expected plant

Report a summary table of all icons created, grouped by row, plus the number of species/cultivar database matches updated.

## Notes

- `icons/` — final PNGs used by the app and embedded in the database (full resolution)
- `icons/opaque/` — raw slices with original backgrounds, preserved for re-processing
- `icons/transparent/` — scrubbed icons before deployment to `icons/`
- `icons/dist/` — resized copies at OUTPUT_SIZE for distribution/embedding
- The species database is at `src/data/species.json` — each entry has an `iconImage` field (base64 data URL or null)
- The cultivar database is at `src/data/cultivars.json` — cultivar `iconImage` overrides are optional and fall back to the species value
- The editor page at `docs/cultivars.html` reads these JSON files and displays the icon images
- Icon images are stored as `data:image/png;base64,...` strings in the JSON
- Icon size is defined in `src/config/constants.ts` as `ICON_SIZE` (default 683, i.e. 4096/6). All processing is size-agnostic — dimensions are derived from the actual image
