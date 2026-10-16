import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {COOKIE_EDITOR_UPGRADE_FROM,verifyCookieEditorUpgradeBaseline} from '../framework/cookie-editor-upgrade-contract.mjs';

const driver=fileURLToPath(new URL('../framework/cookie-editor-r33-native.mjs',import.meta.url));
function plan(cases,stage='import-export'){
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith('COOKIE_NATIVE_'))delete env[key];
  env.COOKIE_NATIVE_STAGE=stage;
  if(cases!==undefined)env.COOKIE_NATIVE_CASES=cases;
  return spawnSync(process.execPath,[driver,'--list-cases'],{env,encoding:'utf8'});
}
test('core and upgrade list-cases disclose their actual work before browser configuration',()=>{
  const core=plan(undefined,'');assert.equal(core.status,0,core.stderr);
  const c=JSON.parse(core.stdout);
  assert(c.selected.includes('new-cookie'));
  assert(c.selected.includes('exact-delete'));
  assert(c.selected.includes('explicit-empty-value'));
  assert(c.prerequisites.includes('official-install'));
  const upgrade=plan(undefined,'upgrade');assert.equal(upgrade.status,0,upgrade.stderr);
  const u=JSON.parse(upgrade.stdout);
  assert.deepEqual(u.selected,['upgrade-preservation-baseline','explicit-upgrade','upgraded-tool-save-and-delete']);
  assert(u.prerequisites.includes('first-use-combined-grant'));
  assert(!u.excluded.includes('upgrade'));
});
test('a selected JSON import plans without browser paths, seed CRUD or a sensitive grant',()=>{
  const result=plan('import-json-auto');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.deepEqual(data.selected,['import-json-auto']);
  assert(!data.prerequisites.includes('gap-seed-import'));assert.equal(data.valuesGrant,false);
  assert(data.excluded.includes('continuous-CRUD'));assert(data.excluded.includes('observe'));
  assert(data.excluded.includes('clear'));assert(data.excluded.includes('lifecycle'));
});
test('metadata export needs the shared UI import but never a sensitive grant',()=>{
  const result=plan('export-metadata-json');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert(data.prerequisites.includes('gap-seed-import'));
  assert.equal(data.valuesGrant,false);assert.deepEqual(data.selected,['export-metadata-json']);
});
test('sensitive denial precedes the grant when combined with a value export',()=>{
  const result=plan('export-header,export-sensitive-denied');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.equal(data.valuesGrant,true);
  assert.deepEqual(data.selected,['export-sensitive-denied','export-header']);
});
test('unknown and empty case filters fail before native configuration',()=>{
  for(const filter of ['export-typo','',',export-json']){
    const result=plan(filter);assert.notEqual(result.status,0);assert.match(result.stderr,/Unknown COOKIE_NATIVE_CASES/);
    assert(!result.stderr.includes('COOKIE_NATIVE_EXTENSION is required'));
  }
});
test('duplicate filters and filters on a broad legacy stage are rejected',()=>{
  assert.match(plan('export-json,export-json').stderr,/Duplicate COOKIE_NATIVE_CASES/);
  assert.match(plan('export-json','advanced').stderr,/COOKIE_NATIVE_CASES requires import-export/);
});
test('unknown stages fail instead of reporting an empty native suite as complete',()=>{
  const result=plan(undefined,'improt-export');assert.notEqual(result.status,0);
  assert.match(result.stderr,/Unknown COOKIE_NATIVE_STAGE/);
});

test('R4.8 real clipboard cases preserve metadata-only access and sensitive-value authority',()=>{
  const metadata=plan('export-copy-metadata-json,export-metadata-json');
  assert.equal(metadata.status,0,metadata.stderr);
  const m=JSON.parse(metadata.stdout);
  assert.deepEqual(m.selected,['export-copy-metadata-json','export-metadata-json']);
  assert.equal(m.valuesGrant,false);
  assert(m.prerequisites.includes('gap-seed-import'));

  const backup=plan('export-sensitive-denied,export-copy-sensitive-json,export-json');
  assert.equal(backup.status,0,backup.stderr);
  const b=JSON.parse(backup.stdout);
  assert.deepEqual(b.selected,['export-sensitive-denied','export-copy-sensitive-json','export-json']);
  assert.equal(b.valuesGrant,true,'Native value copy and download require an independent grant');
  assert(b.selected.indexOf('export-sensitive-denied')<b.selected.indexOf('export-copy-sensitive-json'));
});

