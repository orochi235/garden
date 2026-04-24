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
