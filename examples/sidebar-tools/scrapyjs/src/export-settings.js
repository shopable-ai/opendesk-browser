const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validKey = key => typeof key === 'string' && key.trim() && key.length <= 128 &&
  !['__proto__', 'constructor', 'prototype'].includes(key) && !/[\u0000-\u001f\u007f]/u.test(key);

// Preferences are partial; only the adapter receives a complete per-download order.
// Keep discovery identical to app-sdk.download, including its nullish fallback.
export function completeCsvOutput(snapshot, preferences = {}) {
  const data = snapshot?.result?.data ?? snapshot?.value?.data;
  if (!Array.isArray(data)) throw new Error('结果中没有可导出的记录数组');
  const keys = [...new Set(data.flatMap(row => Object.keys(row)))];
  if (!object(preferences) || Object.keys(preferences).some(key => !['fieldOrder', 'fieldNames'].includes(key)))
    throw new Error('CSV 偏好仅接受 fieldOrder 和 fieldNames');

  const order = Object.hasOwn(preferences, 'fieldOrder') ? preferences.fieldOrder : [];
  if (!Array.isArray(order) || new Set(order).size !== order.length || [...order].some(key => !validKey(key)))
    throw new Error('CSV 列顺序偏好必须是不重复的合法字段名数组');

  const hasNames = Object.hasOwn(preferences, 'fieldNames');
  const names = hasNames ? preferences.fieldNames : {};
  if (!object(names)) throw new Error('CSV 表头名称偏好必须是对象');
  for (const [key, name] of Object.entries(names)) {
    if (!validKey(key) || typeof name !== 'string' || Array.from(name).length > 80 ||
        new TextEncoder().encode(name).byteLength > 240 || /[\u0000-\u001f\u007f]/u.test(name))
      throw new Error('CSV 表头名称无效');
  }

  const available = new Set(keys);
  const unknown = new Set([...order, ...Object.keys(names)].filter(key => !available.has(key)));
  const preferred = order.filter(key => available.has(key));
  const selected = new Set(preferred);
  const output = {fieldOrder: [...preferred, ...keys.filter(key => !selected.has(key))]};
  if (hasNames) output.fieldNames = Object.fromEntries(Object.entries(names).filter(([key]) => available.has(key)));

  // Check final headers too: a preferred name can collide with a supplemented key.
  const headers = output.fieldOrder.map(key => {
    const name = output.fieldNames && Object.hasOwn(output.fieldNames, key) ? output.fieldNames[key] : undefined;
    return typeof name === 'string' && name.trim() ? name.normalize('NFC').trim() : key;
  });
  if (new Set(headers).size !== headers.length) throw new Error('CSV 表头名称重复，请使用不同名称');
  return {output, warnings: [...unknown].map(key => `CSV 偏好字段 ${JSON.stringify(key)} 不在当前结果中，已忽略`)};
}
