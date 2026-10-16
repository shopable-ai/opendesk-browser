import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {COOKIE_EDITOR_UPGRADE_FROM,verifyCookieEditorUpgradeBaseline} from '../framework/cookie-editor-upgrade-contract.mjs';

const driver=fileURLToPath(new URL('../framework/cookie-editor-r33-native.mjs',import.meta.url));
function plan(cases,stage='import-export',extraEnv={}){
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith('COOKIE_NATIVE_'))delete env[key];
  env.COOKIE_NATIVE_STAGE=stage;
  if(cases!==undefined)env.COOKIE_NATIVE_CASES=cases;
  Object.assign(env,extraEnv);
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

test('development mode is explicit, non-production and limited to exact repo output',async()=>{
  const development=plan('import-json-file','import-export',{COOKIE_NATIVE_MODE:'development'});
  assert.equal(development.status,0,development.stderr);
  const selected=JSON.parse(development.stdout);
  assert.equal(selected.mode,'development');assert.equal(selected.productionAcceptance,false);
  assert.equal(selected.candidateProfile,'one-development-one-fresh-profile');
  assert.equal(selected.siteGrantCount,1);assert.equal(selected.valuesGrant,false);
  const production=plan('import-json-file');assert.equal(production.status,0,production.stderr);
  const defaults=JSON.parse(production.stdout);
  assert.equal(defaults.mode,'production');assert.equal(defaults.productionAcceptance,true);
  assert.equal(defaults.candidateProfile,'one-production-one-fresh-profile');
  assert.match(plan('import-json-file','import-export',{COOKIE_NATIVE_MODE:'dev'}).stderr,/Unknown COOKIE_NATIVE_MODE/);
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function assertExtensionMode('),source.indexOf('const canonicalFixture='));
  const validate=runInNewContext(helper+';assertExtensionMode',{assert,path});
  const repo=fileURLToPath(new URL('../../',import.meta.url)),dev=path.join(repo,'dist/development');
  assert.doesNotThrow(()=>validate(dev,repo,'development'));
  assert.throws(()=>validate(dev,repo,'production'),/Daily development extension/);
  assert.throws(()=>validate('/independent/dist/development',repo,'development'),/exact repo/);
  assert.throws(()=>validate(path.join(dev,'child'),repo,'development'),/exact repo/);
  assert.throws(()=>validate('/independent/dist/production',repo,'development'),/exact repo/);
  assert.throws(()=>validate('/independent/dist/development',repo,'production'),/Daily development extension/);
  assert.doesNotThrow(()=>validate('/independent/dist/production',repo,'production'));
  assert.match(source,/assertExtensionMode\(await realpath\(extension\),await realpath\(root\),nativeMode\)/);
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
  assert.match(candidateConfig.version,/^\d+\.\d+\.\d+$/);
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
  const secret='FICTIONAL_COOKIE_PAYLOAD_FOR_EVIDENCE_TEST';
  const api=runInNewContext(helpers+';({evidenceJson,evidenceError})',{cookieValues:new Set([secret])});
  const error={code:'ERR_ASSERTION',stack:'AssertionError: '+secret+'\n    at nativeCase (driver.mjs:1:1)'};
  const result=api.evidenceJson({cookies:[{name:'example',value:secret}],status:'Untrusted status '+secret,error:api.evidenceError(error)});
  assert(!result.includes(secret));assert(result.includes('driver.mjs:1:1'));
  assert.match(source,/console\.log\(evidenceJson\(/);
  assert.doesNotMatch(source,/trace\.push\(entry\)/,'Raw CDP exceptions and command envelopes must not be stored');
  assert.match(source,/if\(!sampleMode\)await writeFile\(path\.join\(directory,'cdp-trace\.json'\)/);
});

test('short Cookie values preserve evidence hashes, paths, identities and error locations',async()=>{
  const source=await readFile(driver,'utf8');
  const helpers=source.slice(source.indexOf('const evidenceJson='),source.indexOf('const persist='));
  const api=runInNewContext(helpers+';({evidenceJson,evidenceError})',{cookieValues:new Set(['0','1'])});
  const metadata={sha256:'0a6bd6b289215b1239badc0dd0b69724c2512853328fb824d78ca56830cc9054',
    path:'/candidate-01/dist/production',startedAt:'2026-10-17T01:10:00.001Z',
    identity:{id:'cookie-editor',version:'2.0.19',storeId:'0',partitionKey:{topLevelSite:'https://example1.test'}}};
  const error=api.evidenceError({code:'ERR_ASSERTION',stack:'AssertionError: 0 !== 1\n    at nativeCase (driver.mjs:101:10)'});
  const result=JSON.parse(api.evidenceJson({metadata,error,cookies:[{value:'0'},{value:'1'}],
    status:'Cookie value 0 / 1',message:'Cookie value 1',messages:['Cookie value 0']}));
  assert.deepEqual(result.metadata,metadata);
  assert.equal(result.error,'ERR_ASSERTION\n    at nativeCase (driver.mjs:101:10)');
  assert.deepEqual(result.cookies,[{value:'[REDACTED_COOKIE_VALUE]'},{value:'[REDACTED_COOKIE_VALUE]'}]);
  assert(!/[01]/.test(result.status+result.message+result.messages.join('')));
});

test('file inputs click the left native button with stable hit tests and trusted Input',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('async function click('),source.indexOf('async function type('));
  for(const type of ['file','text']){
    const events=[],rect={x:27,y:223,width:306,height:22.5};
    let blocked=false,hitTests=0;
    const input={type,disabled:false,getClientRects:()=>[rect],getBoundingClientRect:()=>rect,
      contains:target=>target===input};
    const frame={getBoundingClientRect:()=>({x:10,y:100})};
    const documentFor=session=>({querySelector:()=>session==='tool'?input:frame,
      elementFromPoint:()=>{hitTests++;return blocked?{}:session==='tool'?input:frame;}});
    const click=runInNewContext(helper+';click',{
      quote:JSON.stringify,toolSession:'tool',side:'side',sampleMode:true,guard:()=>{},sleep:async()=>{},
      read:async(session,expression)=>runInNewContext(expression,{document:documentFor(session),innerWidth:500,innerHeight:700}),
      until:async fn=>{for(let attempt=0;attempt<4;attempt++){const point=await fn();if(point)return point;}throw Error('Unsettled hit test');},
      client:{send:async(method,params,session)=>events.push({method,params:{...params},session})},
    });
    await click('tool','#import-file');
    const x=type==='file'?61:190,y=334.25;
    assert.deepEqual(events,['mousePressed','mouseReleased'].map(event=>({method:'Input.dispatchMouseEvent',
      params:{type:event,x,y,button:'left',clickCount:1},session:'side'})));
    assert(hitTests>=4,'Both iframe and Host must pass two stable native hit tests');
    blocked=true;events.length=0;
    await assert.rejects(click('tool','#import-file'),/Unsettled hit test/);
    assert.equal(events.length,0,'An obstructed file input must receive no native click');
  }
});

test('native confirmation scrolling avoids nested preview scroll areas',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('async function click('),source.indexOf('async function type('));
  const events=[];let frameY=100;
  const input={type:'button',disabled:false,getClientRects:()=>[{}],
    getBoundingClientRect:()=>({x:180,y:800,width:120,height:24}),contains:node=>node===input};
  const frame={getBoundingClientRect:()=>({x:0,y:frameY})};
  const click=runInNewContext(helper+';click',{
    quote:JSON.stringify,toolSession:'tool',side:'side',sampleMode:true,guard:()=>{},sleep:async()=>{},
    read:async(session,expression)=>runInNewContext(expression,{innerWidth:500,innerHeight:session==='tool'?1200:700,
      document:{querySelector:()=>session==='tool'?input:frame,elementFromPoint:()=>session==='tool'?input:frame}}),
    until:async fn=>{for(let attempt=0;attempt<8;attempt++){const point=await fn();if(point)return point;}throw Error('Nested preview consumed scroll');},
    client:{send:async(method,params)=>{events.push({...params});if(params.type==='mouseWheel'&&params.x===488)frameY-=300;}},
  });
  await click('tool','#live-import-confirm');
  assert.equal(events[0].type,'mouseWheel');assert.equal(events[0].x,488);
  assert.deepEqual(events.slice(1).map(e=>e.type),['mousePressed','mouseReleased']);
});
test('R4.10.2 native upgrade validates chosen Mac file digest, not just its version label',async()=>{
  const source=await readFile(driver,'utf8');
  assert.match(source,/preview\.source\?\.includes\('候选包 SHA-256（规范序列化）：'\+upgradeBaseline\.sha256\)/);
  assert.match(source,/verifyCookieEditorUpgradeBaseline\(await readFile\(upgradeOldFile\),pkg\)/);
  assert.doesNotMatch(source,/COOKIE_NATIVE_OLD_(?:VERSION|TOOL_SHA256)/,
    'Native upgrade must accept only the pinned and reviewed historical 2.0.15 package');
});

