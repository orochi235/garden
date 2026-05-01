# weasel Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `src/canvas-kit/`, `src/canvas-kit-demo/`, and `docs/canvas-kit/` from garden into a new public repo `github.com/orochi235/weasel`, published to npm as `@orochi235/weasel@0.1.0`. Garden becomes a package consumer.

**Architecture:** Two repos with an npm package boundary. The new `weasel` repo holds the kit source, demo, and docs; it publishes ESM-only via `tsup`, ships `.d.ts` bundles, and uses changesets + GitHub Actions for releases. Garden depends on `@orochi235/weasel` (via `file:../weasel` during active dev, `^0.1.0` afterwards) and contains zero kit source.

**Tech Stack:** Node 20+, TypeScript, tsup, Vitest, changesets, GitHub Actions, npm, ESM.

**Spec:** `docs/canvas-kit/specs/2026-05-01-canvas-kit-extraction-design.md`.

**Open issues encountered while writing this plan (read once):**
- Spec says "no runtime deps if possible" but garden has `clipper2-ts` and `zustand` as deps. The kit currently does not import either at the source level (verified by spec's import-audit checkbox), so this plan declares **no runtime dependencies** and only `react` as a peerDep. Step 13 includes a verification grep before the package.json is finalized — if a runtime dep does turn up, add it as an explicit `dependencies` entry.
- Spec lists subpath exports `./move`, `./resize`, `./insert` but garden's barrel also has `area-select.ts`, `clipboard.ts`, `clone.ts` subpaths today. The plan exposes **all six** in the `exports` map and as `tsup` entries so consumers don't have to revisit the package.json on every kit feature.
- Spec is ambiguous on whether `engines` should pin Node. Plan sets `"engines": {"node": ">=20"}` to match the CI matrix and document the floor.
- Garden's `package.json` does not currently declare a `typecheck` script. Plan's Phase 4 uses `npm run build` (which runs `tsc -b`) for typecheck verification rather than introducing a new script.

---

### Phase 0 — Pre-flight (in garden repo)

#### Task 1: Verify npm scope

**Files:** none (interactive checks).

- [ ] **Step 1.1: Confirm npm login**

```sh
npm whoami
```

Expected: prints `orochi235` (or whichever user owns the scope). If it errors with `ENEEDAUTH`, run `npm login` and retry.

- [ ] **Step 1.2: Confirm scope membership**

```sh
npm access ls-packages @orochi235 2>&1 || echo "no packages yet (this is fine)"
```

Expected: either an empty list / "no packages yet", or a list that does NOT contain `weasel`. The scope itself is created on first publish under `--access=public`; you do not need to create it ahead of time, but you DO need to be logged in as a user who owns it. If `npm whoami` is a different user, log out (`npm logout`) and back in as `orochi235`.

#### Task 2: Verify name availability

- [ ] **Step 2.1: Probe registry**

```sh
npm view @orochi235/weasel 2>&1
```

Expected: `npm error code E404` — name is unclaimed. If this returns a real package document, STOP and choose a new name; the rest of the plan assumes the name is yours.

#### Task 3: Create empty GitHub repo

- [ ] **Step 3.1: Create the repo**

Using the GitHub web UI (or `gh repo create`):

```sh
gh repo create orochi235/weasel --public --description "Domain-agnostic 2D scene graph primitives for React"
```

Do NOT pass `--add-readme`, `--license`, or `--gitignore`. We need an empty repo so the subtree-merged history lands cleanly in step 11.

- [ ] **Step 3.2: Verify**

```sh
gh repo view orochi235/weasel --json isEmpty,visibility
```

Expected: `{"isEmpty": true, "visibility": "PUBLIC"}`.

#### Task 4: TODO/FIXME scan in `src/canvas-kit/`

**Files:** none (audit only; may produce follow-up garden commits).

- [ ] **Step 4.1: Run scan**

```sh
cd /Users/mike/src/eric
grep -rEn "TODO|FIXME|HACK|XXX" src/canvas-kit/ src/canvas-kit-demo/ docs/canvas-kit/ > /tmp/weasel-todo-scan.txt
wc -l /tmp/weasel-todo-scan.txt
cat /tmp/weasel-todo-scan.txt
```

- [ ] **Step 4.2: Triage each marker**

For every line in `/tmp/weasel-todo-scan.txt`, decide one of:

1. **Fix now** — file a small commit on garden's main resolving it, before extraction. (Examples: misleading comments, dead branches, "this should be configurable".)
2. **Defer** — the marker is acceptable in 0.1.0; either leave it as-is or rewrite it into a `// @experimental` JSDoc on the affected export.
3. **Strip** — comment is no longer accurate; delete it.

Record decisions inline in `/tmp/weasel-todo-scan.txt` (one of `FIX/DEFER/STRIP` per line) and commit any "Fix now" changes as one or more `chore(canvas-kit): pre-extraction cleanup` commits on garden's main.

#### Task 5: JSDoc audit on `src/canvas-kit/index.ts`

**Files:**
- Modify: `/Users/mike/src/eric/src/canvas-kit/index.ts`

- [ ] **Step 5.1: Inventory exports without descriptions**

The barrel uses `export *` for many modules. For each `export *` line, open the source file and confirm every named export has at least a one-line JSDoc on the declaration site (the function/type itself, not the barrel re-export). The barrel's named-export blocks (e.g. the `useMoveInteraction` block) are already documented at the source.

```sh
cd /Users/mike/src/eric
for f in $(grep -E "^export \*" src/canvas-kit/index.ts | sed -E "s|.*from '\\./([^']+)'.*|src/canvas-kit/\\1|"); do
  echo "=== $f ==="
  grep -En "^export (function|const|class|interface|type|enum)" "$f.ts" 2>/dev/null || \
    grep -En "^export (function|const|class|interface|type|enum)" "$f/index.ts" 2>/dev/null || \
    echo "(no top-level exports — barrel)"
done
```

- [ ] **Step 5.2: Add missing JSDoc**

For each export without a JSDoc immediately above it, add a one-line `/** ... */` describing what it is and when to reach for it. Keep it terse; this is the API doc surface for the package.

- [ ] **Step 5.3: Commit**

```sh
git -C /Users/mike/src/eric add src/canvas-kit/
git -C /Users/mike/src/eric commit -m "docs(canvas-kit): JSDoc pass on barrel exports for extraction"
```

#### Task 6: Final verification on garden's main

- [ ] **Step 6.1: Clean tree, run full build**

```sh
cd /Users/mike/src/eric
git status   # must be clean
npm test
npm run build
```

Expected: both green. If anything fails, fix on garden before proceeding — extraction must start from a known-good commit.

- [ ] **Step 6.2: Note the SHA**

```sh
git -C /Users/mike/src/eric rev-parse HEAD > /tmp/weasel-extraction-base.txt
cat /tmp/weasel-extraction-base.txt
```

You will reference this SHA when validating the subtree branches in Task 8.

---

### Phase 1 — History extraction

#### Task 7: Create three subtree-split branches

**Files:** none (operates on git refs).

- [ ] **Step 7.1: Split `src/canvas-kit/`**

```sh
cd /Users/mike/src/eric
git subtree split --prefix=src/canvas-kit -b extract/kit
```

Expected output: a SHA (the new branch tip). Branch `extract/kit` now contains kit-only history with `src/canvas-kit/` stripped from paths.

- [ ] **Step 7.2: Split `src/canvas-kit-demo/`**

```sh
git subtree split --prefix=src/canvas-kit-demo -b extract/demo
```

- [ ] **Step 7.3: Split `docs/canvas-kit/`**

```sh
git subtree split --prefix=docs/canvas-kit -b extract/docs
```

#### Task 8: Validate each extracted branch

- [ ] **Step 8.1: Inspect kit branch**

```sh
git -C /Users/mike/src/eric log --oneline extract/kit | head -20
git -C /Users/mike/src/eric ls-tree -r extract/kit | head -20
```

Expected: paths begin with `interactions/`, `ops/`, `adapters/`, `groups/`, `history/`, `hooks/`, or top-level files like `index.ts`, `grid.ts`, `dragGhost.ts`. **No path begins with `src/canvas-kit/`.** If any do, the prefix had been moved historically — rerun with `--prefix` matching the older path or fall back to `git filter-repo` (Task 9).

- [ ] **Step 8.2: Inspect demo branch**

```sh
git -C /Users/mike/src/eric ls-tree -r extract/demo | head -10
```

Expected: paths like `CanvasKitDemo.tsx`, `Card.tsx`, `demos/...`, `canvas-kit-demo.css`. No `src/canvas-kit-demo/` prefixes.

- [ ] **Step 8.3: Inspect docs branch**

```sh
git -C /Users/mike/src/eric ls-tree -r extract/docs | head -10
```

Expected: paths like `README.md`, `concepts.md`, etc. No `docs/canvas-kit/` prefixes.

- [ ] **Step 8.4: Spot-check a kit commit's content**

```sh
git -C /Users/mike/src/eric show --stat extract/kit | head -30
```

Expected: file paths in the diff are repo-root-relative (`index.ts`, not `src/canvas-kit/index.ts`).

#### Task 9: Decision step — subtree-split vs filter-repo

- [ ] **Step 9.1: Default path (already taken)**

`git subtree split` is the spec's default and produces clean per-prefix branches. It loses cross-prefix commit fidelity (a single commit touching `src/canvas-kit/` and `src/canvas-kit-demo/` becomes two separate commits, one per branch).

For this codebase that's acceptable: most commits scope to one prefix.

- [ ] **Step 9.2: Alternative path (only if Task 8 surfaced path-prefix issues)**

If `extract/kit` contains paths still prefixed with `src/canvas-kit/`, the subtree-split missed a historical rename. Switch to `git filter-repo` on a fresh clone:

```sh
cd /tmp
git clone --no-local /Users/mike/src/eric eric-filter
cd eric-filter
git filter-repo \
  --path src/canvas-kit/ \
  --path src/canvas-kit-demo/ \
  --path docs/canvas-kit/ \
  --path-rename src/canvas-kit/:src/ \
  --path-rename src/canvas-kit-demo/:demo/ \
  --path-rename docs/canvas-kit/:docs/
```

This preserves cross-prefix commits, places everything in the final layout, and gives you ONE branch to push to the new repo (instead of three to merge). If you take this path, skip Task 11 and instead `git remote add weasel git@github.com:orochi235/weasel.git && git push weasel HEAD:main`, then jump to Task 12.

- [ ] **Step 9.3: Record the decision**

Add a one-line note to `/tmp/weasel-extraction-base.txt`:

```
extraction-method: subtree-split   # or: filter-repo
```

The rest of this plan assumes subtree-split. If you took filter-repo, Tasks 10–12 collapse into a single push.

---

### Phase 2 — New repo skeleton (in `~/src/weasel`)

#### Task 10: Clone the empty target repo

- [ ] **Step 10.1: Clone**

```sh
cd ~/src
git clone https://github.com/orochi235/weasel.git
cd ~/src/weasel
```

Expected: warning `You appear to have cloned an empty repository.` This is fine.

- [ ] **Step 10.2: Set initial branch**

```sh
git checkout -b main
```

#### Task 11: Pull the three histories into subdirectories

We use `git subtree add` (cleaner than `read-tree` for an initial import that needs commit messages and history) for each prefix.

- [ ] **Step 11.1: Add a remote pointing at the garden checkout**

```sh
cd ~/src/weasel
git remote add garden /Users/mike/src/eric
git fetch garden extract/kit extract/demo extract/docs
```

Expected: three branches fetched.

- [ ] **Step 11.2: Seed an initial commit so subtree add has something to merge into**

```sh
echo "# weasel" > README.md
git add README.md
git commit -m "chore: seed empty repo for subtree imports"
```

(This stub README is overwritten in Task 19.)

- [ ] **Step 11.3: Subtree-add the kit history under `src/`**

```sh
git subtree add --prefix=src garden/extract/kit -m "chore: import canvas-kit history into src/"
```

Expected: a merge commit landing all kit history with paths now prefixed `src/`.

- [ ] **Step 11.4: Subtree-add the demo history under `demo/`**

```sh
git subtree add --prefix=demo garden/extract/demo -m "chore: import canvas-kit-demo history into demo/"
```

- [ ] **Step 11.5: Subtree-add the docs history under `docs/`**

```sh
git subtree add --prefix=docs garden/extract/docs -m "chore: import canvas-kit docs history into docs/"
```

- [ ] **Step 11.6: Verify the layout**

```sh
ls -la
ls src/ demo/ docs/
git log --oneline | head -10
```

Expected: top level has `README.md`, `src/`, `demo/`, `docs/`. `src/index.ts` exists. Three "import ... history" merge commits in the log plus the seed commit.

- [ ] **Step 11.7: Drop the garden remote**

```sh
git remote remove garden
```

#### Task 12: (Optional) Initial scaffolding commit

If you arrive here from filter-repo (Task 9.2), the seed README does not exist — skip. Otherwise continue with this plan; the README is overwritten in Task 19 and we will commit configuration in Task 23.

#### Task 13: Add `package.json`

**Files:**
- Create: `~/src/weasel/package.json`

- [ ] **Step 13.1: Verify no surprise runtime deps**

```sh
cd ~/src/weasel
grep -rEn "from '(zustand|clipper2-ts|@?garden|@/canvas)" src/ | grep -v "from '@/canvas-kit" || echo "clean"
```

Expected: `clean`. If anything matches, stop and reconcile — runtime deps must be added to `dependencies` below.

- [ ] **Step 13.2: Write `package.json`**

```json
{
  "name": "@orochi235/weasel",
  "version": "0.0.0",
  "description": "Domain-agnostic 2D scene graph primitives for React: viewport math, drag/resize/insert/clone interactions, layered canvas rendering.",
  "license": "MIT",
  "author": "orochi235",
  "homepage": "https://orochi235.github.io/weasel/",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/orochi235/weasel.git"
  },
  "bugs": {
    "url": "https://github.com/orochi235/weasel/issues"
  },
  "type": "module",
  "sideEffects": false,
  "engines": {
    "node": ">=20"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./move": {
      "import": "./dist/move.js",
      "types": "./dist/move.d.ts"
    },
    "./resize": {
      "import": "./dist/resize.js",
      "types": "./dist/resize.d.ts"
    },
    "./insert": {
      "import": "./dist/insert.js",
      "types": "./dist/insert.d.ts"
    },
    "./area-select": {
      "import": "./dist/area-select.js",
      "types": "./dist/area-select.d.ts"
    },
    "./clipboard": {
      "import": "./dist/clipboard.js",
      "types": "./dist/clipboard.d.ts"
    },
    "./clone": {
      "import": "./dist/clone.js",
      "types": "./dist/clone.d.ts"
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "changeset": "changeset",
    "release": "changeset publish",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^24.12.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "jsdom": "^26.1.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "tsup": "^8.3.0",
    "typescript": "~6.0.2",
    "vite": "^8.0.4",
    "vitest": "^4.1.4"
  },
  "publishConfig": {
    "access": "public"
  },
  "keywords": [
    "react",
    "canvas",
    "scene-graph",
    "drag",
    "resize",
    "viewport",
    "2d"
  ]
}
```

#### Task 14: Add TypeScript / build / test config

**Files:**
- Create: `~/src/weasel/tsconfig.json`
- Create: `~/src/weasel/tsup.config.ts`
- Create: `~/src/weasel/vitest.config.ts`
- Create: `~/src/weasel/vite.config.ts`

- [ ] **Step 14.1: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "demo"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 14.2: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    move: 'src/move.ts',
    resize: 'src/resize.ts',
    insert: 'src/insert.ts',
    'area-select': 'src/area-select.ts',
    clipboard: 'src/clipboard.ts',
    clone: 'src/clone.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  external: ['react', 'react-dom'],
});
```

- [ ] **Step 14.3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 14.4: Write `vite.config.ts` (demo dev server)**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'demo',
  base: '/weasel/',
  resolve: {
    alias: {
      '@orochi235/weasel': resolve(__dirname, 'src/index.ts'),
    },
  },
  plugins: [react()],
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
});
```

