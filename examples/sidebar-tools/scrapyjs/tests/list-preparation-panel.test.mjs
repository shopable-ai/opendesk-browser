import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {AiPanel} from './list-preparation-fixture.mjs';
import {ItemLoader} from '../engine/browser.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const sample='<main class="catalog"><article class="book"><a>A</a></article><article class="book"><a>B</a></article></main>';
const context=vm.createContext({URL,TextEncoder});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),context);
async function fixture(t,{stored=null,html=sample,provider=false}={}){
 const previous={tool:globalThis.OpenDeskTool,model:globalThis.ScrapyAppModel,parser:globalThis.DOMParser};
 const calls=[],applied=[],busy=[];let deferred=null,deferredOp=null,generation=1;
 const hooks=[];const lifecycle={after:fn=>hooks.push(fn)};
 globalThis.DOMParser=DOMParser;globalThis.ScrapyAppModel=context.ScrapyAppModel;
 globalThis.OpenDeskTool={request:async(op,args)=>{
  calls.push(op);
  if(deferred&&op===deferredOp)return await deferred;
  if(op==='ai.info'){if(provider)return {provider:'fixture',generation};throw Error('Provider unavailable');}
  if(op==='storage.set'){stored=args.value;return {saved:true};}
  if(op==='ai.generate')return {requestId:args.requestId,providerGeneration:generation,proposal:JSON.stringify(state.config)};
  if(op==='storage.get')return {value:stored,etag:'1'};
  throw Error('Unexpected request '+op);
 }};
 t.after(()=>{globalThis.OpenDeskTool=previous.tool;globalThis.ScrapyAppModel=previous.model;globalThis.DOMParser=previous.parser;});
 const state={config:{url:'https://example.com/',itemConfig:{title:'.catalog article.book a::text'}},target:{url:'https://example.com/',title:'Page'},profileEpoch:1};
 const ui=createExtensionCenterDOM(lifecycle,{component:AiPanel,props:{state,valid:true,onBusy(value){busy.push(value);},onDirty(){},onApply(...args){applied.push(args);},onClose(){}}});
 t.after(async()=>{for(const hook of hooks)await hook();});
 await settle();
 const get=id=>ui.doc.getElementById(id);
 get('chat-ai-sample').value=html;get('chat-ai-sample').dispatch('input');
 return {ui,get,calls,applied,busy,setStored(value){stored=value;},setGeneration(value){generation=value;},async unmount(){for(const hook of hooks.splice(0))await hook();},defer(op='storage.get'){let resolve;deferredOp=op;deferred=new Promise(ok=>{resolve=ok;});return ()=>{deferred=null;resolve(op==='ai.info'?{provider:'fixture',generation}:{value:stored,etag:'1'});};}};
}
test('explicit local preparation reviews then applies an unsaved draft without Provider generation',async t=>{
 const f=await fixture(t);
 assert.ok(f.get('chat-list-prepare'),'explicit preparation action exists');
 f.get('chat-list-prepare').dispatch('click');await settle();await settle();
 assert.ok(f.get('chat-ai-review'),f.ui.doc.querySelector('[role=alert]')?.textContent);
 assert.match(f.get('chat-ai-review').textContent,/本地列表准备/);
 assert.equal(f.applied.length,0);
 f.get('chat-ai-apply').dispatch('click');await settle();
 assert.equal(f.applied.length,1);assert.ok(f.applied[0][0].itemConfig._listItem);
 assert.match(f.get('chat-ai-feedback').textContent,/未保存草稿/);
 assert.equal(f.calls.filter(op=>op==='ai.info').length,1,'local apply must not ask Provider generation');
 assert.ok(f.calls.every(op=>op==='ai.info'||op==='storage.get'),'no new AI, page or write request');
});
test('persisted unknown request fences local preparation too',async t=>{
 const f=await fixture(t,{stored:{schemaVersion:1,requestId:'original'}});
 assert.ok(f.get('chat-list-prepare'));
 assert.equal(f.get('chat-list-prepare').disabled,true);
 f.get('chat-list-prepare').dispatch('click');await settle();assert.equal(f.get('chat-ai-review'),null);assert.equal(f.applied.length,0);
});
test('missing sample prompts locally and never reads host page content',async t=>{
 const f=await fixture(t,{html:''});
 f.get('chat-list-prepare').dispatch('click');await settle();await settle();
 assert.equal(f.get('chat-ai-review'),null);
 assert.match(f.ui.doc.querySelector('[role=alert]').textContent,/HTML 样本/);
 assert.equal(f.applied.length,0);
 assert.ok(f.calls.every(op=>op==='ai.info'||op==='storage.get'));
});
test('a pending identity discovered after mount prevents local preparation',async t=>{
 const f=await fixture(t);f.setStored({schemaVersion:1,requestId:'other'});
 f.get('chat-list-prepare').dispatch('click');await settle();
 assert.equal(f.get('chat-ai-review'),null);assert.equal(f.get('chat-list-prepare').disabled,true);
 assert.match(f.get('chat-ai-request-status').textContent,/other.*unknown/);assert.equal(f.busy.at(-1),true,'unknown keeps the parent busy fence');
});
for(const stage of ['prepare','engine','apply'])for(const change of ['input','epoch','target','base','locked','pending','invalid','unmount'])test(`${stage} rechecks ${change} after its awaited read`,async t=>{
 const f=await fixture(t);
 if(stage==='apply'){
  f.get('chat-list-prepare').dispatch('click');await settle();await settle();assert.ok(f.get('chat-ai-review'));
 }
 let release;
 if(stage==='engine'){
  const original=ItemLoader.prepareList;
  assert.equal(typeof original,'function','SDK must expose real preparation');
  let entered=false;
  const wait=new Promise(resolve=>{release=resolve;});
  ItemLoader.prepareList=async function(...args){entered=true;const result=await original.apply(this,args);await wait;return result;};
  t.after(()=>{ItemLoader.prepareList=original;});
  f.get('chat-list-prepare').dispatch('click');await settle();assert.equal(entered,true);
 }else{release=f.defer();f.get(stage==='apply'?'chat-ai-apply':'chat-list-prepare').dispatch('click');}
 if(change==='input'){f.get('chat-ai-sample').value='changed';f.get('chat-ai-sample').dispatch('input');}
 else if(change==='epoch')f.ui.state.state={...f.ui.state.state,profileEpoch:2};
 else if(change==='target')f.ui.state.state={...f.ui.state.state,target:{url:'https://example.org/'}};
 else if(change==='base')f.ui.state.state={...f.ui.state.state,config:{...f.ui.state.state.config,maxPages:2}};
 else if(change==='invalid')f.ui.state.valid=false;
 else if(change==='unmount')await f.unmount();
 else f.ui.state[change]=true;
 f.ui.paint();release();await settle();await settle();
 assert.equal(f.applied.length,0);
 if(stage!=='apply'&&change!=='unmount')assert.equal(f.get('chat-ai-review'),null);
 if(stage==='apply'&&change!=='unmount')assert.equal(f.get('chat-ai-apply').disabled,true);
});
test('local apply rechecks persisted unknown and does not save or generate',async t=>{
 const f=await fixture(t);
 f.get('chat-list-prepare').dispatch('click');await settle();await settle();assert.ok(f.get('chat-ai-review'));
 f.setStored({schemaVersion:1,requestId:'original'});
 f.get('chat-ai-apply').dispatch('click');await settle();
 assert.equal(f.applied.length,0);assert.equal(f.get('chat-ai-apply').disabled,true);
 assert.ok(f.calls.every(op=>op==='ai.info'||op==='storage.get'));assert.equal(f.busy.at(-1),true);
});
test('working fences repeated preparation and apply; saving still requires the existing receipt',async t=>{
 const f=await fixture(t),release=f.defer();
 const reads=f.calls.filter(op=>op==='storage.get').length;
 f.get('chat-list-prepare').dispatch('click');f.get('chat-list-prepare').dispatch('click');
 assert.equal(f.calls.filter(op=>op==='storage.get').length,reads+1);
 release();await settle();await settle();assert.ok(f.get('chat-ai-review'));
 const releaseApply=f.defer();f.get('chat-ai-apply').dispatch('click');f.get('chat-ai-apply').dispatch('click');
 releaseApply();await settle();assert.equal(f.applied.length,1);
 assert.match(f.get('chat-ai-feedback').textContent,/未保存草稿/);
 f.ui.state.savedRequestId=f.applied[0][4];f.ui.paint();
 assert.match(f.get('chat-ai-feedback').textContent,/已保存/);
 assert.ok(!f.calls.includes('storage.set'));
});
test('AI proposals continue requiring the original Provider generation on apply',async t=>{
 const f=await fixture(t,{provider:true});
 f.get('ai-requirement').value='keep rules';f.get('ai-requirement').dispatch('input');
 f.get('chat-ai-use-page').checked=true;f.get('chat-ai-use-page').dispatch('click');
 f.get('ai-requirement').closest('form').dispatch('submit');await settle();await settle();
 assert.ok(f.get('chat-ai-review'));f.setGeneration(2);
 f.get('chat-ai-apply').dispatch('click');await settle();
 assert.equal(f.applied.length,0);assert.match(f.ui.doc.querySelector('[role=alert]').textContent,/Provider 已变化/);
 assert.equal(f.calls.filter(op=>op==='ai.generate').length,1);
});