test('R4.10.3 focused smoke uses one site grant, an editor write and a real file import',()=>{
  const result=plan(undefined,'smoke');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.deepEqual(data.selected,['new-cookie','import-json-file']);
  assert(data.prerequisites.includes('first-use-combined-grant'));
  assert(!data.prerequisites.includes('gap-seed-import'));
  assert.deepEqual(data.cleanup,['gap-cleanup']);
});

test('bulk, file, overwrite and skipped-row imports share one candidate/Profile and site authorization',()=>{
  const result=plan('import-json-bulk,import-json-file,import-overwrite,import-skipped-rows');
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.deepEqual(data.selected,['import-json-bulk','import-json-file','import-overwrite','import-skipped-rows']);
  assert.equal(data.siteGrantCount,1);
  assert.deepEqual(data.sdkBatchPolicy,{maxItems:50,maxPayloadBytes:11500,sameStorePartition:true,approvalCount:'native-confirmation-plan'});
  assert.equal(data.candidateProfile,'one-production-one-fresh-profile');
  assert.equal(data.valuesGrant,false);assert(data.prerequisites.includes('gap-seed-import'));
});

test('sensitive baseline file/paste preview selection is explicit and never includes cleanup mutations',()=>{
  const cases='import-sample-file-preview,import-sample-paste-preview';
  const result=plan(cases,'import-export',{COOKIE_NATIVE_TARGET:'https://chatgpt.com/'});
  assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);
  assert.deepEqual(data.selected,cases.split(','));assert.deepEqual(data.cleanup,[]);
  assert(!data.prerequisites.includes('gap-seed-import'));assert.equal(data.valuesGrant,false);
  assert.notEqual(plan(cases).status,0,'Sensitive samples must never run on the fictional fixture');
  assert.notEqual(plan(cases+',import-json-file','import-export',{COOKIE_NATIVE_TARGET:'https://chatgpt.com/'}).status,0);
  const defaults=plan();assert.equal(defaults.status,0,defaults.stderr);
  assert(!JSON.parse(defaults.stdout).selected.some(id=>id.startsWith('import-sample-')));
});

