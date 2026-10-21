import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as packages from '../../src/ui/sidebar-tools/package.js';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {installReviewedSidebarTool,recoverMarketOperation,sameSidebarToolPackage,
  MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {describeInstalledAppSource} from '../../src/ui/extension-center-model.js';

const digest=js=>createHash('sha256').update(js,'utf8').digest('hex');
const background=(js='void "background 中文";')=>({kind:'opendesk.app-service.v1',js,sha256:digest(js)});
const tool=(overrides={})=>({format:packages.SIDEBAR_TOOL_FORMAT_V2,id:'service-package-test',
  version:'1.0.0',title:'Service package contract',description:'Synthetic package fixture',
  capabilities:['browser.storage','browser.scheduler'],html:'<main>UI</main>',css:'',js:'void "UI";',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},background:background(),...overrides});
const legacy=()=>{const value=tool({format:packages.SIDEBAR_TOOL_FORMAT,capabilities:[]});
  for(const key of ['requires','contributes','background'])delete value[key];return value;};
const identity=candidate=>({marketId:'opendesk/'+candidate.id,
  sha256:digest(packages.serializeSidebarToolPackage(candidate)),operationId:randomUUID()});
function browser(initial={}){
  const values=structuredClone(initial),writes=[];
  const api={storage:{local:{
    async get(key){return {[key]:structuredClone(values[key])};},
    async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));},
    async remove(key){delete values[key];}
  }}};
  const lockManager={request:async(_name,work)=>work()};
  return {api,lockManager,values,writes};
}
const install=(state,candidate,extra={})=>installReviewedSidebarTool({...state,candidate,reviewApproved:true,...extra});

test('R1.4 optional background is strict v2 data with both existing capabilities; old packages stay valid',()=>{
  const candidate=tool();
  assert.deepEqual(packages.validateSidebarToolPackage(candidate),candidate);
  const oldV2=tool();delete oldV2.background;
  assert.deepEqual(packages.validateSidebarToolPackage(oldV2),oldV2);
  assert.equal(packages.validateSidebarToolPackage(legacy()).format,packages.SIDEBAR_TOOL_FORMAT);
  assert.throws(()=>packages.validateSidebarToolPackage({...legacy(),background:background()}),{code:'E_TOOL_SCHEMA'});
  for(const value of [null,[],{}, {...background(),kind:'worker'}, {...background(),sha256:'a'.repeat(63)},
    {...background(),sha256:'g'.repeat(64)}, {...background(),js:''}, {...background(),url:'https://example.com/service.js'},
    {...background(),js:'import x from "remote";'}, {...background(),js:'export default function main(){}'}]){
    assert.throws(()=>packages.validateSidebarToolPackage(tool({background:value})),{code:'E_TOOL_BACKGROUND'});
  }
  for(const capabilities of [[],['browser.storage'],['browser.scheduler'],['storage.local','browser.scheduler']])
    assert.throws(()=>packages.validateSidebarToolPackage(tool({capabilities})),{code:'E_TOOL_BACKGROUND'});
  assert.throws(()=>packages.validateSidebarToolPackage(tool({publisher:'official'})),{code:'E_TOOL_SCHEMA'});
});

test('R1.4 async verifier checks exact UTF-8 background bytes independently of UI JS',async()=>{
  assert.equal(typeof packages.verifySidebarToolBackground,'function');
  const candidate=tool();
  assert.deepEqual(await packages.verifySidebarToolBackground(candidate),candidate);
  const old=legacy();assert.deepEqual(await packages.verifySidebarToolBackground(old),old);
  const oldV2=tool();delete oldV2.background;
  assert.deepEqual(await packages.verifySidebarToolBackground(oldV2),oldV2);
  for(const value of [{...candidate.background,sha256:'0'.repeat(64)},
    {...candidate.background,sha256:digest(candidate.js)},
    {...candidate.background,js:candidate.background.js+'\n'}]){
    const changed=tool({background:value});
    assert.deepEqual(packages.validateSidebarToolPackage(changed),changed,'sync admission validates shape, not SHA content');
    await assert.rejects(packages.verifySidebarToolBackground(changed),{code:'E_TOOL_BACKGROUND_SHA'});
  }
});

