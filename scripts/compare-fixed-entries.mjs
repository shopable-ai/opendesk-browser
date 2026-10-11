// Compare independently measured builds. Each build must first be checked by
// its own source contract; additions must not be required in the older build.
export function compareFixedEntries(before, after) {
  const index = (report, label) => {
    if (report?.kind !== 'physical-verified-fixed-entry-budget' || report.mode !== 'production' ||
        !Array.isArray(report.entries) || report.entries.length !== report.fixedEntryCount) {
      throw Error(label + ' must be an independently verified production fixed-entry report');
    }
    const rows = new Map();
    for (const row of report.entries) {
      if (typeof row.path !== 'string' || !row.path || rows.has(row.path) ||
          !Number.isSafeInteger(row.bytes) || row.bytes <= 0 ||
          !Number.isSafeInteger(row.budgetBytes) || row.bytes > row.budgetBytes ||
          row.remainingBytes !== row.budgetBytes - row.bytes) {
        throw Error(label + ' contains an invalid, duplicate or over-budget entry');
      }
      rows.set(row.path, row);
    }
    if ([...rows.values()].reduce((sum, row) => sum + row.bytes, 0) !== report.totalFixedJsBytes) {
      throw Error(label + ' fixed-entry total does not match its measured files');
    }
    return rows;
  };
  const oldEntries = index(before, 'Parent'), newEntries = index(after, 'Candidate');
  const paths = [...new Set([...oldEntries.keys(), ...newEntries.keys()])].sort();
  const rows = paths.map(path => {
    const old = oldEntries.get(path), current = newEntries.get(path);
    const oldBytes = old?.bytes ?? 0, newBytes = current?.bytes ?? 0;
    return {
      path,
      change: !old ? 'added' : !current ? 'removed' : old.sha256 === current.sha256 ? 'unchanged' : 'modified',
      before: oldBytes, after: newBytes, saved: oldBytes - newBytes,
      remaining: current?.remainingBytes ?? null,
      beforeBudget: old?.budgetBytes ?? null, afterBudget: current?.budgetBytes ?? null
    };
  });
  return {
    beforeFixedEntryCount: before.fixedEntryCount,
    afterFixedEntryCount: after.fixedEntryCount,
    beforeFixedJsBytes: before.totalFixedJsBytes,
    afterFixedJsBytes: after.totalFixedJsBytes,
    totalFixedJsSaved: before.totalFixedJsBytes - after.totalFixedJsBytes,
    addedEntries: rows.filter(row => row.change === 'added').map(row => row.path),
    removedEntries: rows.filter(row => row.change === 'removed').map(row => row.path),
    rows
  };
}