for(const change of ['input','epoch','target','base','locked','pending','invalid','unmount'])test(`AI apply rechecks ${change} after Provider generation read`,async t=>{
 const f=await fixture(t,{provider:true});
 f.get('ai-requirement').value='keep rules';f.get('ai-requirement').dispatch('input');
 f.get('chat-ai-use-page').checked=true;f.get('chat-ai-use-page').dispatch('click');
 f.get('ai-requirement').closest('form').dispatch('submit');await settle();await settle();
 assert.ok(f.get('chat-ai-review'));
 const release=f.defer('ai.info');f.get('chat-ai-apply').dispatch('click');
 if(change==='input'){f.get('chat-ai-sample').value='changed';f.get('chat-ai-sample').dispatch('input');}
 else if(change==='epoch')f.ui.state.state={...f.ui.state.state,profileEpoch:2};
 else if(change==='target')f.ui.state.state={...f.ui.state.state,target:{url:'https://example.org/'}};
 else if(change==='base')f.ui.state.state={...f.ui.state.state,config:{...f.ui.state.state.config,maxPages:2}};
 else if(change==='invalid')f.ui.state.valid=false;
 else if(change==='unmount')await f.unmount();
 else f.ui.state[change]=true;
 f.ui.paint();release();await settle();
 assert.equal(f.applied.length,0);
});
