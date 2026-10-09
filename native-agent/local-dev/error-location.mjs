// Local-only diagnostics for the original Controller AsyncFunction wrapper.
// This never changes a durable error, executes source, or sends source maps to Chrome.
import {mapProgramGeneratedPosition} from '../../scripts/build-program-project.mjs';

export function controllerErrorLocation(error, resolved) {
  if (typeof error?.stack !== 'string') return null;
  // V8's AsyncFunction adds two lines before the admitted body. Only its
  // anonymous eval frame is meaningful; blob/Worker runtime coordinates are not.
  const frames = error.stack.slice(0, 4096).split('\n');
  for (const frame of frames) {
    if (!/^\s*at /.test(frame) || !frame.includes('eval at ')) continue;
    const match = frame.match(/, <anonymous>:(\d+):(\d+)\)?$/);
    if (!match) continue;
    const line = Number(match[1]) - 2, column = Number(match[2]) - 1;
    const sourceLines = resolved.sourceUtf8.split('\n');
    if (line < 1 || line > sourceLines.length || column < 0 || column > sourceLines[line - 1].length) continue;
    let location;
    if (resolved.sourceMapUtf8) {
      try {
        const mapped = mapProgramGeneratedPosition(resolved.sourceMapUtf8, {line, column});
        if (mapped.source == null || mapped.line == null || mapped.column == null) continue;
        const file = mapped.source.replace(/^webpack:\/\/[^/]*\//, '').replace(/^\.\//, '');
        location = {file, line: mapped.line, column: mapped.column + 1};
      } catch { continue; }
    } else location = {file: resolved.entry, line, column: column + 1};
    return {sourceHash: resolved.sourceHash, location,
      generated: {line, column: column + 1}, basis: 'v8-async-function-stack'};
  }
  return null;
}
