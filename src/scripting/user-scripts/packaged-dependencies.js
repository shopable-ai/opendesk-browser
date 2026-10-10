import {digestUtf8 as sha256Utf8} from '../../platform/protocol.js';

import {BUILTIN_CATALOG} from '../../libs/catalog.js';
const row=BUILTIN_CATALOG.libraries.jquery;
export const JQUERY_371=Object.freeze({
  id:row.id,version:row.version,sha256:row.sha256,path:row.output,
  license:row.license,origin:'packaged'
});

// Only usable inside a trusted extension background/host context, never on a site.
// The result is JS *text* for chrome.userScripts, not code evaluated here.
export async function loadPackagedJquery({runtime = globalThis.chrome?.runtime, fetchImpl = globalThis.fetch} = {}) {
  if (!runtime || typeof runtime.getURL !== 'function' || typeof fetchImpl !== 'function') throw Object.assign(new Error('E_RESOURCE_UNAVAILABLE'),{code:'E_RESOURCE_UNAVAILABLE'});
  const url = new URL(runtime.getURL(JQUERY_371.path));
  if (url.protocol !== 'chrome-extension:' || url.search || url.hash || !url.pathname.endsWith('/' + JQUERY_371.path))
    throw Object.assign(new Error('E_RESOURCE_IDENTITY'),{code:'E_RESOURCE_IDENTITY'});
  const response = await fetchImpl(url.href, {cache:'no-store'});
  if (!response?.ok) throw Object.assign(new Error('E_RESOURCE_UNAVAILABLE'),{code:'E_RESOURCE_UNAVAILABLE'});
  const code = await response.text();
  if (new TextEncoder().encode(code).length > 128 * 1024 || await sha256Utf8(code) !== JQUERY_371.sha256)
    throw Object.assign(new Error('E_DEPENDENCY_HASH'),{code:'E_DEPENDENCY_HASH'});
  return Object.freeze({descriptor:JQUERY_371, code});
}
