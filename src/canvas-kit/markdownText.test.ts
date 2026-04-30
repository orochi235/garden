import { describe, it, expect } from 'vitest';
import { createMarkdownRenderer, parseMarkdownRuns, layoutMarkdown } from './markdownText';

function makeMockCtx() {
  const fillCalls: Array<{ text: string; font: string; fillStyle: string }> = [];
  const strokeCalls: Array<{ text: string; font: string; strokeStyle: string }> = [];
  const ctx: {
    font: string;
    fillStyle: string;
    strokeStyle: string;
    measureText: (text: string) => { width: number };
    fillText: (text: string) => void;
    strokeText: (text: string) => void;
  } = {
    font: '',
    fillStyle: '#000',
    strokeStyle: '#000',
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText(text: string) { fillCalls.push({ text, font: ctx.font, fillStyle: ctx.fillStyle }); },
    strokeText(text: string) { strokeCalls.push({ text, font: ctx.font, strokeStyle: ctx.strokeStyle }); },
  };
  const typedCtx = ctx as unknown as CanvasRenderingContext2D & {
    fillText: (text: string) => void;
    strokeText: (text: string) => void;
  };
  return { ctx: typedCtx, fillCalls, strokeCalls };
}

// Mock measure: each character = 10px wide, regardless of style
const mockMeasure = (text: string) => text.length * 10;

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
});

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

describe('createMarkdownRenderer', () => {
  it('uses sans-serif by default', () => {
    const { ctx, fillCalls } = makeMockCtx();
    const r = createMarkdownRenderer(ctx, 'hello', 13);
    r.renderer(ctx, 'hello', 0, 0);
    expect(fillCalls[0].font).toContain('sans-serif');
  });

  it('honors custom family option', () => {
    const { ctx, fillCalls } = makeMockCtx();
    const r = createMarkdownRenderer(ctx, 'hi', 13, Infinity, {
      family: '"Iowan Old Style", Georgia, serif',
    });
    r.renderer(ctx, 'hi', 0, 0);
    expect(fillCalls[0].font).toContain('"Iowan Old Style"');
  });

  it('applies non-bold weight to plain runs and bold for **bold** runs', () => {
    const { ctx, fillCalls } = makeMockCtx();
    const r = createMarkdownRenderer(ctx, 'a **b** c', 13, Infinity, { weight: 600 });
    r.renderer(ctx, 'a **b** c', 0, 0);
    const aFont = fillCalls.find((c) => c.text === 'a ')!.font;
    const bFont = fillCalls.find((c) => c.text === 'b')!.font;
    expect(aFont).toContain('600');
    expect(bFont).toContain('bold');
  });

  it('strokeRenderer calls strokeText with the same layout', () => {
    const { ctx, fillCalls, strokeCalls } = makeMockCtx();
    const r = createMarkdownRenderer(ctx, '*hi*', 13);
    r.renderer(ctx, '*hi*', 0, 0);
    r.strokeRenderer(ctx, '*hi*', 0, 0);
    expect(strokeCalls.map((c) => c.text)).toEqual(fillCalls.map((c) => c.text));
    expect(strokeCalls).toHaveLength(1);
  });
});
