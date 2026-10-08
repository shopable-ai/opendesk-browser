export function normalizeKeyword(value) {
  const keyword = typeof value === 'string' ? value.trim() : '';
  return keyword || 'OpenDesk';
}
