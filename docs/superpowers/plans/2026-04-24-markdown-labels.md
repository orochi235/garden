# Markdown Label Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal markdown parser, layout engine, and canvas renderer so label strings can use `*bold*`, `*italic*`, `[bigger]`, `(smaller)`, and `\n` with word-wrapping.

**Architecture:** Three pure layers — parser (string → styled runs), layout (runs → positioned lines), renderer (lines → canvas draws). Parser and layout are canvas-independent and fully unit-testable. A factory function produces a `TextRenderer` compatible with the existing `renderLabel` system.

**Tech Stack:** TypeScript, vitest, Canvas 2D API

---

### Task 1: Parser — types and basic bold/italic

**Files:**
- Create: `src/canvas/markdownText.ts`
- Create: `src/canvas/markdownText.test.ts`

- [ ] **Step 1: Write failing tests for plain text and bold**

```ts
// src/canvas/markdownText.test.ts
import { describe, it, expect } from 'vitest';
import { parseMarkdownRuns } from './markdownText';

describe('parseMarkdownRuns', () => {
  it('parses plain text as a single run', () => {
    expect(parseMarkdownRuns('hello')).toEqual([
      { text: 'hello', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('parses **bold**', () => {
    expect(parseMarkdownRuns('**bold**')).toEqual([
      { text: 'bold', bold: true, italic: false, sizeOffset: 0 },
    ]);
  });

  it('parses *italic*', () => {
    expect(parseMarkdownRuns('*italic*')).toEqual([
      { text: 'italic', bold: false, italic: true, sizeOffset: 0 },
    ]);
  });

  it('parses ***bold italic***', () => {
    expect(parseMarkdownRuns('***both***')).toEqual([
      { text: 'both', bold: true, italic: true, sizeOffset: 0 },
    ]);
  });

  it('parses mixed inline styles', () => {
    expect(parseMarkdownRuns('a **b** c')).toEqual([
      { text: 'a ', bold: false, italic: false, sizeOffset: 0 },
      { text: 'b', bold: true, italic: false, sizeOffset: 0 },
      { text: ' c', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('parses bold with italic inside', () => {
    expect(parseMarkdownRuns('**a *b* c**')).toEqual([
      { text: 'a ', bold: true, italic: false, sizeOffset: 0 },
      { text: 'b', bold: true, italic: true, sizeOffset: 0 },
      { text: ' c', bold: true, italic: false, sizeOffset: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement types and parser for bold/italic**

```ts
// src/canvas/markdownText.ts
export interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  sizeOffset: number;
}

