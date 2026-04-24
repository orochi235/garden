# Markdown Label Renderer

Canvas label text renderer supporting a minimal markdown subset with word-wrapping.

## Syntax

| Syntax | Effect |
|--------|--------|
| `*text*` | Italic |
| `**text**` | Bold |
| `***text***` | Bold italic |
| `[text]` | Increase font size by 2px (nestable) |
| `(text)` | Decrease font size by 2px (nestable) |
| `\n` | Line break |
| `\*`, `\[`, `\]`, `\(`, `\)`, `\\` | Literal character |

Size modifiers nest: `[big [bigger]]` = +2, then +4. `(small (smaller))` = -2, then -4.

## Architecture

Three layers, all in `src/canvas/markdownText.ts`:

### 1. Parser — `parseMarkdownRuns(text: string): StyledRun[]`

Pure function. No canvas dependency. Scans the input string character by character, tracking bold/italic toggle state and a sizeOffset counter.

```ts
interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  sizeOffset: number;
}
```

- `*` toggles italic, `**` toggles bold, `***` toggles both.
- `[` pushes sizeOffset +2, `]` pops -2.
- `(` pushes sizeOffset -2, `)` pops +2.
- `\n` emits a run with `text: '\n'`.
- `\` before `*`, `[`, `]`, `(`, `)`, or `\` emits the literal character.
- Consecutive text characters with the same style are coalesced into one run.

### 2. Layout — `layoutMarkdown(runs, maxWidth, fontSize, measure): LayoutResult`

Takes parsed runs and produces positioned output for rendering.

```ts
type MeasureFn = (text: string, fontSize: number, bold: boolean, italic: boolean) => number;

interface PositionedRun extends StyledRun {
  x: number;
}

interface LayoutLine {
  runs: PositionedRun[];
  width: number;
  height: number;
}

interface LayoutResult {
  lines: LayoutLine[];
  width: number;   // widest line
  height: number;  // sum of line heights
}
```

- `measure` is injected so tests can provide a mock without needing a canvas context.
- Line height for each line = `max(effectiveFontSize of each run) * 1.3`, rounded.
- Word wrapping: splits at space boundaries. When a run's text exceeds remaining width, break at the last space that fits. If a single word exceeds maxWidth, it renders on its own line (no mid-word break).
- `\n` runs force a new line unconditionally.
- When `maxWidth` is `Infinity` or not provided, no wrapping occurs (single-line unless `\n` is present).

### 3. Renderer — `createMarkdownRenderer(fontSize, maxWidth?): { renderer: TextRenderer; measure: MeasureFn }`

Factory that returns:
- A `TextRenderer` callback compatible with `renderLabel`'s `renderText` option.
- A `measure` function bound to the canvas context, for pre-measuring label dimensions.

The renderer draws each positioned run with:
- `ctx.font` set to the effective style (`bold`, `italic`, size).
- `ctx.fillStyle = '#FFFFFF'` for normal/bold runs.
- `ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'` for italic-only runs.
- Bold-italic runs use white.

### Integration with `renderLabel`

Callers that want markdown labels:
1. Call `parseMarkdownRuns(text)` to get runs.
2. Call `layoutMarkdown(runs, maxWidth, fontSize, measure)` to get dimensions.
3. Pass `layout.width` and `layout.height` as size overrides, and the renderer as `renderText`, to `renderLabel`.

The plant label code in `renderPlantings.ts` replaces its hand-rolled `plantTextRenderer` with this system. Label strings become: `"[**Tomato**]\n(*Black Krim*)"`.

## Files

- `src/canvas/markdownText.ts` — parser, layout, renderer factory
- `src/canvas/markdownText.test.ts` — unit tests for parser and layout

## Not in scope

- Headings, lists, links, code spans, images
- Color changes within labels
- Paragraph spacing (double newline = same as single newline)
- Right-to-left text