test('import-invalid preserves malformed input then corrects the same textarea before native verification',async()=>{
  const source=await readFile(driver,'utf8');
  const start=source.indexOf("else if(id==='import-invalid')"),end=source.indexOf("else if(id==='import-preview-input-change')",start);
  const branch=source.slice(start,end),previewHelper=source.slice(source.indexOf('function importPreviewSummary('),source.indexOf('function importBatchApprovalCount('));
  async function exercise(errorState=true,errorText='导入格式错误：JSON 格式错误；输入已保留，可修改后重新预览。'){
    const events=[],typed=[],textarea={value:''},preview={hidden:true,textContent:'共 1 条 · 可导入 1 · 新增 1 · 覆盖 0 · 已过期 0 · 无效 0'};
    const nodes={'#import-text':textarea,'#status':{textContent:errorText,dataset:{state:errorState?'error':'info'}},
      '#live-import-confirm':{hidden:true},'#confirm-panel':{hidden:true},'#sidebar-tool-action-review':{hidden:true},
      '#live-import-preview':preview,'.import-advanced':{open:false}};
    let result;
    await runInNewContext(previewHelper+';(async()=>{if(false){} '+branch+'})()',{
      assert,id:'import-invalid',toolSession:'tool',side:'side',
      step:async(id,fn)=>{result=await fn();},cookies:async()=>[],row:(name,value)=>({name,value}),
      dismissImport:async()=>events.push('dismiss'),selectOption:async()=>{},
      read:async(session,expression)=>runInNewContext(expression,{document:{querySelector:selector=>nodes[selector]}}),
      type:async(selector,text)=>{assert.equal(selector,'#import-text');typed.push(text);textarea.value=text;},
      click:async(session,selector)=>{events.push(selector);
        if(selector==='.import-advanced > summary')nodes['.import-advanced'].open=true;
        if(selector==='#import-apply'&&textarea.value!=='{invalid'){
          assert.equal(JSON.parse(textarea.value).length,1);preview.hidden=false;nodes['#live-import-confirm'].hidden=false;
        }},
      until:async fn=>{const value=await fn();assert(value,'Expected concrete error or corrected preview');return value;},
      confirmImport:async rows=>{events.push('native-verify');assert.equal(rows.length,1);
        assert.equal(JSON.stringify(rows),textarea.value);return {verifiedRows:1,nativeReadOnly:true};},
    });
    assert.equal(typed.length,2);assert.equal(typed[0],'{invalid');
    assert.equal(events.filter(event=>event==='#live-import').length,1);
    assert.equal(events.filter(event=>event==='dismiss').length,1);
    assert.equal(events.filter(event=>event==='#import-apply').length,2);
    assert.equal(events.at(-1),'native-verify');
    assert.equal(result.verifiedRows,1);assert.equal(result.inputPreserved,true);
    assert(!JSON.stringify(result).includes(JSON.parse(typed[1])[0].value),'Evidence contains metadata, not corrected payload');
  }
  await exercise();
  await assert.rejects(exercise(false),/Expected concrete error/);
  await assert.rejects(exercise(true,'预检失败'),/Expected concrete error/);
});