test('R1.4 background retains source limits and consumes the existing complete-package budget',()=>{
  assert.doesNotThrow(()=>packages.validateSidebarToolPackage(tool({background:background('x'.repeat(220000))})));
  assert.throws(()=>packages.validateSidebarToolPackage(tool({background:background('x'.repeat(220001))})),{code:'E_TOOL_LIMIT'});
  assert.throws(()=>packages.validateSidebarToolPackage(tool({js:'x'.repeat(220001)})),{code:'E_TOOL_LIMIT'});
  assert.throws(()=>packages.validateSidebarToolPackage(tool({js:'x'.repeat(160000),background:background('x'.repeat(160000))})),{code:'E_TOOL_LIMIT'});
  // Non-ASCII source can fit the character limit while exceeding the UTF-8 package limit.
  assert.throws(()=>packages.validateSidebarToolPackage(tool({background:background('中'.repeat(110000))})),{code:'E_TOOL_LIMIT'});
  const candidate=tool({js:'x'.repeat(150000)}),base=Buffer.byteLength(packages.serializeSidebarToolPackage(candidate));
  candidate.background=background(candidate.background.js+'x'.repeat(320000-base));
  assert.equal(encodeSidebarToolPackage(candidate).length,320000);
  candidate.background=background(candidate.background.js+'x');
  assert.throws(()=>encodeSidebarToolPackage(candidate),/320 KB/);
});

test('R1.4 canonical identity includes background and ignores its property order',async()=>{
  const candidate=tool(),copy=structuredClone(candidate);
  copy.background={sha256:candidate.background.sha256,js:candidate.background.js,kind:candidate.background.kind};
  assert.equal(packages.serializeSidebarToolPackage(candidate),packages.serializeSidebarToolPackage(copy));
  assert.equal(await packages.sidebarToolPackageHash(candidate),await packages.sidebarToolPackageHash(copy));
  assert.equal(sameSidebarToolPackage(candidate,copy),true);
  const changed=tool({background:background('void "changed";')});
  assert.notEqual(await packages.sidebarToolPackageHash(candidate),await packages.sidebarToolPackageHash(changed));
  assert.equal(sameSidebarToolPackage(candidate,changed),false);
  const invalid=tool({background:{...background(),sha256:'0'.repeat(64)}});
  assert.notEqual(packages.serializeSidebarToolPackage(candidate),packages.serializeSidebarToolPackage(invalid));
  await assert.rejects(packages.sidebarToolPackageHash(invalid),{code:'E_TOOL_BACKGROUND_SHA'});
});

test('R1.4 async hash consumers retain canonical digests and reject bad background SHA without implying market trust',async()=>{
  const oldV2=tool();delete oldV2.background;
  for(const candidate of [legacy(),oldV2,tool()]){
    const pending=packages.sidebarToolPackageHash(candidate);
    assert.equal(typeof pending.then,'function');
    const expected=digest(packages.serializeSidebarToolPackage(candidate));
    assert.equal(await pending,expected,'legacy and background packages keep the canonical SHA contract');
    const local=await describeInstalledAppSource(candidate);
    assert.notEqual(local.kind,'market');assert.equal(local.sha256,expected);
    const record={marketId:'opendesk/'+candidate.id,version:candidate.version,sha256:expected};
    const market=await describeInstalledAppSource(candidate,record);
    assert.equal(market.kind,'market');assert.equal(market.sha256,expected);
    const mismatch=await describeInstalledAppSource(candidate,{...record,sha256:'0'.repeat(64)});
    assert.equal(mismatch.kind,'unverified');
  }
  const invalid=tool({background:{...background(),sha256:'0'.repeat(64)}});
  await assert.rejects(describeInstalledAppSource(invalid,{
    marketId:'opendesk/'+invalid.id,version:invalid.version,sha256:digest(packages.serializeSidebarToolPackage(invalid))
  }),{code:'E_TOOL_BACKGROUND_SHA'});
});

