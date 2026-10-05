// Build-time representation only: no schema field, validation rule or runtime
// authority is removed. The checked-in canonical schema module remains intact.
export function compactRuntimeSchema(source) {
  const match = source.match(/^\/\/ Frozen contract 1\.0\.0 schema; generated from docs\/contracts\/schema\.json\.\r?\nexport default (\{[^]*\});\s*$/);
  if (!match) throw new Error('Unexpected generated schema module; refuse lossy compaction');
  const schema = JSON.parse(match[1]);
  const identifier = JSON.stringify({type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9._:-]+$'});
  // JSON quoting prevents a quoted string value from matching this object text.
  // A factory preserves independent mutable leaf identity. NOINLINE prevents
  // Terser from expanding all 106 identical ID rules back into the fixed entry.
  const body = JSON.stringify(schema).replaceAll(identifier, '/*@__NOINLINE__*/identifierRule()');
  return `const identifierRule = () => (${identifier});\nexport default ${body};\n`;
}
