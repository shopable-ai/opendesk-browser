// UserScript metadata is a declarative input, never an executable import.
// @require is resolved by a trusted dependency manager; web pages do not fetch it.
const MAX_HEADER_BYTES = 8192;
const MAX_REQUIRE_COUNT = 8;
const SHA256_HEX = /^[0-9a-f]{64}$/i;
const err = (code, message) => Object.assign(new Error(message || code), {code});
function sha256Fragment(fragment) {
  if (!fragment) return null; // An unlocked URL can be reviewed then pinned by the UI.
  const raw = decodeURIComponent(fragment.slice(1));
  const hex = /^sha256=([a-f0-9]{64})$/i.exec(raw);
  if (hex) return hex[1].toLowerCase();
  const base64 = /^sha256-([A-Za-z0-9+/]{43}=)$/.exec(raw);
  if (!base64) throw err('E_DEPENDENCY_INTEGRITY','Only SHA-256 SRI is supported');
  const bytes = Uint8Array.from(atob(base64[1]), c=>c.charCodeAt(0));
  if (bytes.length !== 32) throw err('E_DEPENDENCY_INTEGRITY');
  return Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
}
export function parseUserScriptDependencies(sourceUtf8) {
  if (typeof sourceUtf8 !== 'string') throw err('E_SOURCE', 'Script source must be text');
  const source = sourceUtf8.replace(/^\uFEFF/, '');
  const lines = source.split(/\r\n|\n|\r/);
  if (lines[0].trim() !== '// ==UserScript==')
    return Object.freeze({hasHeader:false,requires:Object.freeze([]),matches:Object.freeze([])});
  const requires = [], matches = [];
  let bytes = 0, closed = false;
  for (let i = 0; i < lines.length && i < 64; i++) {
    bytes += new TextEncoder().encode(lines[i]).length + 1;
    if (bytes > MAX_HEADER_BYTES) throw err('E_METADATA_LIMIT', 'UserScript header exceeds 8 KiB');
    if (i === 0) continue;
    if (lines[i].trim() === '// ==/UserScript==') {closed = true; break;}
    if (!lines[i].trim().startsWith('//')) throw err('E_METADATA_HEADER', 'Malformed UserScript header');
    const pair = /^\s*\/\/\s+@([a-zA-Z][a-zA-Z0-9-]*)(?:\s+(.+))?\s*$/.exec(lines[i]);
    if (!pair) continue;
    const name = pair[1].toLowerCase(), value = pair[2]?.trim() || '';
    if (name === 'require') {
      if (!value || /\s/.test(value)) throw err('E_DEPENDENCY_URL','@require must contain exactly one URL');
      let url;
      try {url = new URL(value);} catch {throw err('E_DEPENDENCY_URL','Invalid @require URL');}
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048)
        throw err('E_DEPENDENCY_URL','@require requires an absolute HTTPS URL without credentials');
      const sha256 = sha256Fragment(url.hash);
      url.hash = '';
      if (requires.length >= MAX_REQUIRE_COUNT)
        throw err('E_DEPENDENCY_LIMIT', 'At most 8 JavaScript dependencies');
      if (requires.some(row => row.url === url.href))
        throw err('E_DEPENDENCY_DUPLICATE', 'Duplicate @require URL');
      requires.push(Object.freeze({url:url.href,sha256,order:requires.length}));
    } else if (name === 'match') {
      if (matches.length >= 32) throw err('E_PAGE_MATCH', 'Too many @match rules');
      if (!value) throw err('E_PAGE_MATCH','Empty @match');
      matches.push(value);
    } else if (name === 'grant' && value && value !== 'none') {
      throw err('E_GRANT_UNSUPPORTED', 'GM privileges require separate trusted capability approval');
    } else if (name === 'inject-into' && value !== 'content') {
      throw err('E_WORLD_NOT_APPROVED', 'Page MAIN-world injection is not enabled');
    } else if (name === 'resource') {
      throw err('E_RESOURCE_UNSUPPORTED', '@resource requires a separate resource API');
    }
  }
  if (!closed) throw err('E_METADATA_HEADER','UserScript header is not terminated');
  return Object.freeze({hasHeader:true,requires:Object.freeze(requires),matches:Object.freeze(matches)});
}
export function requirePinnedDependencies(parsed) {
  const missing = parsed.requires.filter(row=>!row.sha256);
  if (missing.length) throw err('E_DEPENDENCY_UNLOCKED',
    'Use a SHA-256-pinned @require or approve and lock the dependency before running');
  return parsed.requires;
}
