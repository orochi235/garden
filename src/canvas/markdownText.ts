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

  flush();
  return runs;
}

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
  let lineMaxSize = 0;

  function commitLine() {
    const effectiveFontSize = lineMaxSize > 0 ? lineMaxSize : fontSize;
    const lineHeight = Math.round(effectiveFontSize * 1.3);
    lines.push({ runs: currentRuns, width: lineX, height: lineHeight });
    currentRuns = [];
    lineX = 0;
    lineMaxSize = 0;
  }

  for (const run of runs) {
    if (run.text === '\n') {
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

      if (lineX + candidateW > maxWidth && (lineX > 0 || wordBuf.length > 0)) {
        // Flush current wordBuf as a run on the current line
        if (wordBuf.length > 0) {
          const w = measure(wordBuf, effectiveSize, run.bold, run.italic);
          currentRuns.push({ ...run, text: wordBuf, x: lineX });
          lineX += w;
        }
        commitLine();
        lineMaxSize = Math.max(lineMaxSize, effectiveSize);
        wordBuf = word;
      } else {
        // Either fits, or is an oversized single word starting a fresh line — accept it
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
