// Local fallback: the TOC demo runs without network, npm or CDN approval.
// A pinned CDN example exports the exact same function from heading-stats-cdn.js.
export function summarizeHeadingLevels(items, maxOf = values => Math.max(...values)) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const item of items || []) {
    if (Number.isInteger(item?.level) && item.level >= 1 && item.level <= 6) {
      counts[item.level - 1] += 1;
    }
  }
  const maximum = Number(maxOf(counts));
  const peak = Number.isFinite(maximum) && maximum > 0 ? maximum : 1;
  return {
    total: counts.reduce((sum, count) => sum + count, 0),
    peak,
    levels: counts.map((count, index) => ({
      level: index + 1, count, percent: Math.round(count / peak * 100)
    }))
  };
}
