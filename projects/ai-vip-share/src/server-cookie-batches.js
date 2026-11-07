import {preflightCookieFile, LOCAL_CHATGPT} from './local-cookie-file.js';

const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => fields.includes(key));
const partition = value => value ? [value.topLevelSite, value.hasCrossSiteAncestor] : null;
export const serverCookieScope = rows => JSON.stringify(rows.map(row =>
  [row.name, row.path, row.domain || '', row.storeId ?? null, partition(row.partitionKey)])
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export function validateServerCookieScope(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('Invalid server scope');
  const seen = new Set();
  for (const row of rows) {
    if (!exact(row, ['name', 'path', 'domain', 'storeId', 'partitionKey']) ||
        typeof row.name !== 'string' || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,256}$/.test(row.name) ||
        row.path !== '/' || (row.domain !== undefined && row.domain !== '.chatgpt.com') ||
        (row.storeId !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(row.storeId)) ||
        (row.partitionKey !== undefined && (!exact(row.partitionKey, ['topLevelSite', 'hasCrossSiteAncestor']) ||
          Object.keys(row.partitionKey).length !== 2 || row.partitionKey.topLevelSite !== 'https://chatgpt.com' ||
          typeof row.partitionKey.hasCrossSiteAncestor !== 'boolean'))) throw Error('Invalid server scope');
    const key = serverCookieScope([row]);
    if (seen.has(key)) throw Error('Duplicate server scope');
    seen.add(key);
  }
  return rows.map(row => ({...row, ...(row.partitionKey ? {partitionKey: {...row.partitionKey}} : {})}));
}

// The backend supplies the export. Neither file selection nor browser Cookie values are involved.
export async function prepareServerCookieBatches(data, {now, issuedAt=now, expectedScope, cookies, assertActive}) {
  if (!exact(data, ['schemaVersion', 'deliveryId', 'targetUrl', 'expiresAt', 'cookies']) ||
      data.schemaVersion !== 2 || typeof data.deliveryId !== 'string' || !data.deliveryId.trim() ||
      data.deliveryId.length > 120 || data.targetUrl !== LOCAL_CHATGPT.site.targetUrl ||
      !Number.isFinite(now) || !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= now || !Number.isFinite(issuedAt) || data.expiresAt - issuedAt > 120000)
    throw Error('Invalid server delivery');
  const checked = preflightCookieFile(JSON.stringify(data.cookies), now);
  if (!checked.count || serverCookieScope(checked.batches.flatMap(batch => batch.cookies)) !== expectedScope)
    throw Error('Server scope changed');
  assertActive();
  const actual = await cookies.getCurrentStore({url: data.targetUrl});
  assertActive();
  if (typeof actual?.storeId !== 'string') throw Error('Store unavailable');
  const context = checked.contexts.some(row => row.partitionKey) ?
    await cookies.getPartitionKey({url: data.targetUrl}) : null;
  assertActive();
  for (const row of checked.contexts) {
    if (row.storeId !== undefined && row.storeId !== actual.storeId) throw Error('Store changed');
    if (row.partitionKey && JSON.stringify(partition(row.partitionKey)) !==
        JSON.stringify(partition(context?.partitionKey))) throw Error('Partition changed');
  }
  const batches=checked.batches.map(batch=>({...batch,
    cookies:batch.cookies.map(row=>({...row,storeId:actual.storeId}))}));
  if(batches.some(batch=>new TextEncoder().encode(JSON.stringify(batch)).length>12000))
    throw Error('Resolved batch exceeds limit');
  return {...checked, batches, deliveryId: data.deliveryId, targetUrl: data.targetUrl,
    expiresAt: Math.floor(Math.min(data.expiresAt, checked.earliestExpiry ?? Infinity)),
    storeId: actual.storeId, partitionKey: context?.partitionKey ?? null, scope: expectedScope};
}