test('R1.4 packer reads separate files.background, pins SHA, rejects v1 and source path/size escapes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-service-package-'));
  const outside=await mkdtemp(join(tmpdir(),'opendesk-service-outside-'));
  t.after(()=>Promise.all([rm(root,{recursive:true,force:true}),rm(outside,{recursive:true,force:true})]));
  const candidate=tool(),meta={format:candidate.format,id:candidate.id,version:candidate.version,
    title:candidate.title,description:candidate.description,capabilities:candidate.capabilities,
    requires:candidate.requires,contributes:candidate.contributes,
    files:{html:'index.html',css:'style.css',js:'main.js',background:'service.js'}};
  const config=value=>writeFile(join(root,'tool.config.json'),JSON.stringify(value));
  await Promise.all([writeFile(join(root,'index.html'),candidate.html),writeFile(join(root,'style.css'),candidate.css),
    writeFile(join(root,'main.js'),candidate.js),writeFile(join(root,'service.js'),candidate.background.js)]);
  await config(meta);
  const packed=await createSidebarToolPackage(root);
  assert.deepEqual(packed.background,candidate.background);assert.equal(packed.js,candidate.js);
  await packages.verifySidebarToolBackground(packed);
  await config({...meta,files:{...meta.files,background:'../escape.js'}});
  await assert.rejects(createSidebarToolPackage(root),/relative path/);
  await writeFile(join(outside,'escape.js'),'void 0;');await symlink(join(outside,'escape.js'),join(root,'escape.js'));
  await config({...meta,files:{...meta.files,background:'escape.js'}});
  await assert.rejects(createSidebarToolPackage(root),/symlink escaped/);
  await config(meta);await writeFile(join(root,'service.js'),'中'.repeat(73334));
  await assert.rejects(createSidebarToolPackage(root),/source file exceeds budget/);
  await writeFile(join(root,'service.js'),candidate.background.js);
  const v1={id:meta.id,version:meta.version,title:meta.title,description:meta.description,capabilities:[],files:meta.files};
  await config(v1);await assert.rejects(createSidebarToolPackage(root),/v2/);
  await config({...meta,background:background()});await assert.rejects(createSidebarToolPackage(root),/tool.config/);
  const files={...meta.files};delete files.background;await config({...meta,files});
  assert.equal((await createSidebarToolPackage(root)).background,undefined);
});

for(const source of ['local-reviewed','market']){
  test(`R1.4 ${source} installation refuses bad background SHA before writes or intent consumption`,async()=>{
    const state=browser(),candidate=tool({background:{...background(),sha256:'0'.repeat(64)}});
    let consumed=0;
    await assert.rejects(install(state,candidate,{...(source==='market'?{market:identity(candidate)}:{}),
      commitIntent:()=>{consumed++;}}),{code:'E_TOOL_BACKGROUND_SHA'});
    assert.deepEqual(state.values,{});assert.deepEqual(state.writes,[]);assert.equal(consumed,0);
  });
  test(`R1.4 ${source} install/upgrade rotates generation, canonical noop and cancellation preserve it`,async()=>{
    const state=browser(),candidate=tool(),market=source==='market';
    state.values[TOOL_REVOCATION_EPOCHS_STORE]={'peer-tool':'peer-generation'};
    await install(state,candidate,market?{market:identity(candidate)}:{});
    const first=state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id];assert.equal(typeof first,'string');assert.ok(first);
    assert.equal(state.values[TOOL_REVOCATION_EPOCHS_STORE]['peer-tool'],'peer-generation');
    const registryWrite=state.writes.find(row=>Object.hasOwn(row,packages.SIDEBAR_TOOL_STORE));
    assert.equal(registryWrite[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],first,'package and generation share one write');
    const reordered=structuredClone(candidate);reordered.background={sha256:background().sha256,js:background().js,kind:background().kind};
    assert.equal((await install(state,reordered,{baseline:candidate,...(market?{market:identity(reordered)}:{})})).state,'already-installed');
    assert.equal(state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],first);
    const next=tool({version:'1.0.1',background:background('void "upgrade";')});
    assert.equal((await install(state,next,{baseline:candidate,approveUpdate:()=>false,...(market?{market:identity(next)}:{})})).state,'cancelled');
    assert.equal(state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],first);
    await install(state,next,{baseline:candidate,...(market?{market:identity(next)}:{})});
    assert.notEqual(state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],first);
    if(market)assert.deepEqual(state.values[MARKET_PROVENANCE_STORE][candidate.id],{
      marketId:'opendesk/'+candidate.id,sha256:digest(packages.serializeSidebarToolPackage(next)),version:next.version});
    if(!market)assert.equal(state.values[MARKET_PROVENANCE_STORE],undefined,'local approval never fabricates publisher provenance');
  });
}

