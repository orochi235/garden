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
