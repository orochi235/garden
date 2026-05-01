# canvas-kit Extraction → `@orochi235/weasel`

**Goal:** Extract `src/canvas-kit/`, `src/canvas-kit-demo/`, and `docs/canvas-kit/` from the garden monorepo into a standalone public npm package `@orochi235/weasel`, hosted in its own GitHub repository.

**Naming note:** "canvas-kit" is the in-tree working name; the published package and new repo are both **weasel**. Within this spec, "canvas-kit" refers to the existing in-tree directories and "weasel" refers to the post-extraction package and repo.

**Why:** The kit is already adapter-driven and free of garden imports (verified via grep — only `react`, `vitest`, `@testing-library/react`, and self-references via `@/canvas-kit` path alias). It has its own demo, its own docs, its own test suite, and a clear external API surface. Bundling it inside the garden repo couples release cadence and discoverability to a project that doesn't need it. Public release also forces the API hygiene that makes the kit easier to evolve.

---

## Decisions (locked)

- **Package name:** `@orochi235/weasel`. Reads as "wonder easel" — etch-a-sketch-adjacent ("Wonder Easel" sounds like a vintage drawing toy) with arguable allusion to "one-eyed wonder weasel" left as plausibly-deniable garnish. Unique on npm, no trademark adjacency.
- **Logo treatment:** the `o` in "wonder" is rendered as an eye (single-eye motif ties the wordmark to the second reading).
- **License:** MIT.
- **Repo name:** `weasel` under `orochi235`.
- **Initial version:** `0.1.0`. Pre-1.0 while the API surface (paths, groups, text, units-per-subobject) keeps shifting.

Verify before first publish: `npm view @orochi235/weasel` returns 404 (name available) and the `orochi235` npm scope exists / is created.

---

## Architecture

**Two repositories, npm package boundary.**

```
github.com/orochi235/weasel              ← new public repo, this spec
github.com/orochi235/garden              ← existing repo, becomes a consumer
```

After extraction:
- The kit publishes to npm as `@orochi235/weasel`.
- Garden depends on it as `"@orochi235/weasel": "^0.x"` and contains zero kit source.
- During development of new kit features, garden temporarily points at a local checkout (`"file:../weasel"`) so changes can flow without a publish round-trip.

**Module format:** ESM-only. `"type": "module"` in `package.json`. CJS support is deferred unless a real consumer needs it. Tree-shakeable barrel exports.

**Build:** `tsup` (lightweight, single config, emits ESM + `.d.ts`). Output goes to `dist/`. Source stays in `src/`.

**Test runner:** Vitest, identical to today.

