// Metadata describes source. Parsing never downloads, grants privileges or authorizes
// execution. The trusted dependency manager must verify the actual bytes and lock.
export const USER_SCRIPT_METADATA_LIMITS = Object.freeze({headerBytes:64 * 1024, requireCount:64, matchCount:128});
const HASH_BYTES = Object.freeze({md5:16,sha1:20,sha256:32,sha384:48,sha512:64});
const STRONG_HASHES = new Set(['sha256','sha384','sha512']);
const RUN_AT = Object.freeze({'document-start':'document_start','document-end':'document_end','document-idle':'document_idle'});
const DESCRIPTIVE = new Set(['name','namespace','version','description','author','copyright','license',
  'homepage','homepageurl','website','source','supporturl','icon','iconurl','defaulticon','icon64',
  'icon64url','tag','antifeature','contributionurl','contributionamount']);
const EXECUTION = new Set(['require','resource','match','exclude-match','include','exclude','run-at',
  'noframes','grant','connect','inject-into','sandbox','unwrap','top-level-await','run-in','webrequest',
  'updateurl','downloadurl','inject-mode','world']);
const MULTILINGUAL = new Set(['name','description','antifeature']);
const encoder = new TextEncoder();
const err = (code, message, diagnostics = []) => Object.assign(new Error(message || code), {code,diagnostics});
const diagnostic = (severity, code, message, row) => ({severity,code,message,
  ...(row ? {line:row.line,directive:row.name || 'require'} : {})});
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function readLine(source, start) {
  let end = start;
  while (end < source.length && !/[\r\n\u2028\u2029]/.test(source[end])) end++;
  const next = end + (source[end] === '\r' && source[end + 1] === '\n' ? 2 : end < source.length ? 1 : 0);
  return {raw:source.slice(start,end),end,next};
}
function openingHeader(source) {
  // Skip only JavaScript trivia before the first token. A copyright comment may
  // precede valid metadata, but a marker inside a string/template/block comment
  // must not become a dependency declaration. Never scan beyond actual code.
  let offset = 0, line = 1;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) {
      if (source[offset] === '\r' && source[offset + 1] === '\n') offset++;
      if (/[\r\n\u2028\u2029]/.test(source[offset])) line++;
      offset++;
      continue;
    }
    if (source.startsWith('//',offset)) {
      const current = readLine(source,offset);
      if (/^\/\/[\t ]*==UserScript\b/.test(current.raw))
        return {offset,line,malformed:!/^\/\/[\t ]*==UserScript==[\t ]*$/.test(current.raw)};
      if (current.next > current.end) line++;
      offset = current.next;
      continue;
    }
    if (source.startsWith('/*',offset)) {
      const end = source.indexOf('*/',offset + 2);
      if (end < 0) return null; // Compiler separately rejects unterminated JS.
      line += (source.slice(offset,end + 2).match(/\r\n|[\r\n\u2028\u2029]/g) || []).length;
      offset = end + 2;
      continue;
    }
    return null;
  }
  return null;
}
function importIdentity(value, diagnostics) {
  if (value === undefined || value === null) return null;
  try {
    if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error();
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = '';
    return url.href;
  } catch {
    diagnostics.push(diagnostic('error','E_IMPORT_SOURCE','Import source must be the actual absolute HTTP(S) script URL without credentials'));
    return null;
  }
}
function decodeDigest(value, byteLength) {
  if (new RegExp(`^[a-f0-9]{${byteLength * 2}}$`,'i').test(value))
    return {digestHex:value.toLowerCase(),encoding:'hex'};
  // Accept padded or unpadded Base64, including the URL-safe alphabet, but reject
  // invalid lengths, padding and noncanonical trailing bits. '+' is never a space.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const normalized = value.replace(/-/g,'+').replace(/_/g,'/');
  const bare = normalized.replace(/=+$/,'');
  if (bare.length % 4 === 1 || (normalized.includes('=') && normalized.length % 4 !== 0)) return null;
  try {
    const decoded = atob(bare);
    if (decoded.length !== byteLength || btoa(decoded).replace(/=+$/,'') !== bare) return null;
    return {digestHex:Array.from(decoded, char => char.charCodeAt(0).toString(16).padStart(2,'0')).join(''),encoding:'base64'};
  } catch { return null; }
}
function parseIntegrity(fragment, row, diagnostics) {
  if (!fragment) return [];
  let text;
  try {text = decodeURIComponent(fragment);}
  catch {
    diagnostics.push(diagnostic('error','E_DEPENDENCY_INTEGRITY','Malformed percent encoding in dependency integrity',row));
    return [];
  }
  const integrity = [];
  // TM URL fragments accept algorithm=hash or algorithm-hash, hex or Base64,
  // separated by commas/semicolons. Whitespace-separated SRI tokens are also
  // understood. D1 deliberately verifies ALL strong declarations; it does not
  // copy TM's last-supported-algorithm or HTML SRI's strongest-any-match policy.
  const tokens = text.split(/[;,\s]+/).filter(Boolean);
  for (const token of tokens) {
    const pair = /^(md5|sha1|sha256|sha384|sha512)([=-])(.+)$/i.exec(token);
    const algorithm = pair?.[1].toLowerCase();
    const decoded = pair && decodeDigest(pair[3],HASH_BYTES[algorithm]);
    if (!decoded) {
      diagnostics.push(diagnostic('error','E_DEPENDENCY_INTEGRITY',`Invalid or unsupported integrity token: ${token.slice(0,96)}`,row));
      continue;
    }
    const previous = integrity.find(item => item.algorithm === algorithm);
    if (previous) diagnostics.push(diagnostic(previous.digestHex === decoded.digestHex ? 'warning' : 'error',
      previous.digestHex === decoded.digestHex ? 'W_DEPENDENCY_INTEGRITY_DUPLICATE' : 'E_DEPENDENCY_INTEGRITY_CONFLICT',
      previous.digestHex === decoded.digestHex ? `Repeated ${algorithm} integrity declaration` : `Conflicting ${algorithm} integrity declarations`,row));
    integrity.push({algorithm,...decoded,raw:token});
  }
  if (!tokens.length) diagnostics.push(diagnostic('error','E_DEPENDENCY_INTEGRITY','Empty integrity declaration',row));
  return integrity;
}
function parseDependency(value, order, row, importSourceUrl) {
  const diagnostics = [];
  const hashAt = value.indexOf('#');
  const address = hashAt < 0 ? value : value.slice(0,hashAt);
  const integrity = parseIntegrity(hashAt < 0 ? '' : value.slice(hashAt + 1),row,diagnostics);
  let url = null;
  try {
    if (!address || /[\s\u0000-\u001f\u007f\\]/.test(address) || value.length > 8192) throw new Error();
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(address);
    if (!absolute && !importSourceUrl) {
      diagnostics.push(diagnostic('error','E_DEPENDENCY_BASE_URL','Relative @require needs the actual script import URL; page URL and @downloadURL are not an import identity',row));
    } else {
      const resolved = new URL(address,importSourceUrl || undefined);
      if (resolved.protocol !== 'https:' || resolved.username || resolved.password) throw new Error();
      resolved.hash = '';
      url = resolved.href;
    }
  } catch { diagnostics.push(diagnostic('error','E_DEPENDENCY_URL','@require must resolve to an HTTPS URL without credentials or control characters',row)); }
  return {raw:value,originalUrl:value,url,sourceKind:url ? 'https' : null,
    sha256:integrity.find(item => item.algorithm === 'sha256')?.digestHex || null,
    integrity,integrityPolicy:'all-strong',order,line:row.line,diagnostics};
}

