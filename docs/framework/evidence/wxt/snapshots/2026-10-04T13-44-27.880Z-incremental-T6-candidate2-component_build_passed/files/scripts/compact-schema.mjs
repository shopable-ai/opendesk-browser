// Lossless build-time factoring of repeated schema data. Validation rules and
// property order are unchanged; runtime consumers only read this frozen contract.
export function compactSchemaSource(source) {
  const marker = 'export default ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Expected generated schema default export');
  const schema = JSON.parse(source.slice(start + marker.length).trim().replace(/;$/, ''));
  const counts = new Map(), names = new Map(), declarations = [];
  function count(value) {
    if (!value || typeof value !== 'object') return;
    const key = JSON.stringify(value); counts.set(key, (counts.get(key) || 0) + 1);
    Object.values(value).forEach(count);
  }
  count(schema);
  function render(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    const key = JSON.stringify(value), shared = key.length >= 40 && counts.get(key) > 1;
    if (shared && names.has(key)) return names.get(key);
    const body = Array.isArray(value) ? `[${value.map(render).join(',')}]` :
      `{${Object.entries(value).map(([name, item]) => `${JSON.stringify(name)}:${render(item)}`).join(',')}}`;
    if (!shared) return body;
    const name = `schemaPart${names.size}`; names.set(key, name);
    declarations.push(`const ${name}=${body};`); return name;
  }
  const body = render(schema);
  return `${declarations.join('\n')}\nexport default ${body};\n`;
}
