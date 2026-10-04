export function formatJSON(input) {
  try { return JSON.stringify(JSON.parse(input)); } catch { return input; }
}
// Source transformation only. Execution belongs to the admitted RunHost Worker.
export function wrapAsync(code) {
  if (typeof code !== 'string') throw new TypeError('Script source must be a string');
  return `(async function() {\n${code}\n})()`;
}