/** Parse for import/review. Unsupported execution semantics remain inspectable.
 * importSourceUrl is trusted importer provenance, never metadata such as @homepage.
 * A clipboard paste has no base URL. Only a real metadata comment before the first
 * JS token is read; strings, template literals and later comments are not scanned.
 */
export function parseUserScriptDependencies(sourceUtf8, {importSourceUrl} = {}) {
  if (typeof sourceUtf8 !== 'string') throw err('E_SOURCE','Script source must be text');
  const result = {profile:'opendesk-d1',hasHeader:false,headerRaw:'',headerRange:null,headerComplete:false,
    importSourceUrl:null,requires:[],matches:[],excludeMatches:[],runAt:'document-idle',noframes:false,
    directives:[],grants:[],resources:[],diagnostics:[]};
  result.importSourceUrl = importIdentity(importSourceUrl,result.diagnostics);
  const opening = openingHeader(sourceUtf8);
  if (!opening) return freeze(result);
  let {offset,line} = opening;
  result.hasHeader = true;
  if (opening.malformed) result.diagnostics.push(diagnostic('error','E_METADATA_HEADER','Malformed UserScript opening marker',{line}));
  const start = offset, startLine = line;
  let headerBytes = 0, firstLine = true, runAtSeen = null, truncated = false;
  while (offset < sourceUtf8.length) {
    const current = readLine(sourceUtf8,offset);
    headerBytes += encoder.encode(sourceUtf8.slice(offset,current.next)).byteLength;
    if (headerBytes > USER_SCRIPT_METADATA_LIMITS.headerBytes) {
      result.diagnostics.push(diagnostic('error','E_METADATA_LIMIT','UserScript header exceeds 64 KiB'));
      offset = Math.min(current.next,start + USER_SCRIPT_METADATA_LIMITS.headerBytes);
      truncated = true;
      break;
    }
    offset = current.next;
    if (firstLine) {firstLine = false;line++;continue;}
    if (/^[\t ]*\/\/[\t ]*==\/UserScript==[\t ]*$/.test(current.raw)) {result.headerComplete = true;break;}
    const rowContext = {line};
    if (!/^[\t ]*\/\//.test(current.raw)) {
      result.diagnostics.push(diagnostic('error','E_METADATA_HEADER','Each metadata line must be a line comment',rowContext));
      line++;
      continue;
    }
    const pair = /^[\t ]*\/\/[\t ]*@([A-Za-z][A-Za-z0-9_.:-]*)(?:[\t ]+(.*))?[\t ]*$/.exec(current.raw);
    if (!pair) {
      if (/^[\t ]*\/\/[\t ]*@/.test(current.raw))
        result.diagnostics.push(diagnostic('error','E_METADATA_DIRECTIVE','Malformed metadata directive',rowContext));
      line++;
      continue;
    }
    const name = pair[1].toLowerCase(), value = pair[2]?.trim() || '';
    const [baseName,locale] = name.split(':');
    const descriptive = DESCRIPTIVE.has(baseName) && (!locale || MULTILINGUAL.has(baseName));
    const kind = descriptive ? 'descriptive' : EXECUTION.has(name) ? 'execution' : 'unknown';
    const row = {name,originalName:pair[1],value,raw:current.raw,line,kind,known:kind !== 'unknown'};
    result.directives.push(row);
    if (kind === 'unknown') result.diagnostics.push(diagnostic('warning','W_METADATA_UNKNOWN',`Unrecognized @${name} is preserved for review`,row));
    if (name === 'require') result.requires.push(parseDependency(value,result.requires.length,row,result.importSourceUrl));
    else if (name === 'match') result.matches.push(value);
    else if (name === 'exclude-match') result.excludeMatches.push(value);
    else if (name === 'grant') result.grants.push(value);
    else if (name === 'resource') {
      const parts = /^(\S+)\s+(.+)$/.exec(value);
      result.resources.push({name:parts?.[1] || null,originalUrl:parts?.[2] || null,raw:value,line});
      if (!parts) result.diagnostics.push(diagnostic('error','E_RESOURCE_DECLARATION','@resource needs a name and URL',row));
    } else if (name === 'run-at') {
      if (runAtSeen !== null) result.diagnostics.push(diagnostic(runAtSeen === value ? 'warning' : 'error',
        runAtSeen === value ? 'W_METADATA_DUPLICATE' : 'E_METADATA_CONFLICT','Repeated @run-at must agree',row));
      if (runAtSeen === null) {result.runAt = value;runAtSeen = value;}
    } else if (name === 'noframes') {
      result.noframes = true;
      if (value) result.diagnostics.push(diagnostic('error','E_METADATA_VALUE','@noframes is a flag and takes no value',row));
    }
    line++;
  }
  result.headerRaw = sourceUtf8.slice(start,offset);
  result.headerRange = {start,end:offset,startLine,endLine:line,truncated};
  if (!result.headerComplete && !truncated) result.diagnostics.push(diagnostic('error','E_METADATA_HEADER','UserScript header is not terminated'));
  if (result.requires.length > USER_SCRIPT_METADATA_LIMITS.requireCount)
    result.diagnostics.push(diagnostic('error','E_DEPENDENCY_LIMIT','At most 64 dependencies can be reviewed in one script'));
  if (result.matches.length > USER_SCRIPT_METADATA_LIMITS.matchCount || result.excludeMatches.length > USER_SCRIPT_METADATA_LIMITS.matchCount)
    result.diagnostics.push(diagnostic('error','E_PAGE_MATCH','At most 128 rules of each matching type are supported'));
  const byUrl = new Map();
  for (const dependency of result.requires) {
    result.diagnostics.push(...dependency.diagnostics);
    if (!dependency.url) continue;
    const previous = byUrl.get(dependency.url);
    if (previous) {
      result.diagnostics.push(diagnostic('warning','W_DEPENDENCY_DUPLICATE','Repeated @require is kept in declaration order and will execute again',dependency));
      if (dependency.integrity.some(item => previous.some(prior => STRONG_HASHES.has(item.algorithm) &&
          prior.algorithm === item.algorithm && prior.digestHex !== item.digestHex)))
        result.diagnostics.push(diagnostic('error','E_DEPENDENCY_INTEGRITY_CONFLICT','The same dependency URL declares conflicting content hashes',dependency));
      previous.push(...dependency.integrity);
    } else byUrl.set(dependency.url,[...dependency.integrity]);
  }
  return freeze(result);
}