#### Task 15: GitHub Actions workflows

**Files:**
- Create: `~/src/weasel/.github/workflows/ci.yml`
- Create: `~/src/weasel/.github/workflows/release.yml`
- Create: `~/src/weasel/.github/workflows/pages.yml`

- [ ] **Step 15.1: Write `ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 15.2: Write `release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: npm run release
          version: npx changeset version
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Note: this workflow requires an `NPM_TOKEN` repo secret. Set it in GitHub Settings → Secrets and variables → Actions before merging the first changeset.

- [ ] **Step 15.3: Write `pages.yml`**

```yaml
name: Deploy demo to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx vite build --config vite.config.ts
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist-demo

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

After first push: enable GitHub Pages in repo Settings → Pages → Source: GitHub Actions.

#### Task 16: changesets config

**Files:**
- Create: `~/src/weasel/.changeset/config.json`
- Create: `~/src/weasel/.changeset/README.md`

- [ ] **Step 16.1: Write `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 16.2: Write `.changeset/README.md`**

```markdown
# Changesets

This folder is used by [changesets](https://github.com/changesets/changesets) to track package versioning.

To add a changeset: `npx changeset`. The CLI prompts for bump kind and a summary; the result lands as a Markdown file in this folder. On merge to `main`, the release workflow opens (or fast-forwards) a "Version Packages" PR.
```

