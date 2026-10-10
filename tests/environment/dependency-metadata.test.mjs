import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseUserScriptDependencies as parse,assessUserScriptExecution as assess,
  assertUserScriptExecutable,requirePinnedDependencies,USER_SCRIPT_METADATA_LIMITS}
  from '../../src/scripting/user-scripts/dependency-metadata.js';

const userscript = (lines,body='async function main(){return true;}') =>
  '// ==UserScript==\n' + lines.map(line => '// ' + line).join('\n') + '\n// ==/UserScript==\n' + body;
const hasCode = (items,code) => items.some(item => item.code === code);
const rejected = (source,code,options={}) => {
  const parsed = parse(source);
  assert.equal(assess(parsed,options).status,'unsupported');
  assert.ok(hasCode(assess(parsed,options).blockers,code));
  assert.throws(() => assertUserScriptExecutable(parsed,options),error => error.diagnostics.some(item => item.code === code));
  return parsed;
};
const digest = (algorithm,text='reviewed dependency') => createHash(algorithm).update(text).digest();

test('ordinary JS and metadata-looking strings remain source; real BOM/blank-prefixed CRLF header is preserved',()=>{
  for (const source of ['', 'async function main(){return true;}',
    'const example = `\n// ==UserScript==\n// @require https://attacker.example/evil.js\n// ==/UserScript==\n`;',
    '/*\n// ==UserScript==\n// @require https://attacker.example/evil.js\n// ==/UserScript==\n*/']) {
    const parsed = parse(source);
    assert.equal(parsed.hasHeader,false);
    assert.deepEqual(parsed.requires,[]);
    assert.equal(assess(parsed).status,'executable');
  }
  const source = '\uFEFF\r\n  ' + userscript(['@name Example','@name:zh-CN 示例','@description description']).replaceAll('\n','\r\n');
  const parsed = parse(source);
  assert.equal(parsed.hasHeader,true);
  assert.equal(parsed.headerComplete,true);
  assert.equal(parsed.headerRaw,source.slice(parsed.headerRange.start,parsed.headerRange.end));
  assert.equal(parsed.directives[1].originalName,'name:zh-CN');
  assert.equal(parsed.directives[1].kind,'descriptive');
  assert.equal(assess(parsed).status,'executable');
  assert.ok(Object.isFrozen(parsed.directives[1]));
  assert.throws(()=>parse(null),error => error.code === 'E_SOURCE');
});

test('leading copyright comments do not hide real dependencies or privileges; malformed markers fail closed',()=>{
  for (const prefix of ['// Copyright 2026\n','/* Copyright\r\n2026 */\n',
    '\uFEFF/* comment */ // license\n\n','// comment\u2028']) {
    const parsed = parse(prefix + userscript(['@grant GM_getValue','@require https://cdn.example/a.js']));
    assert.equal(parsed.hasHeader,true);
    assert.equal(parsed.requires.length,1);
    assert.ok(hasCode(assess(parsed,{dependenciesLocked:true}).blockers,'E_GRANT_UNSUPPORTED'));
  }
  const afterCode = parse('const source = true;\n' + userscript(['@require https://cdn.example/a.js']));
  assert.equal(afterCode.hasHeader,false);
  rejected('// ==UserScript== trailing text\n// @require https://cdn.example/a.js\n// ==/UserScript==','E_METADATA_HEADER');
  rejected('// ==UserScript==\n// comment\u2028// @grant GM_getValue\n// ==/UserScript==','E_GRANT_UNSUPPORTED');
});

test('standard unpinned @require is importable and reviewable, including duplicate execution order',()=>{
  const values = ['https://cdn.example/a.js','https://other.example/b.js','https://cdn.example/a.js'];
  const parsed = parse(userscript(values.map(value => '@require ' + value)));
  assert.deepEqual(parsed.requires.map(row => row.url),values);
  assert.deepEqual(parsed.requires.map(row => row.order),[0,1,2]);
  assert.equal(parsed.requires[0].raw,values[0]);
  assert.deepEqual(parsed.requires[0].integrity,[]);
  assert.equal(parsed.requires[0].sha256,null);
  assert.equal(assess(parsed).status,'needs-review');
  assert.ok(hasCode(assess(parsed).warnings,'W_DEPENDENCY_DUPLICATE'));
  assert.throws(()=>assertUserScriptExecutable(parsed),error => error.code === 'E_DEPENDENCY_UNLOCKED');
  assert.throws(()=>requirePinnedDependencies(parsed),error => error.code === 'E_DEPENDENCY_UNLOCKED');
  assert.equal(assertUserScriptExecutable(parsed,{dependenciesLocked:true}).status,'executable');
});