test('sample key observation tolerates active-site changes and isolates exact absent identities',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function importCookieIdentity('),source.indexOf('function importPreviewSummary('));
  const {createdImportKeyCount:count}=runInNewContext(helper+';({createdImportKeyCount})',{assert});
  const row={name:'synthetic_sample',domain:'.chatgpt.com',path:'/',storeId:'0',hostOnly:false};
  const existing={...row,name:'synthetic_existing',value:'fictional-before'};
  const before=[existing],after=[{...existing,value:'fictional-site-change'},
    {...row,name:'unrelated_site_cookie'},{...row,path:'/other'},{...row,storeId:'1'},
    {...row,partitionKey:{topLevelSite:'https://other.test'}}];
  assert.equal(count([row,existing],before,after,'chatgpt.com'),0);
  assert.equal(count([row],before,[...after,row],'chatgpt.com'),1);
  assert.equal(count([existing],before,[{...existing,value:'fictional-new'}],'chatgpt.com'),0,'Existing expired-key changes belong to the active site');
  assert.equal(count([{...row,partitionKey:{topLevelSite:'https://chatgpt.com'}}],[],
    [{...row,partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}}],'chatgpt.com'),1);
  const branch=source.slice(source.indexOf('if(sampleCases.includes(id))'),source.indexOf("if(id==='import-json-bulk')"));
  assert.doesNotMatch(branch,/assert\.deepEqual\(await cookies\(\),before|select\(after\),select\(before\)/);
  assert.match(branch,/siteCookieCountBefore:before\.length,siteCookieCountAfter:previewCookies\.length,previewCreatedSampleKeys/);
});

test('sample preview snapshots native identities after file selection and before preview',async()=>{
  const source=await readFile(driver,'utf8');
  const branch=source.slice(source.indexOf('if(sampleCases.includes(id))'),source.indexOf("if(id==='import-json-bulk')"));
  const baseline=branch.indexOf('const before=await cookies();');
  assert(baseline>branch.indexOf('Exact authorized sample in memory'));
  assert(baseline<branch.indexOf("await click(toolSession,'#import-apply')"));
  assert.equal(branch.match(/const before=await cookies\(\)/g)?.length,1);
});
test('sample native readback requires an exact observed write before a later value change',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function importCookieIdentity('),source.indexOf('function importPreviewSummary('));
  const verify=runInNewContext(helper+';sampleNativeImportReadback',{assert});
  const row={name:'sample',value:'fictional-import',domain:'chatgpt.com',path:'/',hostOnly:true,
    secure:false,httpOnly:false,sameSite:'unspecified',session:true};
  const changed={...row,value:'fictional-later'};
  const event={at:1001,removed:false,cookie:row};
  assert.equal(verify([row],[changed],[event],'chatgpt.com',1000,1002).subsequentlyChangedRows,1);
  assert.equal(verify([row],[row],[],'chatgpt.com',1000,1002).finalMatchingRows,1);
  for(const events of [[],[{...event,removed:true}],[{...event,at:999}],[{...event,cookie:changed}],
    [{...event,cookie:{...row,httpOnly:true}}]])
    assert.throws(()=>verify([row],[changed],events,'chatgpt.com',1000,1002));
});
test('sensitive sample execution never enters fictional fixture cleanup',async()=>{
  const source=await readFile(driver,'utf8');
  const start=source.indexOf("if(!sampleMode)await step('gap-cleanup'");
  assert(start>=0);
  const end=source.indexOf("if(stage==='visual')",start);
  const branch=source.slice(start,end).trim().replace(/\}\s*$/,'');
  const cases=[];
  await runInNewContext('(async()=>{'+branch+'})()',{
    sampleMode:true,step:async id=>cases.push(id),
  });
  assert.deepEqual(cases,[]);
});
test('native import attributes preserve explicit flags, defaults, session and Chrome expiry semantics',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function importCookieIdentity('),source.indexOf('function importPreviewSummary('));
  const verify=runInNewContext(helper+';assertImportedCookieAttributes',{assert});
  const input={domain:'.chatgpt.com',hostOnly:false,secure:true,httpOnly:true,sameSite:'lax',session:false,expirationDate:2000.123456};
  assert.doesNotThrow(()=>verify({...input,expirationDate:2000.1234561},input,'chatgpt.com',1000,1002));
  for(const [field,value] of Object.entries({hostOnly:true,secure:false,httpOnly:false,sameSite:'strict',session:true,expirationDate:2001}))
    assert.throws(()=>verify({...input,[field]:value},input,'chatgpt.com',1000,1002));
  const defaults={hostOnly:true,secure:false,httpOnly:false,sameSite:'unspecified',session:true};
  assert.doesNotThrow(()=>verify(defaults,{},'chatgpt.com',1000,1002));
  assert.doesNotThrow(()=>verify({...defaults,secure:true},{secure:true,session:true,expirationDate:3000},'chatgpt.com',1000,1002));
  assert.throws(()=>verify({...defaults,expirationDate:3000},{},'chatgpt.com',1000,1002));
  const lifetime=400*86400,capped={...input,expirationDate:lifetime+5000};
  assert.doesNotThrow(()=>verify({...input,expirationDate:lifetime+1001},capped,'chatgpt.com',1000,1002));
  assert.throws(()=>verify({...input,expirationDate:lifetime+1100},capped,'chatgpt.com',1000,1002));
  assert.match(source,/assertImportedCookieAttributes\(found,input,cookieDomain,beforeSet,afterSet\)/);
});

test('authorized sample expiry is recalculated from unchanged timestamps at the current time',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function inspectImportSample('),source.indexOf('function importPreviewSummary('));
  const inspect=runInNewContext(helper+';inspectImportSample',{assert});
  const rows=Array.from({length:30},(_,i)=>({name:'synthetic_'+i,value:'memory-only-'+i,
    ...(i<5?{session:false,expirationDate:i<3?500:1500}:{session:true})}));
  const text=JSON.stringify(rows),first=inspect(text,1000),later=inspect(text,2000);
  assert.equal(first.valid.length,27);assert.equal(first.expired.length,3);
  assert.equal(later.valid.length,25);assert.equal(later.expired.length,5);
  assert.equal(JSON.stringify(rows),text,'Classification never updates the sample expiration');
  assert.equal(inspect(text,250).expired.length,0);
});

async function importCoordinator(){
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('async function settleImportApprovals('),source.indexOf('function inspectImportSample('));
  return runInNewContext(helper+';settleImportApprovals',{assert});
}

test('batch confirmations follow the visible payload/scope plan rather than Cookie count',async()=>{
  const source=await readFile(driver,'utf8');
  const helper=source.slice(source.indexOf('function importBatchApprovalCount('),source.indexOf('function requireNativeResource('));
  const count=runInNewContext(helper+';importBatchApprovalCount',{assert});
  const expected=count('向 example.test 导入 27 条。系统自动分为 2 批，每批确认一次。',27);
  assert.equal(expected,2);
  assert.equal(count('系统自动分为 1 批',12),1,'Small >10-row payload may fit in one actual batch');
  assert.equal(count('系统自动分为 4 批',27),4,'Different Store/Partition may add batches');
  assert.throws(()=>count('未披露批次',27),/disclose/);
  assert.throws(()=>count('系统自动分为 0 批',27),/Invalid/);
  const settle=await importCoordinator();let approvals=0;
  const result=await settle({total:27,expectedApprovals:expected,pause:async()=>{},
    observe:async()=>approvals<expected?{review:true,busy:true,status:''}:
      {review:false,busy:false,status:'Chrome 已确认导入 27 条，跳过 3 条，正在刷新。'},
    approve:async()=>{approvals++;},cancel:async()=>assert.fail('No cancellation expected')});
  assert.equal(approvals,2);assert.equal(result.approvals,2);assert.equal(result.cancelled,false);
});

test('lost batch approval acknowledgement stops once without replay or automatic retry',async()=>{
  const settle=await importCoordinator();let approvals=0,observations=0;
  await assert.rejects(settle({total:12,expectedApprovals:2,pause:async()=>{},
    observe:async()=>{observations++;return {review:true,busy:true,status:''};},
    approve:async()=>{approvals++;throw Error('E_OUTCOME_UNKNOWN');},cancel:async()=>{}}),/E_OUTCOME_UNKNOWN/);
  assert.equal(approvals,1);assert.equal(observations,1);
});

test('cancelled second batch reads its actual confirmed row count and never approves the remainder',async()=>{
  const settle=await importCoordinator();let approvals=0,cancellations=0;
  const result=await settle({total:51,expectedApprovals:2,cancelAfter:1,pause:async()=>{},
    observe:async()=>cancellations?{review:false,busy:false,status:'真实导入已确认 37/51 条；其余停止'}:
      {review:true,busy:true,status:''},approve:async()=>{approvals++;},cancel:async()=>{cancellations++;}});
  assert.equal(approvals,1);assert.equal(cancellations,1);assert.equal(result.cancelled,true);
  assert.equal(result.confirmed,37,'Byte-limited batches need not contain exactly 50 records');
});