#### Task 17: LICENSE

**Files:**
- Create: `~/src/weasel/LICENSE`

- [ ] **Step 17.1: Write MIT license**

```
MIT License

Copyright (c) 2026 orochi235

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

#### Task 18: `.gitignore` and `.npmignore`

**Files:**
- Create: `~/src/weasel/.gitignore`
- Create: `~/src/weasel/.npmignore`

- [ ] **Step 18.1: Write `.gitignore`**

```
node_modules
dist
dist-demo
coverage
.DS_Store
*.tsbuildinfo
.vite
.changeset/*.md
!.changeset/README.md
!.changeset/config.json
.env
.env.local
```

- [ ] **Step 18.2: Write `.npmignore`**

`package.json`'s `files` field already restricts the tarball, but we keep `.npmignore` as a belt-and-suspenders against accidental adds:

```
src
demo
docs
node_modules
.github
.changeset
*.test.ts
*.test.tsx
tsconfig.json
tsup.config.ts
vite.config.ts
vitest.config.ts
dist-demo
coverage
```

#### Task 19: Starter `README.md`

**Files:**
- Modify: `~/src/weasel/README.md` (overwrites the seed from Task 11.2)

- [ ] **Step 19.1: Write README**

```markdown
# weasel

Domain-agnostic 2D scene graph primitives for React. Viewport math, pointer-driven drag, resize, insert, clone, layered canvas rendering, and a few generic renderers — adapter-driven so you can plug your own object types in.

> Pre-1.0: the API surface (paths, groups, units-per-subobject) is still settling. Expect breaking changes between minor versions until 1.0.

## Install

```sh
npm install @orochi235/weasel react
```

`react` is a peer dependency (>=18).

## Quickstart

```tsx
import { useMoveInteraction } from '@orochi235/weasel';

// see the demo for a full working example:
// https://orochi235.github.io/weasel/
```

## Demo

Live demo: <https://orochi235.github.io/weasel/>

## Subpath imports

For tree-shaking and clarity, hook-specific helpers are scoped:

```ts
import { snapToGrid } from '@orochi235/weasel/move';
import { snapToGrid, clampMinSize } from '@orochi235/weasel/resize';
import { snapToGrid } from '@orochi235/weasel/insert';
```

## Documentation

- [Concepts](./docs/concepts.md)
- [Hooks](./docs/hooks.md)
- [Adapters](./docs/adapters.md)
- [Extending](./docs/extending.md)

## License

MIT.
```

#### Task 20: `CHANGELOG.md` initial entry

**Files:**
- Create: `~/src/weasel/CHANGELOG.md`

- [ ] **Step 20.1: Write changelog**

Replace `YYYY-MM-DD` with today's date when running:

```markdown
# @orochi235/weasel

## 0.1.0 - 2026-05-01 - Initial release

Extracted from [garden](https://github.com/orochi235/garden) (`src/canvas-kit/`) as a standalone package. No public API changes from the in-tree version.
```

(Subsequent versions are appended automatically by `changeset version`.)

#### Task 21: Codemod intra-package imports

The kit currently imports itself via the `@/canvas-kit/...` alias inside `src/`. After extraction those become relative imports.

**Files:**
- Modify: every file under `~/src/weasel/src/` that imports from `@/canvas-kit*`.

- [ ] **Step 21.1: Inventory matches**

```sh
cd ~/src/weasel
grep -rEn "from '@/canvas-kit" src/ > /tmp/weasel-alias-imports.txt
wc -l /tmp/weasel-alias-imports.txt
head /tmp/weasel-alias-imports.txt
```

- [ ] **Step 21.2: Run the codemod**

The kit barrel is at `src/index.ts`. `@/canvas-kit` → `.` relative to the importing file. We use a node script because the path depth varies.

Save as `/tmp/weasel-codemod.mjs` and run with `node /tmp/weasel-codemod.mjs ~/src/weasel/src`:

```js
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

const root = process.argv[2];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) rewrite(p);
  }
}

function rewrite(file) {
  const src = readFileSync(file, 'utf8');
  const fileDir = dirname(file);
  let out = src.replace(
    /from '@\/canvas-kit(\/[^']*)?'/g,
    (_m, sub) => {
      const target = join(root, sub ? sub.slice(1) : '');
      let rel = relative(fileDir, target).split(/[\\/]/).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      // index resolution: bare directory imports stay as-is (bundler resolves)
      return `from '${rel}'`;
    },
  );
  if (out !== src) {
    writeFileSync(file, out);
    console.log('rewrote', relative(root, file));
  }
}

walk(root);
```

```sh
node /tmp/weasel-codemod.mjs ~/src/weasel/src
```

- [ ] **Step 21.3: Verify nothing matches the old alias**

```sh
grep -rEn "from '@/canvas-kit" ~/src/weasel/src/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 21.4: Typecheck**

```sh
cd ~/src/weasel
npm install   # required so tsc finds @types/* and react
npm run typecheck
```

Expected: clean. If imports resolve to bare directory names that need `/index`, fix the script (or add explicit `/index` suffixes) and rerun.

#### Task 22: Initial install + green build

- [ ] **Step 22.1: Install and verify**

```sh
cd ~/src/weasel
npm install
npm test
npm run build
```

Expected: tests pass, `dist/` is populated with seven entries (`index.js`, `move.js`, `resize.js`, `insert.js`, `area-select.js`, `clipboard.js`, `clone.js`) plus matching `.d.ts` files and source maps.

- [ ] **Step 22.2: Spot-check tarball**

```sh
cd ~/src/weasel
npm pack --dry-run
```

Expected: tarball lists `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`. NOT `src/`, `demo/`, `docs/`, `node_modules/`, or `.github/`.

#### Task 23: Initial extraction commit

- [ ] **Step 23.1: Stage everything except `node_modules`/`dist`**

```sh
cd ~/src/weasel
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts vite.config.ts \
        .github .changeset .gitignore .npmignore LICENSE CHANGELOG.md README.md
git add src/  # picks up the codemod changes
git status
```

Expected: only `dist/`, `dist-demo/`, `node_modules/` are untracked/ignored.

- [ ] **Step 23.2: Commit**

```sh
git commit -m "chore: scaffold weasel package (extracted from garden src/canvas-kit)"
```

#### Task 24: Push to origin/main

- [ ] **Step 24.1: Push**

```sh
git push -u origin main
```

- [ ] **Step 24.2: Verify CI kicks off**

```sh
gh run list --repo orochi235/weasel --limit 5
```

Expected: at least one `CI` run queued or in progress. Wait for green. If `pages.yml` fails because Pages isn't enabled yet, enable it now (Settings → Pages → Source: GitHub Actions) and re-run the workflow.

---

### Phase 3 — First publish

#### Task 25: npm publish access setup

- [ ] **Step 25.1: Confirm 2FA settings**

```sh
npm profile get
```

If `tfa` is `auth-only` you can publish from CI with an automation token. If it's `auth-and-writes`, you must lower it to `auth-only` for CI publishes (or do the first publish locally, see Step 28 alternative). Run:

```sh
npm profile set tfa auth-only
```

- [ ] **Step 25.2: Mint an automation token**

```sh
npm token create --read-only=false
```

Copy the token. In GitHub Settings → Secrets and variables → Actions, add a new repo secret named `NPM_TOKEN` with the token value.

#### Task 26: Create the first changeset

- [ ] **Step 26.1: Run the CLI**

```sh
cd ~/src/weasel
npx changeset
```

Prompts:
- Which packages would you like to include? → `@orochi235/weasel`
- What kind of change? → `minor` (we're bumping 0.0.0 → 0.1.0)
- Summary → `Initial release. Extracted from garden src/canvas-kit; no public API changes.`

Expected: a new `.changeset/<random-name>.md` file.

- [ ] **Step 26.2: Commit the changeset**

```sh
git add .changeset/
git commit -m "chore: changeset for 0.1.0 initial release"
```

#### Task 27: Apply the version bump

- [ ] **Step 27.1: Run version**

```sh
npx changeset version
```

Expected: `package.json` version becomes `0.1.0`; `CHANGELOG.md` is updated with the changeset summary; the changeset markdown file is consumed (deleted).

- [ ] **Step 27.2: Commit**

```sh
git add package.json CHANGELOG.md .changeset/
git commit -m "chore: version 0.1.0"
git push
```

#### Task 28: Publish

- [ ] **Step 28.1: Local publish (recommended for first release)**

```sh
cd ~/src/weasel
npm run build
npm publish --access=public
```

Expected: registry confirms publish. If using 2FA `auth-and-writes` you'll be prompted for an OTP.

(Alternative: let the release workflow publish via the Version PR flow. For the first release, doing it locally is faster and surfaces token/permission problems before CI hides them.)

#### Task 29: Verify on registry

- [ ] **Step 29.1: Check registry**

```sh
npm view @orochi235/weasel@0.1.0
```

Expected: a complete package document (version, dist, files, exports). No 404.

- [ ] **Step 29.2: Smoke install in a tmp dir**

```sh
mkdir -p /tmp/weasel-smoke && cd /tmp/weasel-smoke
npm init -y > /dev/null
npm install @orochi235/weasel react react-dom
ls node_modules/@orochi235/weasel/dist/
```

Expected: `index.js`, `index.d.ts`, plus the six subpath entries.

#### Task 30: Tag and push

- [ ] **Step 30.1: Tag**

```sh
cd ~/src/weasel
git tag v0.1.0
git push origin v0.1.0
```

#### Task 31: Verify CI + Pages

- [ ] **Step 31.1: CI green**

```sh
gh run list --repo orochi235/weasel --limit 10
```

Expected: latest CI and Pages runs both succeeded.

- [ ] **Step 31.2: Demo reachable**

Open `https://orochi235.github.io/weasel/` in a browser. Expected: the demo loads. If it 404s, recheck Settings → Pages → Source is "GitHub Actions" and re-run the `pages.yml` workflow.

---

### Phase 4 — Garden transition (back in garden repo)

#### Task 32: Create the transition branch

- [ ] **Step 32.1: Branch**

```sh
cd /Users/mike/src/eric
git checkout main && git pull
git checkout -b extract-canvas-kit
```

#### Task 33: Add the package as a dependency

**Files:**
- Modify: `/Users/mike/src/eric/package.json`

- [ ] **Step 33.1: Install**

```sh
cd /Users/mike/src/eric
npm install --save-exact @orochi235/weasel@^0.1.0
```

Expected: `package.json` `dependencies` gains `"@orochi235/weasel": "^0.1.0"`. `package-lock.json` updates.

#### Task 34: Codemod garden imports

**Files:**
- Modify: every garden file currently importing `@/canvas-kit` or `@/canvas-kit/...`.

- [ ] **Step 34.1: Inventory**

```sh
cd /Users/mike/src/eric
grep -rEn "from '@/canvas-kit" src/ > /tmp/garden-canvas-kit-imports.txt
wc -l /tmp/garden-canvas-kit-imports.txt
```

- [ ] **Step 34.2: Run sed (POSIX-compatible)**

```sh
cd /Users/mike/src/eric
# subpath imports (e.g. @/canvas-kit/move) → @orochi235/weasel/move
grep -rlE "from '@/canvas-kit/" src/ | xargs sed -i '' -E "s|from '@/canvas-kit/|from '@orochi235/weasel/|g"
# bare imports (e.g. @/canvas-kit) → @orochi235/weasel
grep -rlE "from '@/canvas-kit'" src/ | xargs sed -i '' -E "s|from '@/canvas-kit'|from '@orochi235/weasel'|g"
```

- [ ] **Step 34.3: Verify**

```sh
grep -rEn "from '@/canvas-kit" src/ || echo "clean"
grep -rEn "from '@orochi235/weasel" src/ | wc -l
```

Expected: first command prints `clean`. Second prints a count matching `/tmp/garden-canvas-kit-imports.txt` line count.

#### Task 35: Remove the path alias

**Files:**
- Modify: `/Users/mike/src/eric/tsconfig.json` (and `tsconfig.app.json` / `tsconfig.node.json` if applicable)
- Modify: `/Users/mike/src/eric/vite.config.ts` (if it duplicates the alias)

- [ ] **Step 35.1: Remove from tsconfig**

Open `tsconfig.json` (and any referenced sub-configs). Delete the `paths` entry for `@/canvas-kit/*`. If `paths` becomes empty, delete the whole `paths` key. Leave the alias for `@/*` (or other entries) intact.

- [ ] **Step 35.2: Remove from vite.config**

Open `vite.config.ts`. If `resolve.alias` has an entry mapping `@/canvas-kit` (or similar) to `src/canvas-kit`, delete it.

- [ ] **Step 35.3: Verify aliases match across configs**

```sh
grep -nE "canvas-kit" tsconfig*.json vite.config.ts || echo "clean"
```

Expected: `clean`.

#### Task 36: Delete the in-tree directories

- [ ] **Step 36.1: Remove**

```sh
cd /Users/mike/src/eric
git rm -rf src/canvas-kit src/canvas-kit-demo docs/canvas-kit
```

#### Task 37: Update vite.config for demo entry

**Files:**
- Modify: `/Users/mike/src/eric/vite.config.ts`

- [ ] **Step 37.1: Find any demo-only entry**

```sh
grep -nE "canvas-kit-demo|CanvasKitDemo" /Users/mike/src/eric/vite.config.ts /Users/mike/src/eric/index.html /Users/mike/src/eric/src/**/*.tsx 2>/dev/null || echo "clean"
```

- [ ] **Step 37.2: Remove or repoint**

If `vite.config.ts` declares an extra rollup input pointing at `src/canvas-kit-demo/...`, delete the input. If garden's `index.html` or app entry references `CanvasKitDemo`, delete that route/import. The demo lives in the new repo now.

#### Task 38: Run garden's full suite

- [ ] **Step 38.1: Test + build**

```sh
cd /Users/mike/src/eric
npm test
npm run build
```

Expected: green. If failures point at missing exports from `@orochi235/weasel`, the package's `exports` map is missing something; add the entry to weasel's `package.json` and `tsup.config.ts`, publish a `0.1.1`, bump garden's dep, and rerun.

#### Task 39: Commit garden changes

- [ ] **Step 39.1: Stage**

```sh
cd /Users/mike/src/eric
git add package.json package-lock.json tsconfig*.json vite.config.ts src/
git status
```

- [ ] **Step 39.2: Commit**

```sh
git commit -m "refactor: consume canvas-kit as @orochi235/weasel package"
```

#### Task 40: PR + merge

- [ ] **Step 40.1: Push and open PR**

```sh
git push -u origin extract-canvas-kit
gh pr create --title "refactor: consume canvas-kit as @orochi235/weasel" --body "$(cat <<'EOF'
## Summary
- Replaces in-tree `src/canvas-kit/`, `src/canvas-kit-demo/`, `docs/canvas-kit/` with a dependency on `@orochi235/weasel@^0.1.0`.
- Removes the `@/canvas-kit/*` path alias from tsconfig and vite config.
- All garden imports rewritten via codemod.

