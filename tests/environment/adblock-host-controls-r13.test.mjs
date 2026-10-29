// AdBlock R2.4: real React product state/receipt tests, replacing retired Host DOM.
// These are Node pure-model and source guards. They are NOT installed Chrome/DNR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {valid,verified,readyToOperate,siteHost,confirmed}
  from '../../projects/adblock/src/model.js';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const app=()=>read('projects/adblock/src/App.jsx');
const compiled=()=>read('projects/adblock/dist/tool.js');
const base={installed:true,toolEnabled:true,enabled:true,restartRequired:false,
  currentHost:'news.example.com',currentSite:{status:'ready'},exceptions:[],
  permissions:{dnr:true},rules:{verified:true,ruleIds:[]}};
const state=(changes={})=>({...structuredClone(base),...changes});

test('React admits complete Chrome receipts only, never unknown permission or rules',async t=>{
  for(const [name,change] of [
    ['absent',null],['enabled missing',{enabled:undefined}],
    ['exception array missing',{exceptions:undefined}],
    ['malformed exception list',{exceptions:{}}],
    ['malformed exception hostname',{exceptions:[false]}],
    ['permission unreadable',{permissions:{dnr:null}}],
    ['rule verification unreadable',{rules:{verified:undefined}}]
  ])await t.test(name,()=>assert.equal(valid(change===null?null:state(change)),false));
  assert.equal(valid(state()),true);
});

test('installed, enabled, DNR-granted and restart-ready remain separate conditions',async t=>{
  for(const [name,change,verifiedState,ready] of [
    ['healthy',{},true,true],
    ['revoked DNR permission',{permissions:{dnr:false}},false,false],
    ['unverified Chrome rule',{rules:{verified:false}},false,false],
    ['tool stopped',{toolEnabled:false},true,false],
    ['pending Chrome restart',{restartRequired:true},true,false]
  ])await t.test(name,()=>{
    assert.equal(verified(state(change)),verifiedState);
    assert.equal(readyToOperate(state(change)),ready);
  });
});

test('current-site host exists only after ready HTTP(S) page identity',async t=>{
  for(const siteStatus of ['navigating','incognito','unsupported','unavailable'])
    await t.test(siteStatus,()=>assert.equal(siteHost(state({currentSite:{status:siteStatus}})),null));
  assert.equal(siteHost(state()),'news.example.com');
  assert.equal(siteHost(state({currentHost:''})),null);
});

test('enable requires true enabled state in both operation response and Chrome readback',async t=>{
  for(const [name,result,check,pass] of [
    ['enabled',state(),state(),true],
    ['still disabled',state({enabled:false}),state({enabled:false}),false],
    ['stale readback',state(),state({enabled:false}),false],
    ['disabled tool',state(),state({toolEnabled:false}),false],
    ['Chrome restart',state(),state({restartRequired:true}),false]
  ])await t.test(name,()=>assert.equal(confirmed(result,check,'adblock.enable'),pass));
});

test('disable requires false enabled state in both responses',async t=>{
  for(const [name,result,check,pass] of [
    ['disabled',state({enabled:false}),state({enabled:false}),true],
    ['still enabled',state(),state(),false],
    ['different readback',state({enabled:false}),state(),false]
  ])await t.test(name,()=>assert.equal(confirmed(result,check,'adblock.disable'),pass));
});

test('site exceptions cannot be applied to the previously selected tab',async t=>{
  const applied=state({exceptions:['news.example.com']});
  for(const [name,checked,pass] of [
    ['same website',applied,true],
    ['other website',state({exceptions:['news.example.com'],currentHost:'video.example.com'}),false],
    ['navigation',state({exceptions:['news.example.com'],currentSite:{status:'navigating'}}),false],
    ['exception disappeared',state(),false],
    ['DNR unknown',state({exceptions:['news.example.com'],rules:{verified:false}}),false]
  ])await t.test(name,()=>assert.equal(confirmed(applied,checked,'adblock.site.set',
    {host:'news.example.com',filtering:false}),pass));
});

test('restore verifies absence from exception list without requiring active site',()=>{
  const otherTab=state({currentHost:'video.example.com'});
  assert.equal(confirmed(otherTab,otherTab,'adblock.site.restore',
    {host:'news.example.com'}),true);
  assert.equal(confirmed(otherTab,state({exceptions:['news.example.com']}),
    'adblock.site.restore',{host:'news.example.com'}),false);
});