test('TM hex/Base64, SRI tokens, percent-encoded fragments and multiple strong hashes canonicalize without losing plus signs',()=>{
  const sha256 = Buffer.alloc(32,251), sha384 = digest('sha384'), sha512 = digest('sha512');
  assert.ok(sha256.toString('base64').includes('+'));
  const hash = sha256.toString('hex');
  const examples = [
    `sha256=${hash}`,
    `sha256=${sha256.toString('base64')}`,
    `sha256-${sha256.toString('base64')}`,
    `sha256-${sha256.toString('base64url')}`,
    encodeURIComponent(`sha256-${sha256.toString('base64')}`),
    `sha256=${hash},sha384-${sha384.toString('base64')};sha512=${sha512.toString('hex')}`,
    `sha256-${sha256.toString('base64')} sha384-${sha384.toString('base64')}`,
  ];
  for (const fragment of examples) {
    const parsed = parse(userscript(['@require https://cdn.example/lib.js#' + fragment]));
    assert.equal(parsed.requires[0].sha256,hash);
    assert.equal(parsed.requires[0].url,'https://cdn.example/lib.js');
    assert.equal(parsed.requires[0].integrityPolicy,'all-strong');
    assert.equal(assess(parsed).status,'needs-review','a declared hash never grants execution');
    assert.equal(requirePinnedDependencies(parsed).length,1);
  }
  const multiple = parse(userscript(['@require https://cdn.example/lib.js#' + examples[5]])).requires[0].integrity;
  assert.deepEqual(multiple.map(row => row.algorithm),['sha256','sha384','sha512']);
  assert.equal(multiple[1].digestHex,sha384.toString('hex'));
});

test('malformed or conflicting integrity is preserved for diagnosis and cannot be admitted',()=>{
  const hash = digest('sha256').toString('hex'), other = digest('sha256','other').toString('hex');
  rejected(userscript(['@require https://cdn.example/a.js#']),'E_DEPENDENCY_INTEGRITY');
  for (const fragment of ['sha256=oops','sha256-%ZZ','sha256-A===','sha999=abcd','sha256-'+'A'.repeat(43)+'B',
    'sha256-'+Buffer.alloc(31).toString('base64')])
    rejected(userscript(['@require https://cdn.example/a.js#' + fragment]),'E_DEPENDENCY_INTEGRITY');
  rejected(userscript([`@require https://cdn.example/a.js#sha256=${hash};sha256=${other}`]),'E_DEPENDENCY_INTEGRITY_CONFLICT');
  rejected(userscript([`@require https://cdn.example/a.js#sha256=${hash}`,`@require https://cdn.example/a.js#sha256=${other}`]),'E_DEPENDENCY_INTEGRITY_CONFLICT');
  const repeated = parse(userscript([`@require https://cdn.example/a.js#sha256=${hash};sha256-${Buffer.from(hash,'hex').toString('base64')}`]));
  assert.equal(repeated.requires[0].integrity.length,2);
  assert.ok(hasCode(assess(repeated).warnings,'W_DEPENDENCY_INTEGRITY_DUPLICATE'));
  assert.equal(assess(repeated).status,'needs-review');
});

test('weak integrity does not masquerade as verified SRI; mixed declarations keep strong requirements',()=>{
  const md5 = digest('md5').toString('hex'), sha256 = digest('sha256').toString('hex');
  rejected(userscript([`@require https://cdn.example/a.js#md5=${md5}`]),'E_DEPENDENCY_INTEGRITY_UNSUPPORTED');
  const mixed = parse(userscript([`@require https://cdn.example/a.js#md5=${md5},sha256=${sha256}`]));
  assert.equal(assess(mixed).status,'needs-review');
  assert.ok(hasCode(assess(mixed).warnings,'W_DEPENDENCY_WEAK_INTEGRITY'));
  assert.equal(mixed.requires[0].integrity.length,2);
});

test('relative dependencies use actual importer provenance, never a page URL or @downloadURL',()=>{
  const source = userscript(['@downloadURL https://fake.example/user.js','@require ../lib/helper.js']);
  const unresolved = rejected(source,'E_DEPENDENCY_BASE_URL');
  assert.equal(unresolved.requires[0].url,null);
  const parsed = parse(source,{importSourceUrl:'https://actual.example/scripts/v1/program.user.js#old'});
  assert.equal(parsed.importSourceUrl,'https://actual.example/scripts/v1/program.user.js');
  assert.equal(parsed.requires[0].url,'https://actual.example/scripts/lib/helper.js');
  assert.equal(parsed.requires[0].originalUrl,'../lib/helper.js');
  assert.equal(assess(parsed).status,'needs-review');
  assert.ok(hasCode(assess(parsed).warnings,'W_UPDATE_NOT_IMPLEMENTED'));
  for (const address of ['http://example.com/a.js','file:///tmp/a.js','javascript:alert(1)',
    'https://u:p@example.com/a.js','https://example.com\\@attacker.example/a.js','https://example.com/a.js extra'])
    rejected(userscript(['@require ' + address]),'E_DEPENDENCY_URL');
  const invalidOrigin = parse(source,{importSourceUrl:'https://user:secret@example.com/source.js'});
  assert.ok(hasCode(invalidOrigin.diagnostics,'E_IMPORT_SOURCE'));
});