**Versioning + releases:** [changesets](https://github.com/changesets/changesets) for solo-maintainer-friendly changelog generation and one-command publish. GitHub Actions wires `release.yml` to `npm publish --access=public` on changeset version PR merge.

**Demo:** Stays with the kit. Lives at `demo/` in the new repo. Deployed to GitHub Pages from the same repo (`gh-pages` workflow). The demo IS the docs site.

**Docs:** Stay with the kit. Markdown-only for now under `docs/`. README at the root pitches the package and links to the demo + docs.

---

## Repo skeleton

```
weasel/
├── src/                    ← from garden's src/canvas-kit/
│   ├── index.ts            ← public barrel (already exists)
│   ├── interactions/
│   ├── ops/
│   ├── adapters/
│   ├── groups/
│   ├── hooks/
│   └── ...
├── demo/                   ← from garden's src/canvas-kit-demo/
│   ├── index.html
│   ├── main.tsx
│   └── demos/
├── docs/                   ← from garden's docs/canvas-kit/
│   ├── README.md
│   ├── concepts.md
│   ├── hooks.md
│   ├── adapters.md
│   └── extending.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── vite.config.ts          ← demo dev server only
├── .github/
│   └── workflows/
│       ├── ci.yml          ← test + build on PR
│       ├── release.yml     ← changesets publish
│       └── pages.yml       ← deploy demo to GH Pages
├── .changeset/
│   └── config.json
├── .gitignore
├── .npmignore              ← or use `files` field in package.json
├── README.md
├── CHANGELOG.md
├── LICENSE
└── tsconfig.tsbuildinfo    (gitignored)
```

**Key file responsibilities:**

- `package.json` — declares `react` as a peerDep (>=18), no runtime deps if possible. devDeps: `tsup`, `vitest`, `@testing-library/react`, `@types/react`, `typescript`, `@changesets/cli`. Scripts: `build`, `test`, `dev` (demo), `lint`, `typecheck`, `changeset`, `release`. `"files": ["dist", "README.md", "LICENSE"]` to keep the published tarball minimal.
- `tsconfig.json` — extends a standard React + ESM base. `paths` removed entirely; intra-package imports become relative. Demo gets its own `tsconfig.demo.json` if needed.
- `tsup.config.ts` — single entry (`src/index.ts`), format `["esm"]`, `dts: true`, `clean: true`, `treeshake: true`.
- `vitest.config.ts` — minimal; React testing-library setup file if not already present.
- `vite.config.ts` — for the demo only. Points at `demo/` as root.
- `.github/workflows/ci.yml` — Node 20 + 22 matrix, install, `npm run typecheck && npm test && npm run build`.
- `.github/workflows/release.yml` — changesets action; on push to main, opens or merges a "version PR"; on tag push, publishes to npm.
- `.github/workflows/pages.yml` — on push to main, builds demo, deploys to gh-pages branch.

---

## Public API surface

The barrel `src/index.ts` is already the public API. Re-audit during extraction: anything currently exported but not stable should either be (a) marked `@experimental` in JSDoc, or (b) removed from the barrel. Internal helpers that escaped into the barrel are tech debt to clean up before 1.0, not before 0.1.

**Subpath exports:** today's `@/canvas-kit/move`, `@/canvas-kit/resize`, `@/canvas-kit/insert` deep imports stay supported via `package.json` `"exports"` map:

```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./move": { "import": "./dist/move.js", "types": "./dist/move.d.ts" },
  "./resize": { "import": "./dist/resize.js", "types": "./dist/resize.d.ts" },
  "./insert": { "import": "./dist/insert.js", "types": "./dist/insert.d.ts" }
}
```

`tsup` is configured with multiple entries to produce these.

---

## History preservation

Use `git subtree split` to extract three histories from garden:

```sh
git subtree split --prefix=src/canvas-kit -b extract/kit
git subtree split --prefix=src/canvas-kit-demo -b extract/demo
git subtree split --prefix=docs/canvas-kit -b extract/docs
```

Each branch contains only commits that touched files under that prefix, with paths rewritten to be repo-root-relative. Then in the new (empty) repo:

```sh
git fetch ../garden extract/kit:kit-history
# merge into a subdir at src/, repeat for demo/ and docs/
```

Trade-off: `subtree split` produces clean per-prefix history but loses cross-prefix commits (e.g., a single commit that touched both `src/canvas-kit/` and `src/canvas-kit-demo/` becomes two commits, one in each branch). For this codebase that's acceptable — most commits are scoped to one prefix.

Alternative: `git filter-repo --path src/canvas-kit/ --path src/canvas-kit-demo/ --path docs/canvas-kit/` on a clone of garden, which preserves cross-prefix commits but requires path renames after. Filter-repo is cleaner if the user values cross-prefix commit fidelity. Flag this as a choice during execution.

---

## Garden's transition

**Phase A — local file dep (during extraction).**
1. New repo lives at `~/src/weasel` (or wherever).
2. `npm run build` in the kit produces `dist/`.
3. Garden's `package.json`: `"@orochi235/weasel": "file:../weasel"`.
4. Garden's `tsconfig.json`: remove the `@/canvas-kit/*` path alias.
5. Garden's source: imports stay as-is (`from '@/canvas-kit'` becomes `from '@orochi235/weasel'`). One-time codemod via `sed` or `grep -l | xargs sed`.
6. Delete `src/canvas-kit/`, `src/canvas-kit-demo/`, `docs/canvas-kit/` from garden in the same commit.
7. `npm install` + `npm test` in garden — confirm everything still works.

**Phase B — published package.**
1. Publish `0.1.0` from the new repo (changeset release flow).
2. Garden's `package.json`: switch `"file:../weasel"` → `"@orochi235/weasel": "^0.1.0"`.
3. Commit + push.

Garden's local-dev experience after Phase B: change something in weasel, run `npm publish` (or `npm pack` + `npm install ../weasel-X.Y.Z.tgz` for a quick test), garden picks up the new version. Or revert temporarily to `file:../weasel` for active dev.

---

## Pre-extraction checklist

Things to verify or fix before the cut, separately from the move:

- [x] **Import audit.** No imports from garden code into the kit. (Verified 2026-05-01: only `react`, `vitest`, `@testing-library/react`, and self-references.)
- [ ] **Test coverage gap pass.** Currently in flight (TODO Tier 1.5). Better to publish with thorough coverage.
- [ ] **TODO marker scan.** Search `src/canvas-kit/` for `TODO`, `FIXME`, `HACK` — note any that should block 0.1.0.
- [ ] **README first draft.** Write the public-facing pitch in garden first (in the spec or scratch file), then ship it with the new repo.
- [ ] **Demo polish.** Confirm all demo entries work standalone (no garden state, no garden css). Already true today, but worth a manual check.
- [ ] **Subpath export inventory.** Enumerate which deep imports the kit's own demo + tests rely on. They become the published `exports` map.
- [ ] **JSDoc pass on barrel.** Each top-level export gets a one-line description. The kit already has solid inline comments; surface them at the export site.

---

## Out of scope for this extraction

- Renaming the package post-1.0.
- Adding new public APIs (paths, text, sibling z-order, etc.). Those are separate Tier 1 items.
- Switching from React to a framework-agnostic core. The kit is React-coupled today; that's a future architectural decision.
- Building a docs site beyond the demo + Markdown. A `mkdocs` / `vitepress` site can come later.

---

## Risks

- **Subtree split path rewriting** can be fiddly if the prefix has been moved historically. Mitigation: validate the extracted branch's commits compile + test pass before pushing to the new repo.
- **Path-alias removal** in garden requires a codemod across the whole codebase. Mitigation: scripted `sed` + `git diff` review + run garden's full test suite.
- **First publish under a scoped name** requires an npm account with the scope created. Set this up before execution, not during.
- **GitHub Pages on a public repo** is free; verify org-level Pages settings if `orochi235` is an org rather than a user account.
- **Discoverability:** `@orochi235/weasel` is harder to find than an unscoped name. Mitigated by good README, demo site, and tags on GitHub. Re-evaluate before 1.0.

---

## Success criteria

After execution:
- `@orochi235/weasel@0.1.0` is published to npm.
- Garden depends on it via package.json, has no `src/canvas-kit/` directory, and all garden tests pass.
- The new repo's CI is green (test + build).
- The demo site is reachable at `https://orochi235.github.io/weasel/`.
- A user can `npm install @orochi235/weasel react` in a fresh project, follow the README quickstart, and have a working drag-resize demo in 10 minutes.
