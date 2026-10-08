import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPageScriptPreview, compilePageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {JQUERY_371} from '../../src/scripting/user-scripts/page-program-package.js';
globalThis.crypto ||= webcrypto;
const source = 'async function main(){ document.title="Preview OK"; return {title:document.title}; }';
const target = {tabId:5,frameId:0,documentId:'doc-5',expectedWindowId:9,expectedUrl:'https://example.com/demo'};
function fixture(overrides = {}) {
  const calls=[], page={title:'Before'},contexts=new Map(),session={};
  let frameCount=0;
  const api={
    runtime:{getURL:path=>'chrome-extension://extension/'+path},
    storage:{session:{get:async key=>({[key]:structuredClone(session[key])}),set:async value=>Object.assign(session,structuredClone(value))}},
    tabs:{
      get:async()=>({id:5,windowId:9,active:true,incognito:false,status:'complete',url:target.expectedUrl}),
      query:async()=>[{id:5,active:true}]
    },
    webNavigation:{getAllFrames:async()=>{
      frameCount++;
      return [{frameId:0,documentId:overrides.changeDocumentOnSecond && frameCount>1?'doc-6':'doc-5',
        url:target.expectedUrl,documentLifecycle:'active'}];
    }},
    permissions:{contains:async()=>overrides.permission!==false},
    userScripts:{getScripts:async()=>[],getWorldConfigurations:async()=>[],configureWorld:async()=>{},resetWorldConfiguration:async()=>{},execute:async request=>{
      const probe=request.js.length===1 && /^(?:const |typeof )?__opendesk_probe_/.test(request.js[0].code);
      if(!probe){
        calls.push(request);
        if(overrides.error || overrides.emptyError)return [{frameId:0,documentId:'doc-5',error:overrides.emptyError?'':'Native evaluation failed'}];
        if(overrides.wrongReceipt)return [{frameId:0,documentId:'doc-other',result:null}];
        if(overrides.missingCompletion)return [{frameId:0,documentId:'doc-5'}];
      }
      const id=request.worldId || 'default';
      if(!contexts.has(id))contexts.set(id,vm.createContext({document:page,...(overrides.noEval?{jQuery:{fn:{jquery:'3.7.1'}}}:{})}));
      // noEval only stubs vendor DOM initialization for the byte-wiring test;
      // generic two-library execution is covered by dependency-flow tests.
      const value=await vm.runInContext(request.js.at(-1).code,contexts.get(id));
      return [{frameId:0,documentId:'doc-5',result:JSON.parse(JSON.stringify(value))}];
    }}
  };
  if(overrides.userScriptsUnavailable)delete api.userScripts;
  const storage={transaction:async(_,__,work)=>work({get:async()=>overrides.slotBusy?{currentRunId:'other-run'}:null})};
  const assertHost=async()=>{if(overrides.denyHost)throw Object.assign(new Error('E_OWNER'),{code:'E_OWNER'});};
  const preview=createPageScriptPreview({api,storage,assertHost,fetchImpl:async()=>({ok:true,text:async()=>overrides.jquerySource||''})});
  return {api,preview,calls,page,get frameCount(){return frameCount;}};
}
const request=(extra={})=>({sourceUtf8:source,withJquery:false,target:{...target},...extra});
const fails=async (promise,code)=>assert.rejects(promise,e=>e.code===code);

test('named async main() evaluates in exact USER_SCRIPT main document without durable Task or registration',async()=>{
  const f=fixture(),result=await f.preview.preview(request(),{documentId:'trusted-tool'});
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].world,'USER_SCRIPT');
  assert.deepEqual(f.calls[0].target,{tabId:5,documentIds:['doc-5']});
  assert.match(f.calls[0].worldId,/^opendesk-preview-/);
  assert.equal(f.page.title,'Preview OK');
  assert.match(result.resultText,/Preview OK/);
  assert.equal(result.durable,false);assert.equal(result.registered,false);
  assert.equal(result.sourceHash,createHash('sha256').update(source).digest('hex'));
  assert.equal(f.frameCount,2,'observe document before and after asynchronous preparation');
});

test('no injection after document change, permission revoke, Controller slot, invalid sender or API opt-in',async()=>{
  for(const [mode,code] of [
    [{changeDocumentOnSecond:true},'E_DOCUMENT_STALE'],
    [{permission:false},'E_PERMISSION'],
    [{slotBusy:true},'E_OWNER'],
    [{denyHost:true},'E_OWNER'],
    [{userScriptsUnavailable:true},'E_USER_SCRIPTS_UNAVAILABLE']
  ]){
    const f=fixture(mode);
    await fails(f.preview.preview(request(),{}),code);
    assert.equal(f.calls.length,0,code+' must not inject');
  }
});

test('incorrect browser document receipt and native script errors cannot claim success',async()=>{
  for(const [mode,code] of [[{wrongReceipt:true},'E_RESULT_FORMAT'],[{error:true},'E_PAGE_SCRIPT_EXECUTION'],
    [{emptyError:true},'E_PAGE_SCRIPT_EXECUTION'],[{missingCompletion:true},'E_PAGE_SCRIPT_EXECUTION']]){
    const f=fixture(mode);
    await fails(f.preview.preview(request(),{}),code);
  }
});

test('source, site and requested execution world cannot be forged through preview protocol',async()=>{
  const f=fixture();
  for(const [bad,code] of [
    [request({sourceUtf8:'return 1;'}),'E_SOURCE'],
    [request({withJquery:'yes'}),'E_SOURCE'],
    [request({world:'MAIN'}),'E_SCHEMA'],
    [request({target:{...target,frameId:1}}),'E_TARGET'],
    [request({target:{...target,expectedUrl:'chrome://extensions/'}}),'E_TARGET']
  ]) await fails(f.preview.preview(bad,{}),code);
  assert.equal(f.calls.length,0);
});

test('verified pinned jQuery bytes precede preview main, without Service Worker evaluation',async()=>{
  const jqueryCode=await readFile('src/vendor/jquery-3.7.1.min.js','utf8');
  assert.equal(createHash('sha256').update(jqueryCode).digest('hex'),JQUERY_371.sha256);
  const compiled=await compilePageScriptPreview({sourceUtf8:source,withJquery:true,jqueryCode});
  assert.equal(compiled.world,'USER_SCRIPT');
  assert.equal(compiled.js.length,2);
  assert.equal(compiled.js[0].code,jqueryCode);
  assert.match(compiled.js[1].code,/E_DEPENDENCY_NOT_READY/);
  const f=fixture({jquerySource:jqueryCode,noEval:true});
  const result=await f.preview.preview(request({withJquery:true}),{});
  assert.equal(result.dependency.version,'3.7.1');
  assert.equal(f.calls[0].js[0].code,jqueryCode);
  assert.notEqual(compiled.worldId,(await compilePageScriptPreview({sourceUtf8:source,withJquery:false})).worldId);
  await fails(compilePageScriptPreview({sourceUtf8:source,withJquery:true,jqueryCode:'tampered'}),'E_DEPENDENCY_HASH');
});