test('R1.4 existing v1 and v2 without background also receive install generations',async()=>{
  const oldV2=tool();delete oldV2.background;
  for(const candidate of [legacy(),oldV2]){
    const state=browser();await install(state,candidate);
    const epoch=state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id];
    await install(state,{...candidate,version:'1.0.1'},{baseline:candidate});
    assert.notEqual(state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],epoch);
  }
});

test('R1.4 a reviewed local same-version source replacement rotates the install generation',async()=>{
  const previous=tool(),state=browser();await install(state,previous);
  const first=state.values[TOOL_REVOCATION_EPOCHS_STORE][previous.id];
  const next=tool({background:background('void "local revision";')});
  await install(state,next,{baseline:previous});
  assert.notEqual(state.values[TOOL_REVOCATION_EPOCHS_STORE][previous.id],first);
});

test('R1.4 corrupt epoch authority and a refused registry write never replace the installed package',async()=>{
  const previous=tool(),candidate=tool({version:'1.0.1'});
  const state=browser({[packages.SIDEBAR_TOOL_STORE]:[previous],
    [TOOL_REVOCATION_EPOCHS_STORE]:{[previous.id]:'old-generation'}});
  const original=state.api.storage.local.set;
  state.api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,packages.SIDEBAR_TOOL_STORE))throw Error('QUOTA_BYTES exceeded');
    await original(rows);
  };
  await assert.rejects(install(state,candidate,{baseline:previous}),{code:'E_HOST_STORAGE_QUOTA'});
  assert.deepEqual(state.values[packages.SIDEBAR_TOOL_STORE],[previous]);
  assert.equal(state.values[TOOL_REVOCATION_EPOCHS_STORE][previous.id],'old-generation');
  state.values[TOOL_REVOCATION_EPOCHS_STORE]={'peer-tool':123};
  await assert.rejects(install(state,candidate,{baseline:previous}),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(state.values[TOOL_REVOCATION_EPOCHS_STORE],{'peer-tool':123});
});

test('R1.4 menu preferences bind the new epoch while unrelated sensitive grants remain revoked',async()=>{
  const previous=tool({capabilities:['browser.storage','browser.scheduler','browser.contextMenu'],
    contributes:{contextMenus:[{actionId:'open',title:'Open',contexts:['page'],documentUrlPatterns:['https://example.com/*'],handler:'open-self'}]}});
  const next={...previous,version:'1.0.1',background:background('void "new";')};
  const menu={version:previous.version,installEpoch:'old-generation',packageHash:await packages.sidebarToolPackageHash(previous),
    activeActions:['open'],origins:['https://example.com']};
  const grant={...menu,contextMenu:menu};
  const state=browser({[packages.SIDEBAR_TOOL_STORE]:[previous],
    [TOOL_REVOCATION_EPOCHS_STORE]:{[previous.id]:'old-generation'},[BROWSER_MENU_GRANTS_STORE]:{[previous.id]:grant}});
  await install(state,next,{baseline:previous});
  const updated=state.values[BROWSER_MENU_GRANTS_STORE][previous.id];
  assert.equal(updated.contextMenu.installEpoch,state.values[TOOL_REVOCATION_EPOCHS_STORE][previous.id]);
  assert.equal(updated.contextMenu.packageHash,await packages.sidebarToolPackageHash(next));
  assert.equal(updated.installEpoch,'old-generation','updating menus does not renew sensitive data grants');
  const combined=state.writes.find(row=>Object.hasOwn(row,packages.SIDEBAR_TOOL_STORE));
  assert.deepEqual(combined[BROWSER_MENU_GRANTS_STORE][previous.id],updated,'menu preferences share the package/generation commit');
});