test('any authority, rule or exception drift rejects an otherwise successful write',async t=>{
  const before=state({exceptions:['one.example.com','two.example.com']});
  for(const [name,changes] of [
    ['DNR revoked',{permissions:{dnr:false}}],
    ['DNR unverified',{rules:{verified:false}}],
    ['tool disabled',{toolEnabled:false}],
    ['restart',{restartRequired:true}],
    ['exception reorder',{exceptions:['two.example.com','one.example.com']}],
    ['toggle drift',{enabled:false}]
  ])await t.test(name,()=>{
    assert.equal(confirmed(before,state({...before,...changes}),'adblock.enable'),false);
  });
  assert.equal(confirmed(state(),state(),'adblock.erase-all'),false);
});

test('the candidate compilation contains all five real restricted SDK operations',async()=>{
  const source=await app(),js=await compiled();
  for(const op of ['adblock.status','adblock.enable','adblock.disable',
    'adblock.site.set','adblock.site.restore']){
    assert.ok(source.includes(op),'React source missing '+op);
    assert.ok(js.includes(op),'compiled product missing '+op);
  }
});

test('trusted Host and Chrome DNR APIs are never duplicated inside the tool',async()=>{
  const source=await app();
  for(const forbidden of ['host-controls','declarativeNetRequest','updateDynamicRules',
    'chrome.permissions'])assert.ok(!source.includes(forbidden),forbidden);
  assert.ok(source.includes("from '@opendesk/ui'"));
});

test('one React root mounts and unmounts the independent product',async()=>{
  const entry=await read('projects/adblock/src/main.jsx');
  assert.ok(entry.includes('createRoot('));
  assert.ok(entry.includes('root.unmount()'));
  assert.ok(!entry.includes('host-controls'));
});

test('navigation and tool generation discard in-flight writes and stale site identity',async()=>{
  const source=await app();
  for(const term of ['contextRevision.current++','operationContext!==contextRevision.current',
    'current.current=null;setState(null);setLoading(true)'])
    assert.ok(source.includes(term),term);
});

test('bridge root events explicitly invalidate the active React page context',async()=>{
  const source=await app();
  for(const event of ['opendesk-page-changed','opendesk-tool-state-changed']){
    assert.ok(source.includes("addEventListener?.('"+event+"',onPageChanged)"));
    assert.ok(source.includes("removeEventListener?.('"+event+"',onPageChanged)"));
  }
});

test('no optimistic toggle: every mutation awaits an independent native readback',async()=>{
  const source=await app();
  for(const phrase of ["await api.request(operation,payload)",
    "const checked=await api.request('adblock.status',{})",
    'confirmed(result,checked,operation,payload)'])assert.ok(source.includes(phrase),phrase);
});

test('unknown write result reconciles current state instead of replaying DNR writes',async()=>{
  const source=await app();
  for(const phrase of ['needsReadback=true','void refresh(true)','不会自动重试写入'])
    assert.ok(source.includes(phrase),phrase);
});

test('a cancelled trusted action never claims Chrome rule changes',async()=>{
  const source=await app();
  assert.ok(source.includes("E_CANCELLED"));
  assert.ok(source.includes('已取消，未提交这次更改'));
});

test('busy guard suppresses rapid double submits while coalescing status reads',async()=>{
  const source=await app();
  assert.ok(source.includes('if(locked.current||!current.current)return'));
  assert.ok(source.includes('if(locked.current){queued.current=true;return;}'));
});

test('a missing or invalid status discards previously visible protection',async()=>{
  const source=await app();
  assert.ok(source.includes('Chrome DNR 状态数据不完整'));
  assert.ok(source.includes('current.current=null;setState(null);setProblem(true)'));
});

test('a navigating, hidden or unsupported tab cannot reuse a previous site switch',async()=>{
  const source=await app();
  assert.ok(source.includes('const host=siteHost(state)'));
  assert.ok(source.includes('const siteLocked=switchLocked||!on||!host'));
});

test('overview, settings, exception list, restoration and navigation share one React app',async()=>{
  const source=await app();
  for(const term of ["setView('overview')","setView('exceptions')",
    "setView('settings')",'adblock.site.restore','暂无网站例外'])
    assert.ok(source.includes(term),term);
});

test('closing panel releases poll, event handlers, and stale async results',async()=>{
  const source=await app();
  for(const phrase of ['alive.current=false','clearInterval(interval)',
    'reading.current++'])assert.ok(source.includes(phrase),phrase);
});

test('displayed protection is gated by tool enabled AND verified Chrome rules',async()=>{
  const source=await app();
  assert.ok(source.includes('state.toolEnabled===true&&!state.restartRequired'));
  assert.ok(!source.includes('blockedCount'));
});

test('offline preview embeds compiled React package, not obsolete Host DOM snapshot',async()=>{
  const source=await read('scripts/preview/build-preview.mjs');
  for(const phrase of ['pkg.js','dist/production/sidebar-shared-ui.js',
    'FRAME_BASE64:base64(frameForDisplay)'])assert.ok(source.includes(phrase),phrase);
});
