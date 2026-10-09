// Presentation-only rendering of values admitted by the existing Value Codec.
// A returned key is data, not a UI label or part of the Controller envelope.
function literal(value, depth = 0, seen = new Set()) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite results are not supported');
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (depth > 20) throw new TypeError('Result nesting exceeds display limit');
  if (value && typeof value === 'object') {
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) throw new TypeError('Unsupported script return type');
    if (seen.has(value)) throw new TypeError('Cyclic script return value');
    seen.add(value);
  }
  const indent = '  '.repeat(depth), next = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (!value.length) {seen.delete(value);return '[]';}
    const text = '[\n' + Array.from(value, child => next + literal(child, depth + 1, seen)).join(',\n') + '\n' + indent + ']';
    seen.delete(value);
    return text;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) {seen.delete(value);return '{}';}
    const text = '{\n' + entries.map(([key, child]) =>
      next + JSON.stringify(key) + ': ' + literal(child, depth + 1, seen)).join(',\n') + '\n' + indent + '}';
    seen.delete(value);
    return text;
  }
  throw new TypeError('Unsupported script return type');
}

export function formatRunValue(value) {
  // Top-level strings remain raw text, including empty strings and newlines.
  return typeof value === 'string' ? value : literal(value);
}

export function runValueKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  if (value === undefined) return 'undefined';
  const kinds = {string:'字符串', number:'数字', boolean:'布尔值', object:'对象'};
  return kinds[typeof value] || '未知类型';
}