test('R1.4 a refused menu migration preserves the previous package, epoch and disabled actions',async()=>{
  const previous=tool({capabilities:['browser.storage','browser.scheduler','browser.contextMenu'],
    contributes:{contextMenus:[{actionId:'open',title:'Open',contexts:['page'],documentUrlPatterns:['https://example.com/*'],handler:'open-self'}]}});
  const next={...previous,version:'1.0.1'},menu={version:previous.version,installEpoch:'old-generation',
    packageHash:await packages.sidebarToolPackageHash(previous),activeActions:[],origins:['https://example.com']};
  const initial={[packages.SIDEBAR_TOOL_STORE]:[previous],[TOOL_REVOCATION_EPOCHS_STORE]:{[previous.id]:'old-generation'},
    [BROWSER_MENU_GRANTS_STORE]:{[previous.id]:{contextMenu:menu}}};
  const state=browser(initial),original=state.api.storage.local.set;
  state.api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,BROWSER_MENU_GRANTS_STORE))throw Error('menu preference write failed');
    await original(rows);
  };
  await assert.rejects(install(state,next,{baseline:previous}),{code:'E_HOST_STORAGE_WRITE'});
  assert.deepEqual(state.values,initial);
});

test('R1.4 lost install acknowledgement finalizes without rotating again; recovery verifies background SHA',async()=>{
  const candidate=tool(),market=identity(candidate),state=browser();
  const original=state.api.storage.local.set;
  state.api.storage.local.set=async rows=>{
    await original(rows);if(Object.hasOwn(rows,packages.SIDEBAR_TOOL_STORE))throw Error('ack lost');
  };
  await assert.rejects(install(state,candidate,{market}),{code:'E_OUTCOME_UNKNOWN'});
  const epoch=state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id];assert.equal(typeof epoch,'string');
  assert.equal((await recoverMarketOperation({...state,operationId:market.operationId})).state,'succeeded');
  assert.equal(state.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],epoch);
  assert.equal(state.writes.filter(row=>Object.hasOwn(row,packages.SIDEBAR_TOOL_STORE)).length,1);
  const tampered=tool({background:{...background(),sha256:'0'.repeat(64)}}),badIdentity=identity(tampered);
  const corrupt=browser({[packages.SIDEBAR_TOOL_STORE]:[tampered],
    [MARKET_OPERATIONS_STORE]:{[badIdentity.operationId]:{...badIdentity,toolId:tampered.id,version:tampered.version,state:'committing'}}});
  await assert.rejects(recoverMarketOperation({...corrupt,operationId:badIdentity.operationId}),{code:'E_TOOL_BACKGROUND_SHA'});
  assert.deepEqual(corrupt.writes,[]);
});

test('R1.4 partial package/generation persistence remains unknown and cannot finalize market provenance',async()=>{
  for(const persisted of [packages.SIDEBAR_TOOL_STORE,TOOL_REVOCATION_EPOCHS_STORE]){
    const candidate=tool(),market=identity(candidate),state=browser();
    const original=state.api.storage.local.set;
    state.api.storage.local.set=async rows=>{
      if(Object.hasOwn(rows,packages.SIDEBAR_TOOL_STORE)){
        await original({[persisted]:rows[persisted]});throw Error('partial write');
      }
      await original(rows);
    };
    await assert.rejects(install(state,candidate,{market}),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal((await recoverMarketOperation({...state,operationId:market.operationId})).state,'outcome-unknown');
    assert.equal(state.values[MARKET_PROVENANCE_STORE],undefined);
    assert.equal(state.writes.filter(row=>Object.hasOwn(row,persisted)).length,1,'recovery does not replay either commit field');
  }
});