test('unsupported grants/resources/directives do not prevent import or hide later dependencies',()=>{
  const source = userscript(['@name:zh-CN 可导入','@grant GM_xmlhttpRequest',
    '@resource css ./style.css','@connect example.com','@unknown-runtime-mode true',
    '@require https://cdn.example/last.js']);
  const parsed = parse(source);
  assert.equal(parsed.directives.length,6);
  assert.equal(parsed.resources[0].name,'css');
  assert.equal(parsed.requires[0].url,'https://cdn.example/last.js');
  const assessment = assess(parsed,{dependenciesLocked:true});
  for (const code of ['E_GRANT_UNSUPPORTED','E_RESOURCE_UNSUPPORTED','E_METADATA_UNSUPPORTED'])
    assert.ok(hasCode(assessment.blockers,code));
  for (const line of ['@include *','@exclude /secret/','@sandbox DOM','@unwrap','@top-level-await',
    '@run-in normal-tabs','@webRequest []','@inject-into auto','@inject-into page','@world MAIN'])
    assert.equal(assess(parse(userscript([line]))).status,'unsupported',line);
  const isolated = assess(parse(userscript(['@grant none','@inject-into content'])));
  assert.equal(isolated.status,'executable');
  assert.equal(isolated.nativeOptions.world,'USER_SCRIPT');
  assert.ok(hasCode(isolated.warnings,'W_USER_SCRIPT_ISOLATION'));
  rejected(userscript(['@grant none','@grant GM_getValue']),'E_GRANT_CONFLICT');
});

test('entry modes remain explicit and native match/frame/timing mappings are inspectable',()=>{
  const source = userscript(['@match *://*.example.com/*','@exclude-match https://example.com/private/*',
    '@run-at document-start','@noframes'],'(function(){document.title="classic";})();');
  const parsed = parse(source);
  for (const entryFormat of ['classic-userscript','async-main']) {
    // This layer inspects metadata, not JavaScript main() syntax; no conversion occurs.
    const admission = assess(parsed,{entryFormat,phase:'registration'});
    assert.equal(admission.status,'executable');
    assert.deepEqual(admission.nativeOptions,{matches:['*://*.example.com/*'],
      excludeMatches:['https://example.com/private/*'],runAt:'document_start',allFrames:false,world:'USER_SCRIPT'});
  }
  assert.equal(parsed.runAt,'document-start');
  const defaults = assess(parse(userscript(['@match https://*/*'])));
  assert.equal(defaults.nativeOptions.allFrames,true);
  assert.equal(defaults.nativeOptions.runAt,'document_idle');
  assert.ok(hasCode(defaults.warnings,'W_RUN_AT_DEFAULT'));
  assert.ok(hasCode(defaults.warnings,'W_PREVIEW_TIMING'));
  for (const pattern of ['https://example.com:8080/*','http://localhost:*/*','http://[::1]:43111/*'])
    assert.equal(assess(parse(userscript(['@match ' + pattern]))).status,'executable');
  rejected(source,'E_ENTRY_FORMAT',{entryFormat:'esm'});
  const withoutMatch = assess(parse(userscript(['@name Preview only'])),{phase:'registration'});
  assert.equal(withoutMatch.status,'executable');
  assert.deepEqual(withoutMatch.nativeOptions.matches,['*://*/*']);
  assert.equal(withoutMatch.nativeOptions.allFrames,false);
  assert.ok(hasCode(withoutMatch.warnings,'W_MATCH_DEFAULT'));
  assert.deepEqual(assess(parse('console.log(1)'),{phase:'registration'}).nativeOptions.matches,['*://*/*']);
  for (const pattern of ['<all_urls>','file:///*','https://example.com:65536/*','https://example.com:abc/*','https://example.*/*','https://user@example.com/*'])
    rejected(userscript(['@match ' + pattern]),'E_PAGE_MATCH');
  rejected(userscript(['@run-at document-body']),'E_RUN_AT_UNSUPPORTED');
  rejected(userscript(['@run-at document-start','@run-at document-end']),'E_METADATA_CONFLICT');
  rejected(userscript(['@noframes false']),'E_METADATA_VALUE');
});

test('large valid headers no longer fail at 64 lines or 8 dependencies; real bounds fail closed with import diagnostics',()=>{
  const large = [...Array.from({length:90},(_,i) => '@description line ' + i),
    ...Array.from({length:12},(_,i) => '@require https://cdn.example/' + i + '.js')];
  const parsed = parse(userscript(large));
  assert.equal(parsed.requires.length,12);
  assert.equal(assess(parsed).status,'needs-review');
  const tooMany = Array.from({length:USER_SCRIPT_METADATA_LIMITS.requireCount + 1},(_,i) => '@require https://cdn.example/' + i + '.js');
  assert.equal(rejected(userscript(tooMany),'E_DEPENDENCY_LIMIT').requires.length,65);
  rejected(userscript(['@description '+'大'.repeat(24000)]),'E_METADATA_LIMIT');
  rejected('// ==UserScript==\n// @name Unclosed','E_METADATA_HEADER');
  rejected('// ==UserScript==\nconst code = 1;\n// @require https://cdn.example/a.js\n// ==/UserScript==','E_METADATA_HEADER');
});