function validMatchPattern(value) {
  // D1 page assets support HTTP(S) pages. file://, privileged schemes and
  // <all_urls> need separate permission/scheme policy, and remain importable.
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  const match = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(value);
  if (!match) return false;
  const authority = /^(\[[^\]]+\]|[^:]+)(?::(\*|[0-9]+))?$/.exec(match[2]);
  if (!authority || (authority[2] !== undefined && authority[2] !== '*' && Number(authority[2]) > 65535)) return false;
  const host = authority[1];
  if (host === '*') return true;
  const actual = host.startsWith('*.') ? host.slice(2) : host;
  if (!actual || actual.includes('*') || /[@#?]/.test(actual) || (host.startsWith('*.') && actual.startsWith('['))) return false;
  try {return new URL(`https://${actual}/`).hostname === actual.toLowerCase();}
  catch {return false;}
}

/** Semantic admission only; dependenciesLocked is an assertion by the trusted
 * caller AFTER loading/revalidating the immutable lock, not a UI authorization.
 * Syntax, ungranted API usage in the body and native target permissions are checked
 * independently by the compiler/runtime. No source rewriting happens here.
 */
export function assessUserScriptExecution(parsed, {entryFormat='async-main',phase='preview',dependenciesLocked=false} = {}) {
  if (!parsed || parsed.profile !== 'opendesk-d1' || !Array.isArray(parsed.requires) || !Array.isArray(parsed.diagnostics))
    throw err('E_METADATA_SCHEMA','A parsed UserScript manifest is required');
  const blockers = parsed.diagnostics.filter(item => item.severity === 'error').map(item => ({...item}));
  const warnings = parsed.diagnostics.filter(item => item.severity === 'warning').map(item => ({...item}));
  const block = (code,message,row) => blockers.push(diagnostic('error',code,message,row));
  const warn = (code,message,row) => warnings.push(diagnostic('warning',code,message,row));
  if (!['async-main','classic-userscript'].includes(entryFormat)) block('E_ENTRY_FORMAT','Choose classic-userscript or async-main explicitly; ESM is not a UserScript entry mode');
  if (!['preview','registration'].includes(phase)) block('E_METADATA_PHASE','Expected preview or registration admission');
  for (const row of parsed.directives) {
    if (row.kind === 'unknown') block('E_METADATA_UNSUPPORTED',`@${row.name} has unknown execution semantics; remove it or use a supported adapter`,row);
    if (row.name === 'grant' && row.value !== 'none') block('E_GRANT_UNSUPPORTED',`@grant ${row.value || '(empty)'} is not implemented; no GM or host privilege is granted`,row);
    if (row.name === 'resource') block('E_RESOURCE_UNSUPPORTED','@resource is preserved but its GM resource APIs are not implemented',row);
    if (row.name === 'include' || row.name === 'exclude') block('E_MATCH_SEMANTICS_UNSUPPORTED',`@${row.name} glob/regex semantics are not implemented; explicit @match/@exclude-match conversion is required`,row);
    if (['connect','sandbox','unwrap','top-level-await','run-in','webrequest','inject-mode'].includes(row.name))
      block('E_METADATA_UNSUPPORTED',`@${row.name} execution semantics are not implemented`,row);
    if (row.name === 'inject-into' && row.value !== 'content') block('E_WORLD_NOT_APPROVED','Only content-style USER_SCRIPT isolation is supported; page/auto injection needs separate review',row);
    if (row.name === 'world') block('E_WORLD_NOT_APPROVED','@world cannot authorize an execution world; D1 uses USER_SCRIPT only',row);
    if (row.name === 'updateurl' || row.name === 'downloadurl')
      warn('W_UPDATE_NOT_IMPLEMENTED',`@${row.name} is informational; it neither establishes import identity nor enables automatic updates`,row);
  }
  const grants = [...new Set(parsed.grants)];
  if (grants.includes('none') && grants.length > 1) block('E_GRANT_CONFLICT','@grant none cannot be combined with privileged grants');
  if (parsed.hasHeader) {
    warn('W_USER_SCRIPT_ISOLATION',grants.includes('none')
      ? '@grant none does not switch to page MAIN world: page JavaScript globals and unsafeWindow are unavailable in USER_SCRIPT'
      : 'D1 uses USER_SCRIPT isolation without implicit GM_info, GM.info or unsafeWindow; this is a supported subset of UserScript managers');
    if (!parsed.directives.some(row => row.name === 'run-at'))
      warn('W_RUN_AT_DEFAULT','D1 defaults to document-idle; Violentmonkey defaults to document-end, so declare @run-at when timing matters');
  }
  if (!Object.hasOwn(RUN_AT,parsed.runAt)) block('E_RUN_AT_UNSUPPORTED',`@run-at ${parsed.runAt || '(empty)'} has no supported Chrome mapping`);
  for (const [rules,name] of [[parsed.matches,'match'],[parsed.excludeMatches,'exclude-match']])
    for (const value of rules) if (!validMatchPattern(value)) block('E_PAGE_MATCH',`@${name} is not a supported HTTP(S) Chrome match pattern: ${value}`);
  if (phase === 'registration' && parsed.matches.length === 0) block('E_PAGE_MATCH','Automatic registration requires at least one explicit @match');
  if (phase === 'preview' && parsed.hasHeader) {
    warn('W_PREVIEW_TIMING','Immediate preview runs in the approved current main document now; it does not replay @run-at, match selection or frame scheduling');
  }
  if (entryFormat === 'classic-userscript' && parsed.requires.length)
    warn('W_SHARED_COMPILATION_UNIT','Dependencies and classic source share one compilation unit; top-level strict directives and lexical declarations can affect each other. IIFE-local strict directives retain their own scope');
  for (const dependency of parsed.requires) {
    const weak = dependency.integrity.filter(item => !STRONG_HASHES.has(item.algorithm));
    if (weak.length && !dependency.integrity.some(item => STRONG_HASHES.has(item.algorithm)))
      block('E_DEPENDENCY_INTEGRITY_UNSUPPORTED','MD5/SHA-1 alone are not accepted; provide a strong integrity value before review',dependency);
    else if (weak.length) warn('W_DEPENDENCY_WEAK_INTEGRITY','MD5/SHA-1 declarations are retained but not verified; every declared SHA-256/384/512 must match',dependency);
  }
  return freeze({status:blockers.length ? 'unsupported' : parsed.requires.length && !dependenciesLocked ? 'needs-review' : 'executable',
    blockers,warnings,nativeOptions:{matches:[...new Set(parsed.matches)],excludeMatches:[...new Set(parsed.excludeMatches)],
      runAt:RUN_AT[parsed.runAt] || null,allFrames:!parsed.noframes,world:'USER_SCRIPT'}});
}
export function assertUserScriptExecutable(parsed, options) {
  const assessment = assessUserScriptExecution(parsed,options);
  if (assessment.blockers.length) {
    const first = assessment.blockers[0];
    throw err(first.code,first.message,assessment.blockers);
  }
  if (assessment.status === 'needs-review') throw err('E_DEPENDENCY_UNLOCKED','Approve, verify and lock all dependencies before execution');
  return assessment;
}
// Legacy declaration helper only. A declared digest is not an approved asset or
// an execution grant. Consumers must use the trusted lock manager before injection.
export function requirePinnedDependencies(parsed) {
  assertUserScriptExecutable(parsed,{dependenciesLocked:true});
  if (parsed.requires.some(row => !row.sha256))
    throw err('E_DEPENDENCY_UNLOCKED','A SHA-256 declaration is missing; use the trusted review and lock flow');
  return parsed.requires;
}
