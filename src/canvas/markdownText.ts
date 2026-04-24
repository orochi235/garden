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
