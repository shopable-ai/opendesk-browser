// Shared static JavaScript leading-comment scan. No parsing or execution of code.
export function readSourceLine(source, start) {
  const ending = /[\r\n\u2028\u2029]/g;
  ending.lastIndex = start;
  const end = ending.exec(source)?.index ?? source.length;
  const next = end + (source[end] === '\r' && source[end + 1] === '\n' ? 2 : end < source.length ? 1 : 0);
  return {raw:source.slice(start,end),end,next};
}

// Only actual line comments before the first JS token are exposed. Block
// comments are skipped as a unit; their contents cannot open metadata.
export function* leadingLineComments(source, offset = 0, line = 1) {
  while (offset < source.length) {
    if (/\s/.test(source[offset])) {
      if (source[offset] === '\r' && source[offset + 1] === '\n') offset++;
      if (/[\r\n\u2028\u2029]/.test(source[offset])) line++;
      offset++;
      continue;
    }
    if (source.startsWith('//',offset)) {
      const current = readSourceLine(source,offset);
      yield {...current,offset,line};
      if (current.next > current.end) line++;
      offset = current.next;
      continue;
    }
    if (source.startsWith('/*',offset)) {
      const end = source.indexOf('*/',offset + 2);
      if (end < 0) return; // The JS compiler independently rejects invalid JS.
      line += (source.slice(offset,end + 2).match(/\r\n|[\r\n\u2028\u2029]/g) || []).length;
      offset = end + 2;
      continue;
    }
    return;
  }
}
