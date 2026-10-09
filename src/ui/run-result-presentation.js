// UI-only text projections. Never interpret returned key names as a business schema
// or treat a transport envelope as the script's actual value.
import {formatTaskError} from './task-run-diagnostics.js';
export {formatRunValue, runValueKind} from './run-value-format.js';
import {formatRunValue} from './run-value-format.js';

export function formatControllerRunResult(rows, runId, denied = []) {
  if (!runId) return '尚未选择运行记录';
  if (denied.includes(runId)) return '当前运行结果无权查看，请核对网站权限。';
  const selected = rows.filter(row => row.runId === runId);
  if (!selected.length) return '本次运行尚无可查看的结果。';
  return selected.map(row => Object.hasOwn(row, 'value') ? formatRunValue(row.value) : formatTaskError(row.error))
    .join('\n\n');
}
