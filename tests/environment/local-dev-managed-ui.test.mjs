import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {managedUIBootstrapSource,managedUIRetireSource} from '../../src/scripting/user-scripts/managed-ui-lifecycle.js';
import {createManagedUIPreview} from '../../src/native-agent/managed-preview.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';

// Component doubles exercise lifecycle and protocol failures. Actual isolation,
// CSP, native receipts and user interaction are separately checked in Chrome.
class Element extends EventTarget {
  constructor(tag,doc){super();this.tag=tag;this.ownerDocument=doc;this.parentNode=null;this.children=[];this.props={};this.style={};}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  appendChild(x){x.remove();x.parentNode=this;this.children.push(x);return x;}
  insertBefore(x,ref){x.remove();x.parentNode=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,x);return x;}
  remove(){if(!this.parentNode)return;const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}
  setAttribute(k,v){this.props[k]=v;}
  getAttribute(k){return this.props[k]||null;}
  attachShadow(){const e=new Element('shadow',this.ownerDocument);e.parentNode=this;return e;}
}
class Doc {
  constructor(){
    this.defaultView=new EventTarget();Object.assign(this.defaultView,{setTimeout,clearTimeout,setInterval,clearInterval,MutationObserver:class{observe(){}disconnect(){}}});
    this.documentElement=new Element('html',this);this.body=new Element('body',this);this.documentElement.append(this.body);
  }
  createElement(tag){return new Element(tag,this);}
  querySelectorAll(){const rows=[];const walk=e=>{if(e.getAttribute('data-opendesk-ui-owner'))rows.push(e);for(const c of e.children)walk(c);};walk(this.documentElement);return rows;}
}
const helpers=readFileSync('src/scripting/user-scripts/page-ui-mount.js','utf8').replaceAll('export ','')+'\n'+
  readFileSync('src/scripting/user-scripts/page-ui.js','utf8').replace(/^import .+\n/,'').replaceAll('export ','');