## Test plan
- [x] `npm test` passes
- [x] `npm run build` passes
- [ ] Reviewer spot-checks a kit-heavy view (e.g. drag-lab, seed-starting) in dev to confirm runtime parity
EOF
)"
```

- [ ] **Step 40.2: Merge after CI is green**

Use squash merge to keep main history linear.

---

### Phase 5 — Post-extraction housekeeping

#### Task 41: Update garden's CLAUDE.md / README

**Files:**
- Modify: `/Users/mike/src/eric/CLAUDE.md` (if present)
- Modify: `/Users/mike/src/eric/README.md` (if it mentions canvas-kit)

- [ ] **Step 41.1: Add a pointer**

Find sections that describe canvas-kit as in-tree. Replace with a short note:

```markdown
## canvas-kit / weasel

The 2D scene-graph primitives (drag, resize, insert, clone, viewport math, layered rendering) live in a separate repo: <https://github.com/orochi235/weasel>, published as `@orochi235/weasel`. For kit-related changes, work in that repo and bump garden's dependency.
```

#### Task 42: Document the local-dev flow

**Files:**
- Modify: `/Users/mike/src/eric/CLAUDE.md` (or a new `docs/contributing.md` if no CLAUDE.md)

- [ ] **Step 42.1: Add the file:../ flow**

```markdown
### Active kit development

