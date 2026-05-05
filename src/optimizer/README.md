# Garden Bed Layout Optimizer

A MILP-based bed layout optimizer for raised beds.

This module is **designed for extraction** to a standalone npm package. It MUST NOT
import from outside this directory; the only allowed dependencies are npm packages
(`highs`) and other files inside `src/optimizer/`.

## Usage

```ts
import { runOptimizer, DEFAULT_WEIGHTS } from './optimizer';

const handle = runOptimizer({
  bed: { widthIn: 48, heightIn: 96, trellisEdge: 'N', edgeClearanceIn: 0 },
  plants: [...],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  companions: { pairs: {} },
  userRegions: [],
  timeLimitSec: 5,
  mipGap: 0.01,
  candidateCount: 3,
  diversityThreshold: 3,
});

handle.promise.then((result) => {
  for (const candidate of result.candidates) {
    console.log(candidate.score, candidate.placements);
  }
});
```

## Boundary check

`./scripts/check-optimizer-boundary.sh` (run in CI) fails the build if any file
inside `src/optimizer/` imports from outside the directory.