function world(doc=new Doc(),timer=setTimeout){
  const context=vm.createContext({document:doc,Event,setTimeout:timer,clearTimeout,console:{error(){}}});
  return {doc,context,run:code=>vm.runInContext(code,context)};
}
function managedWorld(timer){
  const w=world(undefined,timer),nonce=randomUUID();w.run(managedUIBootstrapSource(nonce));w.run(helpers);
  return {...w,retire:()=>w.run(managedUIRetireSource(nonce,randomUUID()))};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('managed cleanup waits for async disposers and callbacks; repeated retirement never repeats disposal',async()=>{
  const w=managedWorld();w.run('var releaseCleanup,releaseCallback,cleanups=0;var ui=createPageUI({id:"async"});var button=document.createElement("button");ui.content.append(button);ui.on(button,"click",()=>new Promise(r=>releaseCallback=r));ui.onDispose(()=>{cleanups++;return new Promise(r=>releaseCleanup=r)});button.dispatchEvent(new Event("click"));');
  let settled=false;const result=w.retire().then(r=>{settled=true;return r;});await turn();
  assert.equal(w.run('ui.active()'),false);assert.equal(w.doc.querySelectorAll().length,0);assert.equal(settled,false);
  w.run('releaseCleanup()');await turn();assert.equal(settled,false,'in-flight callback must also settle');
  w.run('releaseCallback()');assert.equal((await result).ok,true);
  assert.equal((await w.retire()).ok,true);assert.equal(w.run('cleanups'),1);
  assert.throws(()=>w.run('createPageUI({id:"new"})'),/retiring/);
});
test('sync and async cleanup failures remain tombstones even when the DOM host was removed',async()=>{
  for(const cleanup of ['throw new Error("SYNC_FAIL")','return Promise.reject(new Error("ASYNC_FAIL"))']){
    const w=managedWorld();w.run('var count=0;var ui=createPageUI({id:"failure"});ui.onDispose(()=>{count++;'+cleanup+'});ui.destroy();');
    assert.equal(w.doc.querySelectorAll().length,0);const r=await w.retire();
    assert.equal(r.ok,false);assert.equal(r.code,'E_UI_CLEANUP_FAILED');assert.match(r.message,/FAIL/);
    assert.equal((await w.retire()).ok,false);assert.equal(w.run('count'),1);
  }
});
test('managed cleanup times out conservatively and never promotes a late completion to success',async()=>{
  const w=managedWorld((f,ms)=>setTimeout(f,ms===5000?15:ms));
  w.run('var release;var ui=createPageUI({id:"timeout"});ui.onDispose(()=>new Promise(r=>release=r));');
  const r=await w.retire();assert.equal(r.ok,false);assert.equal(r.code,'E_UI_CLEANUP_TIMEOUT');
  w.run('release()');await turn();assert.equal((await w.retire()).code,'E_UI_CLEANUP_TIMEOUT');
});
test('the captured lexical registry survives global alias forgery and ignores DOM close as a success receipt',async()=>{
  const w=managedWorld();w.run('var ui=createPageUI({id:"forgery"});ui.onDispose(()=>{throw new Error("REAL_FAILURE")});ui.host.dispatchEvent(new Event("opendesk:page-ui:dispose:v1"));globalThis={__opendeskManagedUIRegistryV1:{retire:()=>({ok:true})}};');
  const r=await w.retire();assert.equal(r.ok,false);assert.match(r.message,/REAL_FAILURE/);
  const empty=managedWorld();const receipt=await empty.retire();assert.equal(receipt.ok,true);assert.equal(receipt.instances,0);assert.equal(receipt.scope,'managed-ui-only');
});
test('changed Promise primitives cannot turn an unfinished async disposer into successful cleanup',async()=>{
  const w=managedWorld();w.run('var release;var ui=createPageUI({id:"promise-runtime"});ui.onDispose(()=>new Promise(r=>release=r));var originalResolve=Promise.resolve.bind(Promise);Promise.resolve=()=>originalResolve();');
  const result=await w.retire();assert.equal(result.ok,false);assert.equal(result.code,'E_UI_CLEANUP_FAILED');assert.match(result.message,/Promise runtime changed/);
  assert.equal(w.run('typeof release'), 'undefined','unsafe retirement must stop before invoking disposers');w.run('ui.destroy()');
});
test('a manual preview cannot bypass a managed old instance through its legacy DOM replacement path',async()=>{
  const w=managedWorld();w.run('var ui=createPageUI({id:"shared"});ui.onDispose(()=>{throw new Error("OLD_FAILURE")});');
  const manual=world(w.doc);manual.run(helpers);
  assert.throws(()=>manual.run('createPageUI({id:"shared"})'),{code:'E_UI_REPLACE_REQUIRED'});assert.equal(w.doc.querySelectorAll().length,1);
  assert.equal((await w.retire()).ok,false);assert.equal(w.doc.querySelectorAll().length,0);
});
test('prototype then pollution cannot assimilate a failed cleanup receipt into forged success',async()=>{
  const w=managedWorld();w.run('var ui=createPageUI({id:"then-pollution"});ui.onDispose(()=>{throw new Error("MUST_FAIL")});Object.prototype.then=function(done){var forged=Object.assign(Object.create(null),this,{ok:true});done(forged)};');
  const result=await w.retire();assert.equal(result.ok,false);assert.equal(result.code,'E_UI_CLEANUP_FAILED');assert.equal(Object.getPrototypeOf(result),null);
  w.run('delete Object.prototype.then;ui.destroy()');
});
test('retirement freezes entry to every managed instance before any disposer can trigger new business callbacks',async()=>{
  const w=managedWorld();w.run('var calls=0;var a=createPageUI({id:"a"}),b=createPageUI({id:"b"}),button=document.createElement("button");b.content.append(button);b.on(button,"click",()=>calls++);a.onDispose(()=>button.dispatchEvent(new Event("click")));');
  assert.equal((await w.retire()).ok,true);assert.equal(w.run('calls'),0);
});

const target={tabId:5,frameId:0,documentId:'doc-5',expectedWindowId:9,expectedUrl:'https://example.test/demo'};
const bindingId='local-'+'a'.repeat(20),sender={documentId:'trusted-tool'};
function previewFixture(){
  const doc=new Doc(),contexts=new Map(),session={},calls=[];let slot=null,owner='host-one',permission=true,hook=()=>{},nativeReply=(_request,value)=>value;
  const api={
    storage:{session:{get:async key=>({[key]:structuredClone(session[key])}),set:async value=>{Object.assign(session,structuredClone(value));await hook(value);}}},
    tabs:{get:async()=>({id:5,windowId:9,active:true,status:'complete',url:target.expectedUrl}),query:async()=>[{id:5,active:true}]},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:'doc-5',url:target.expectedUrl,documentLifecycle:'active'}]},
    permissions:{contains:async()=>permission},
    userScripts:{getScripts:async()=>[],getWorldConfigurations:async()=>[],configureWorld:async()=>{},resetWorldConfiguration:async()=>{},execute:async request=>{
      calls.push(request);const id=request.worldId||'default';if(!contexts.has(id))contexts.set(id,world(doc));
      const result=await contexts.get(id).run(request.js.at(-1).code);
      return nativeReply(request,[{frameId:0,documentId:'doc-5',result:JSON.parse(JSON.stringify(result))}]);
    }}
  };
  const storage={transaction:async(_stores,_mode,work)=>work({get:async()=>structuredClone(slot),put:async(_store,value)=>{slot=structuredClone(value);}})};
  const assertHost=async()=>{if(!owner)throw Object.assign(new Error('Host closed'),{code:'E_OWNER'});return {registrationId:owner};};
  const admission=createPreviewAdmission({storage,assertHost,currentHost:assertHost});
  const make=()=>createPageScriptPreview({api,storage,assertHost,admission,managedFactory:createManagedUIPreview,dependencies:{loadForExecution:async()=>({entries:[],lockId:null,manifestDigest:'test'})}});
  const request=(body='return {ok:true};')=>({sourceUtf8:helpers+'\nasync function main(){var ui=createPageUI({id:"test"});'+body+'}',entryFormat:'async-main',target:{...target},managedUI:{previewId:randomUUID(),bindingId}});
  return {doc,calls,session,api,make,request,get slot(){return slot;},owner:value=>{owner=value;},permission:value=>{permission=value;},hook:value=>{hook=value;},nativeReply:value=>{nativeReply=value;}};
}
test('explicit next preview retires the original world before new code; service recreation preserves identity and budget',async()=>{
  const f=previewFixture(),first=f.request('document.version=1;ui.onDispose(async()=>{await Promise.resolve();document.cleaned=true});return 1;');
  const one=await f.make().preview(first,sender);assert.equal(f.doc.version,1);assert.equal(f.slot.preview,undefined);
  const two=await f.make().preview(f.request('if(!document.cleaned)throw new Error("CLEANUP_ORDER");document.version=2;return 2;'),sender);
  assert.equal(f.doc.version,2);assert.equal(two.previousCleanup.previewId,first.managedUI.previewId);assert.equal(two.previousCleanup.ok,true);
  assert.notEqual(one.worldId,two.worldId);assert.equal(f.doc.querySelectorAll().length,1);
  const rows=Object.values(f.session)[0];assert.equal(rows.length,2);assert.equal(rows[0].managed.state,'retired');
  const stopped=await f.make().retire({previewId:two.managedPreviewId},sender);assert.equal(stopped.state,'preview-retired');assert.equal(stopped.receipt.ok,true);assert.equal(f.doc.querySelectorAll().length,0);
  assert.equal(Object.values(f.session)[0].length,2,'cleanup cannot refund Chromium world budget');
});
test('confirmed cleanup failure blocks new code and preserves the failed record across retries',async()=>{
  const f=previewFixture(),service=f.make();
  await service.preview(f.request('ui.onDispose(()=>{throw new Error("OLD_CLEANUP_FAIL")});return 1;'),sender);
  for(let i=0;i<2;i++)await assert.rejects(()=>service.preview(f.request('document.newCodeRan=true;return 2;'),sender),{code:'E_UI_CLEANUP_FAILED'});
  assert.equal(f.doc.newCodeRan,undefined);assert.equal(f.slot.preview,undefined);assert.equal(f.doc.querySelectorAll().length,0);
  assert.equal(Object.values(f.session)[0][0].managed.state,'failed');
});
test('lost cleanup receipt holds the original shared Authority fence; no second retirement or Controller admission',async()=>{
  const f=previewFixture(),service=f.make();await service.preview(f.request(),sender);
  f.nativeReply((request,value)=>request.js.at(-1).code.startsWith('(()=>{const r=__opendeskManagedUIRegistryV1')?[]:value);
  await assert.rejects(()=>service.preview(f.request('document.newCodeRan=true;'),sender),{code:'E_EFFECT_UNKNOWN'});
  assert.ok(f.slot.preview?.nonce);assert.equal(f.doc.newCodeRan,undefined);
  const count=f.calls.length;await assert.rejects(()=>f.make().preview(f.request(),sender),{code:'E_OWNER'});assert.equal(f.calls.length,count);
  await service.cleanupWorlds({tabId:5,removed:true});assert.equal(f.slot.preview,undefined);
});
test('Host loss after bootstrap or retiring ledger write prevents the next native effect',async()=>{
  for(const phase of ['executing','retiring']){
    const f=previewFixture(),service=f.make();if(phase==='retiring')await service.preview(f.request('ui.onDispose(()=>{document.cleaned=true});'),sender);
    f.hook(value=>{if(Object.values(value)[0].some(row=>row.managed?.state===phase))f.owner(null);});
    await assert.rejects(()=>service.preview(f.request('document.newCodeRan=true;'),sender),{code:'E_OWNER'});
    assert.equal(f.doc.newCodeRan,undefined);assert.equal(f.doc.cleaned,undefined);assert.equal(f.slot.preview,undefined);
  }
});
test('pre-bootstrap refusal does not poison next valid admission; previous main failure still requires managed cleanup',async()=>{
  const f=previewFixture(),service=f.make();f.permission(false);
  await assert.rejects(()=>service.preview(f.request(),sender),{code:'E_PERMISSION'});f.permission(true);
  const first=f.request('ui.onDispose(()=>{document.cleaned=true});throw new Error("EXPECTED_MAIN_FAILURE");');
  await assert.rejects(()=>service.preview(first,sender),{code:'E_PAGE_SCRIPT_EXECUTION'});
  const result=await service.preview(f.request('if(!document.cleaned)throw new Error("MISSING_CLEANUP");return 2;'),sender);
  assert.equal(result.previousCleanup.previewId,first.managedUI.previewId);
  await service.retire({previewId:result.managedPreviewId},sender);
});
test('removing the UI import cannot silently bypass an old managed binding',async()=>{
  const f=previewFixture(),service=f.make(),one=await service.preview(f.request(),sender);
  const plain=f.request('document.plainRan=true;');plain.managedUI.enabled=false;
  await assert.rejects(()=>service.preview(plain,sender),{code:'E_UI_MODE_CONFLICT'});assert.equal(f.doc.plainRan,undefined);
  await service.retire({previewId:one.managedPreviewId},sender);
  plain.sourceUtf8='async function main(){document.plainRan=true;}';const result=await service.preview(plain,sender);
  assert.equal(result.managedUI,undefined);assert.equal(f.doc.plainRan,true);
});
test('Native adapter maps uncoded transport rejection to unknown for preview and managed disposal',async t=>{
  const subscriptions=[],replies=[],current={windowId:9,tabId:5,frameId:0,documentId:'doc-5',url:target.expectedUrl,origin:'https://example.test'};
  const client={ready:Promise.resolve(),registration:{registrationId:'host-one'},subscribeNativeAgent:cb=>{subscriptions.push(cb);return()=>{};},replyNativeAgent:reply=>replies.push(reply),request:async()=>{throw new Error('Message channel closed after dispatch');}};
  const adapter=createNativeAgentHostAdapter({client,host:{currentRun:null},currentPageTarget:{ready:Promise.resolve(),refresh:async()=>{},capture:()=>({...current,status:'available'}),revalidate:async()=>{}},api:{permissions:{contains:async()=>true}}});t.after(()=>adapter.dispose());
  const sourceUtf8='async function main(){}',row=await adapter.handle({method:'page.preview',params:{sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),sourceBytes:sourceUtf8.length,entryFormat:'async-main',target:current,managedUI:true,bindingId}});
  await turn();const result=await adapter.handle({method:'page.get',params:{previewId:row.previewId}});
  assert.equal(result.state,'preview-unknown');assert.equal(result.error.outcome,'OUTCOME_UNKNOWN');
  await subscriptions[0]({method:'page.dispose',requestId:'dispose',params:{previewId:row.previewId}});
  assert.equal(replies[0].error.code,'E_EFFECT_UNKNOWN');assert.equal(replies[0].error.outcome,'OUTCOME_UNKNOWN');
});