When iterating on weasel and garden together:

1. Clone weasel next to garden: `~/src/weasel`.
2. In garden's `package.json`, temporarily change the dep to `"@orochi235/weasel": "file:../weasel"`.
3. `npm install` in garden.
4. In weasel, run `npm run build -- --watch` (or just `npm run build` after each change). Garden picks up the new `dist/` because the file: dep is symlinked.
5. When done, change garden's dep back to a real version (`^0.1.x`) and `npm install` again.

For a one-shot test of an unpublished version: `cd ~/src/weasel && npm pack`, then `cd ~/src/eric && npm install ../weasel/orochi235-weasel-X.Y.Z.tgz`.
```

#### Task 43: Mark extraction complete

**Files:**
- Modify: `/Users/mike/src/eric/docs/TODO.md`

- [ ] **Step 43.1: Add an entry**

Append (or update an existing canvas-kit extraction line) to `docs/TODO.md`:

```markdown
- [x] Extract canvas-kit to standalone repo. Published as `@orochi235/weasel@0.1.0` on 2026-05-01. Repo: <https://github.com/orochi235/weasel>.
```

- [ ] **Step 43.2: Commit on garden's main**

```sh
cd /Users/mike/src/eric
git checkout main && git pull
git add CLAUDE.md README.md docs/TODO.md
git commit -m "docs(garden): point at @orochi235/weasel for kit work; mark extraction complete"
git push
```

---

## Self-review

- **Step coverage:** every step has either a code block, a shell command with expected output, or a precise human action. No "configure appropriately" / "as needed" / "TBD" language.
- **`package.json` exports vs `tsup.config.ts` entries:** both list `index, move, resize, insert, area-select, clipboard, clone` — seven entries, matching.
- **Node version:** `package.json` `engines.node` is `>=20`; CI matrix uses `20` and `22`; release workflow uses `20`. Consistent.
- **Type / file references:** `extract/kit`, `extract/demo`, `extract/docs` branch names used consistently in Tasks 7–11. `~/src/weasel` used consistently in Phases 2–3. `/Users/mike/src/eric` used consistently for garden in Phases 0, 4, 5.
- **Codemod direction:** Task 21 rewrites `@/canvas-kit` → relative inside the new repo. Task 34 rewrites `@/canvas-kit` → `@orochi235/weasel` inside garden. The two scripts target different repos and run at different phases — no overlap.
- **Subtree-split caveat:** Task 8 surfaces path-prefix issues; Task 9.2 documents the filter-repo fallback so a worker who hits weirdness has a clear next step instead of improvising.
