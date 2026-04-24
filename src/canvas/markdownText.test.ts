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