export function parseMarkdownRuns(input: string): StyledRun[] {
  const runs: StyledRun[] = [];
  let bold = false;
  let italic = false;
  let sizeOffset = 0;
  let buf = '';
  let i = 0;

  function flush() {
    if (buf.length > 0) {
      runs.push({ text: buf, bold, italic, sizeOffset });
      buf = '';
    }
  }

  while (i < input.length) {
    const ch = input[i];

    if (ch === '*') {
      // Count consecutive asterisks
      let count = 0;
      while (i + count < input.length && input[i + count] === '*') count++;
      flush();
      if (count >= 3) {
        bold = !bold;
        italic = !italic;
        i += 3;
      } else if (count === 2) {
        bold = !bold;
        i += 2;
      } else {
        italic = !italic;
        i += 1;
      }
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return runs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/markdownText.ts src/canvas/markdownText.test.ts
git commit -m "feat: add markdown label parser with bold/italic support"
```

---

### Task 2: Parser — newlines, size modifiers, escaping

**Files:**
- Modify: `src/canvas/markdownText.ts`
- Modify: `src/canvas/markdownText.test.ts`

- [ ] **Step 1: Write failing tests for newlines, size, and escaping**

Add to the `parseMarkdownRuns` describe block in `src/canvas/markdownText.test.ts`:

```ts
  it('parses newlines as separate runs', () => {
    expect(parseMarkdownRuns('a\nb')).toEqual([
      { text: 'a', bold: false, italic: false, sizeOffset: 0 },
      { text: '\n', bold: false, italic: false, sizeOffset: 0 },
      { text: 'b', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('parses [bigger] size modifier', () => {
    expect(parseMarkdownRuns('[big]')).toEqual([
      { text: 'big', bold: false, italic: false, sizeOffset: 2 },
    ]);
  });

  it('parses (smaller) size modifier', () => {
    expect(parseMarkdownRuns('(small)')).toEqual([
      { text: 'small', bold: false, italic: false, sizeOffset: -2 },
    ]);
  });

  it('nests size modifiers', () => {
    expect(parseMarkdownRuns('[a [b] c]')).toEqual([
      { text: 'a ', bold: false, italic: false, sizeOffset: 2 },
      { text: 'b', bold: false, italic: false, sizeOffset: 4 },
      { text: ' c', bold: false, italic: false, sizeOffset: 2 },
    ]);
  });

  it('escapes special characters with backslash', () => {
    expect(parseMarkdownRuns('\\*not italic\\*')).toEqual([
      { text: '*not italic*', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('escapes brackets and parens', () => {
    expect(parseMarkdownRuns('\\[not big\\]')).toEqual([
      { text: '[not big]', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('escapes backslash itself', () => {
    expect(parseMarkdownRuns('a\\\\b')).toEqual([
      { text: 'a\\b', bold: false, italic: false, sizeOffset: 0 },
    ]);
  });

  it('combines styles with size', () => {
    expect(parseMarkdownRuns('[**Tomato**]')).toEqual([
      { text: 'Tomato', bold: true, italic: false, sizeOffset: 2 },
    ]);
  });

  it('handles plant label pattern', () => {
    expect(parseMarkdownRuns('[**Tomato**]\n(*Black Krim*)')).toEqual([
      { text: 'Tomato', bold: true, italic: false, sizeOffset: 2 },
      { text: '\n', bold: false, italic: false, sizeOffset: 0 },
      { text: 'Black Krim', bold: false, italic: true, sizeOffset: -2 },
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(parseMarkdownRuns('')).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: new tests FAIL (newlines, brackets, parens, escaping not handled)

- [ ] **Step 3: Add newline, size modifier, and escape handling to parser**

Replace the parser's `while` loop body in `src/canvas/markdownText.ts`:

```ts
  while (i < input.length) {
    const ch = input[i];

    // Backslash escape
    if (ch === '\\' && i + 1 < input.length && '*[]()\\'.includes(input[i + 1])) {
      buf += input[i + 1];
      i += 2;
      continue;
    }

    // Asterisks toggle bold/italic
    if (ch === '*') {
      let count = 0;
      while (i + count < input.length && input[i + count] === '*') count++;
      flush();
      if (count >= 3) {
        bold = !bold;
        italic = !italic;
        i += 3;
      } else if (count === 2) {
        bold = !bold;
        i += 2;
      } else {
        italic = !italic;
        i += 1;
      }
      continue;
    }

    // Size modifiers
    if (ch === '[') {
      flush();
      sizeOffset += 2;
      i++;
      continue;
    }
    if (ch === ']') {
      flush();
      sizeOffset -= 2;
      i++;
      continue;
    }
    if (ch === '(') {
      flush();
      sizeOffset -= 2;
      i++;
      continue;
    }
    if (ch === ')') {
      flush();
      sizeOffset += 2;
      i++;
      continue;
    }

    // Newline
    if (ch === '\n') {
      flush();
      runs.push({ text: '\n', bold: false, italic: false, sizeOffset: 0 });
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/markdownText.ts src/canvas/markdownText.test.ts
git commit -m "feat: add newlines, size modifiers, and escaping to markdown parser"
```

---

### Task 3: Layout engine

**Files:**
- Modify: `src/canvas/markdownText.ts`
- Modify: `src/canvas/markdownText.test.ts`

- [ ] **Step 1: Write failing tests for layout**

Add a new describe block in `src/canvas/markdownText.test.ts`:

```ts
import { parseMarkdownRuns, layoutMarkdown } from './markdownText';

// Mock measure: each character = 10px wide, regardless of style
const mockMeasure = (text: string) => text.length * 10;

describe('layoutMarkdown', () => {
  it('lays out plain text on one line', () => {
    const runs = parseMarkdownRuns('hello');
    const result = layoutMarkdown(runs, Infinity, 13, mockMeasure);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].runs).toHaveLength(1);
    expect(result.lines[0].runs[0].x).toBe(0);
    expect(result.lines[0].runs[0].text).toBe('hello');
    expect(result.width).toBe(50);
  });

  it('breaks on newline', () => {
    const runs = parseMarkdownRuns('a\nb');
    const result = layoutMarkdown(runs, Infinity, 13, mockMeasure);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].runs[0].text).toBe('a');
    expect(result.lines[1].runs[0].text).toBe('b');
    expect(result.lines[1].runs[0].x).toBe(0);
  });

  it('wraps at maxWidth on space boundary', () => {
    const runs = parseMarkdownRuns('aaa bbb ccc');
    // maxWidth=75 fits "aaa bbb" (70px) but not "aaa bbb ccc" (110px)
    const result = layoutMarkdown(runs, 75, 13, mockMeasure);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].runs[0].text).toBe('aaa bbb');
    expect(result.lines[1].runs[0].text).toBe('ccc');
  });

  it('puts oversized word on its own line', () => {
    const runs = parseMarkdownRuns('hi superlongword');
    // maxWidth=80 fits "hi" but "superlongword" (130px) exceeds it
    const result = layoutMarkdown(runs, 80, 13, mockMeasure);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].runs[0].text).toBe('hi');
    expect(result.lines[1].runs[0].text).toBe('superlongword');
  });

  it('positions multiple styled runs on same line', () => {
    const runs = parseMarkdownRuns('a **b** c');
    const result = layoutMarkdown(runs, Infinity, 13, mockMeasure);
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0].runs;
    expect(line[0]).toMatchObject({ text: 'a ', x: 0 });
    expect(line[1]).toMatchObject({ text: 'b', x: 20, bold: true });
    expect(line[2]).toMatchObject({ text: ' c', x: 30 });
  });

  it('computes height from line heights', () => {
    const runs = parseMarkdownRuns('a\nb');
    const result = layoutMarkdown(runs, Infinity, 10, mockMeasure);
    // lineHeight = Math.round(10 * 1.3) = 13, two lines = 26
    expect(result.height).toBe(26);
  });

  it('uses sizeOffset for line height calculation', () => {
    const runs = parseMarkdownRuns('[big]\n(small)');
    const result = layoutMarkdown(runs, Infinity, 10, mockMeasure);
    // line 1: fontSize 10+2=12, lineHeight = round(12*1.3) = 16
    // line 2: fontSize 10-2=8, lineHeight = round(8*1.3) = 10
    expect(result.lines[0].height).toBe(16);
    expect(result.lines[1].height).toBe(10);
    expect(result.height).toBe(26);
  });

  it('returns zero dimensions for empty input', () => {
    const result = layoutMarkdown([], Infinity, 13, mockMeasure);
    expect(result.lines).toHaveLength(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: FAIL — `layoutMarkdown` not exported

- [ ] **Step 3: Implement layout engine**

Add to `src/canvas/markdownText.ts`:

```ts
export type MeasureFn = (text: string, fontSize: number, bold: boolean, italic: boolean) => number;

export interface PositionedRun extends StyledRun {
  x: number;
}

export interface LayoutLine {
  runs: PositionedRun[];
  width: number;
  height: number;
}

export interface LayoutResult {
  lines: LayoutLine[];
  width: number;
  height: number;
}

export function layoutMarkdown(
  runs: StyledRun[],
  maxWidth: number,
  fontSize: number,
  measure: MeasureFn,
): LayoutResult {
  if (runs.length === 0) return { lines: [], width: 0, height: 0 };

  const lines: LayoutLine[] = [];
  let currentRuns: PositionedRun[] = [];
  let lineX = 0;
  let lineMaxSize = fontSize;

  function commitLine() {
    const lineHeight = Math.round(lineMaxSize * 1.3);
    lines.push({ runs: currentRuns, width: lineX, height: lineHeight });
    currentRuns = [];
    lineX = 0;
    lineMaxSize = fontSize;
  }

  for (const run of runs) {
    if (run.text === '\n') {
      if (currentRuns.length === 0) lineMaxSize = fontSize;
      commitLine();
      continue;
    }

    const effectiveSize = fontSize + run.sizeOffset;
    lineMaxSize = Math.max(lineMaxSize, effectiveSize);

    if (maxWidth === Infinity) {
      const w = measure(run.text, effectiveSize, run.bold, run.italic);
      currentRuns.push({ ...run, x: lineX });
      lineX += w;
      continue;
    }

    // Word-wrap: split run text by spaces
    const words = run.text.split(/ /);
    let wordBuf = '';

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const candidate = wordBuf.length > 0 ? wordBuf + ' ' + word : word;
      const candidateW = measure(candidate, effectiveSize, run.bold, run.italic);

      if (lineX + candidateW > maxWidth && lineX > 0) {
        // Flush current wordBuf as a run on the current line
        if (wordBuf.length > 0) {
          const w = measure(wordBuf, effectiveSize, run.bold, run.italic);
          currentRuns.push({ ...run, text: wordBuf, x: lineX });
          lineX += w;
        }
        commitLine();
        lineMaxSize = Math.max(lineMaxSize, effectiveSize);
        wordBuf = word;
      } else if (lineX === 0 && candidateW > maxWidth && wordBuf.length === 0) {
        // Single word exceeds maxWidth — put it on its own line
        wordBuf = word;
      } else {
        wordBuf = candidate;
      }
    }

    // Flush remaining wordBuf
    if (wordBuf.length > 0) {
      const w = measure(wordBuf, effectiveSize, run.bold, run.italic);
      currentRuns.push({ ...run, text: wordBuf, x: lineX });
      lineX += w;
    }
  }

  // Commit final line
  if (currentRuns.length > 0) {
    commitLine();
  }

  const width = Math.max(...lines.map((l) => l.width));
  const height = lines.reduce((sum, l) => sum + l.height, 0);
  return { lines, width, height };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/canvas/markdownText.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/markdownText.ts src/canvas/markdownText.test.ts
git commit -m "feat: add markdown layout engine with word wrapping"
```

---

### Task 4: Canvas renderer factory

**Files:**
- Modify: `src/canvas/markdownText.ts`

- [ ] **Step 1: Implement `createMarkdownRenderer`**

Add to `src/canvas/markdownText.ts`:

```ts
import type { TextRenderer } from './renderLabel';

function buildFont(fontSize: number, bold: boolean, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push('italic');
  if (bold) parts.push('bold');
  parts.push(`${fontSize}px sans-serif`);
  return parts.join(' ');
}

function canvasMeasure(ctx: CanvasRenderingContext2D): MeasureFn {
  return (text, fontSize, bold, italic) => {
    ctx.font = buildFont(fontSize, bold, italic);
    return ctx.measureText(text).width;
  };
}

export function createMarkdownRenderer(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxWidth: number = Infinity,
): { renderer: TextRenderer; width: number; height: number } {
  const measure = canvasMeasure(ctx);
  const parsed = parseMarkdownRuns(text);
  const layout = layoutMarkdown(parsed, maxWidth, fontSize, measure);

  const renderer: TextRenderer = (_ctx, _text, x, y) => {
    let lineY = y;
    for (const line of layout.lines) {
      for (const run of line.runs) {
        const effSize = fontSize + run.sizeOffset;
        _ctx.font = buildFont(effSize, run.bold, run.italic);
        _ctx.fillStyle = run.italic && !run.bold ? 'rgba(255, 255, 255, 0.7)' : '#FFFFFF';
        _ctx.fillText(run.text, x + run.x, lineY);
      }
      lineY += line.height;
    }
  };

  return { renderer, width: layout.width, height: layout.height };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/canvas/markdownText.ts
git commit -m "feat: add markdown canvas renderer factory"
```

---

### Task 5: Integrate into plant labels

**Files:**
- Modify: `src/canvas/renderPlantings.ts`

- [ ] **Step 1: Replace hand-rolled plant label renderer**

In `src/canvas/renderPlantings.ts`, replace the import of `TextRenderer`:

```ts
// Remove: import type { TextRenderer } from './renderLabel';
// Add:
import { createMarkdownRenderer } from './markdownText';
```

Replace the label candidate block (the `if ((showLabel || highlightOpacity > 0) && cultivar)` block) with:

```ts
    if ((showLabel || highlightOpacity > 0) && cultivar) {
      const species = getSpecies(cultivar.speciesId);
      const speciesName = species?.name ?? cultivar.name;
      const variety = cultivar.variety;
      const mdText = variety
        ? `[**${speciesName}**]\n(*${variety}*)`
        : `**${speciesName}**`;

      const { renderer: plantTextRenderer, width: labelW, height: labelH } =
        createMarkdownRenderer(ctx, mdText, 13);

      const labelY = sy + radius + 8;
      labelCandidates.push({
        text: mdText,
        rect: { x: sx - labelW / 2, y: labelY, w: labelW, h: labelH },
        selected: selectedIds.includes(p.id),
        renderText: (c, _text, tx, ty) => {
          c.textAlign = 'center';
          // Shift runs so they render centered around tx
          plantTextRenderer(c, _text, tx - labelW / 2, ty);
        },
      });
    }
```

Also update the `labelCandidates` type to remove the now-unused `TextRenderer` import dependency — the `renderText` property type is already inferred from `renderLabel.ts`.

- [ ] **Step 2: Remove unused imports**

Remove `import { getSpecies } from '../model/species'` only if it was used solely for the old code — but it's still used in the new code, so keep it. Remove `import type { TextRenderer } from './renderLabel'` if no longer used elsewhere in the file.

- [ ] **Step 3: Verify build and visual check**

Run: `npx tsc --noEmit`
Expected: no errors

Visually verify in the browser that plant labels render with bold species name and italic variety, matching the previous appearance.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/renderPlantings.ts
git commit -m "feat: use markdown renderer for plant labels"
```

---

### Task 6: Remove dead code, final cleanup

**Files:**
- Modify: `src/canvas/renderPlantings.ts`

- [ ] **Step 1: Clean up unused code**

Remove the `ctx.font = 'bold 13px sans-serif'` / `ctx.font = 'italic 11px sans-serif'` measurement block that preceded the old `plantTextRenderer` closure — this is now handled inside `createMarkdownRenderer`.

Verify the `labelCandidates` type no longer needs an explicit `TextRenderer` import.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add src/canvas/renderPlantings.ts
git commit -m "refactor: remove hand-rolled plant label renderer"
```
