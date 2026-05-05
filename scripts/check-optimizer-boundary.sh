#!/usr/bin/env bash
# Fails if any file in src/optimizer/ imports from outside the directory.
set -e
violations=$(git grep -nE "from '\.\./\.\./" -- 'src/optimizer/**/*.ts' 'src/optimizer/**/*.tsx' || true)
if [ -n "$violations" ]; then
  echo "Optimizer extraction-boundary violations:"
  echo "$violations"
  exit 1
fi
echo "Optimizer boundary clean."