test('R4.10 native case driver uses real approved metadata toggle and inline discard',async()=>{
  const source=await readFile(driver,'utf8');
  assert.match(source,/async function chooseExportMetadata\(metadata\)/);
  assert.match(source,/#live-export-metadata/);
  assert.match(source,/#editor-discard-confirm/);
  assert.match(source,/\.cookie-row-meta'\)\?\.textContent===/);
  assert.match(source,/action==='删除 Cookie'\?'#editor-delete'/);
  assert.doesNotMatch(source,/await click\(toolSession,'#live-export-content'\)/,
    'hidden legacy dropdown cannot receive trusted Chrome clicks');
  assert.match(source,/document.querySelector\("#live-export-content"\).value'\),'backup'/);
});

test('R4.10.2 upgrade verifies historical 2.0.15 bytes, same ID and unchanged capabilities',async()=>{
  const candidateConfig=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/cookie-editor/tool.config.json',import.meta.url),'utf8'));
  assert.equal(candidateConfig.version,'2.0.17');
  assert.equal(COOKIE_EDITOR_UPGRADE_FROM.version,'2.0.15');
  assert.equal(COOKIE_EDITOR_UPGRADE_FROM.sha256,
    'f6aa6d83533dba166497fce2d37b6ee2a358c102b3f85b63ce8c6a62d6fb64ce');
  // Synthetic bytes exercise only the pure preflight; they cannot pass the
  // historical digest or substitute for real installed/native evidence.
  const old={format:'opendesk.sidebar-tool.v2',id:'cookie-editor',version:'2.0.15',
    capabilities:candidateConfig.capabilities};
  const bytes=value=>Buffer.from(JSON.stringify(value));
  const hash=data=>createHash('sha256').update(data).digest('hex');
  const verify=(value,candidate=candidateConfig,version=value.version)=>
    verifyCookieEditorUpgradeBaseline(bytes(value),candidate,{version,sha256:hash(bytes(value))});
  assert.deepEqual(verify(old),{id:'cookie-editor',version:'2.0.15',sha256:hash(bytes(old))});
  assert.throws(()=>verifyCookieEditorUpgradeBaseline(bytes(old),candidateConfig),/historical release/);
  assert.throws(()=>verify({...old,id:'another-tool'}),/same tool ID/);
  assert.throws(()=>verify({...old,format:'other'}),/opendesk.sidebar-tool.v2/);
  assert.throws(()=>verify(old,{...candidateConfig,version:'2.0.15'}),/must be newer/);
  assert.throws(()=>verify(old,{...candidateConfig,version:'2.0.14'}),/must be newer/);
  assert.throws(()=>verify(old,{...candidateConfig,capabilities:[...old.capabilities,'browser.cookies.extra']}),/must not silently change/);
  assert.throws(()=>verify({...old,version:'02.0.15'},candidateConfig,'02.0.15'),/numeric semver/);
  const source=await readFile(driver,'utf8');
  assert.doesNotMatch(source,/old\.version,'2\.0\.3'/);
  assert.match(source,/upgrade-preservation-baseline/);
});

test('R4.10.2 explicit upgrade and all stages cannot silently run only generic CRUD',()=>{
  const upgrade=plan(undefined,'upgrade');assert.equal(upgrade.status,0,upgrade.stderr);
  assert.equal(JSON.parse(upgrade.stdout).suite,'extended');
  const full=plan(undefined,'all');assert.equal(full.status,0,full.stderr);
  assert.equal(JSON.parse(full.stdout).suite,'extended');
  const source=readFile(driver,'utf8');
  return source.then(text=>{
    assert.match(text,/upgrade-preservation-baseline','explicit-upgrade','upgraded-tool-save-and-delete'/);
    assert.match(text,/upgrade steps must all pass before acceptance/);
  });
});

test('native evidence omits assertion payloads and redacts Cookie values in final output',async()=>{
  const source=await readFile(driver,'utf8');
  const helpers=source.slice(source.indexOf('const evidenceJson='),source.indexOf('const persist='));
  const api=runInNewContext(helpers+';({evidenceJson,evidenceError})');
  const secret='FICTIONAL_COOKIE_PAYLOAD_FOR_EVIDENCE_TEST';
  const error={code:'ERR_ASSERTION',stack:'AssertionError: '+secret+'\n    at nativeCase (driver.mjs:1:1)'};
  const result=api.evidenceJson({cookies:[{name:'example',value:secret}],error:api.evidenceError(error)});
  assert(!result.includes(secret));assert(result.includes('driver.mjs:1:1'));
  assert.match(source,/console\.log\(evidenceJson\(/);
  assert.match(source,/\['text','value','expression'\]\.includes\(key\)/);
});

test('R4.10.2 native upgrade validates chosen Mac file digest, not just its version label',async()=>{
  const source=await readFile(driver,'utf8');
  assert.match(source,/preview\.source\?\.includes\('候选包 SHA-256（规范序列化）：'\+upgradeBaseline\.sha256\)/);
  assert.match(source,/verifyCookieEditorUpgradeBaseline\(await readFile\(upgradeOldFile\),pkg\)/);
  assert.doesNotMatch(source,/COOKIE_NATIVE_OLD_(?:VERSION|TOOL_SHA256)/,
    'Native upgrade must accept only the pinned and reviewed historical 2.0.15 package');
});
