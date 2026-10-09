// UI-only text projections. Never interpret returned key names as a business schema
// or treat a transport envelope as the script's actual value.
import {formatTaskError} from './task-run-diagnostics.js';

function jsValue(value, depth = 0) {
  if (value === undefined) return 'undefined';
  if (Object.is(value, -0)) return '-0';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const pad = '  '.repeat(depth), next = '  '.repeat(depth + 1);
    return '[\n' + value.map(item => next + jsValue(item, depth + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const pad = '  '.repeat(depth), next = '  '.repeat(depth + 1);
    return '{\n' + entries.map(([key, child]) => next + JSON.stringify(key) + ': ' + jsValue(child, depth + 1)).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(value);
}

export function formatRunValue(value) {
  // Plain text is the original string, not JSON with an extra pair of quotes.
  return typeof value === 'string' ? value : jsValue(value);
}

export function formatControllerRunResult(rows, runId, denied = []) {
  if (!runId) return '尚未选择运行记录';
  if (denied.includes(runId)) return '当前运行结果无权查看，请核对网站权限。';
  const selected = rows.filter(row => row.runId === runId);
  if (!selected.length) return '本次运行尚无可查看的结果。';
  return selected.map(row => Object.hasOwn(row, 'value') ? formatRunValue(row.value) : formatTaskError(row.error))
    .join('\n\n');
}
