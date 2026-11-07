import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import {runInspection} from '../controller/inspect-page.js';
import {ItemLoader} from '../engine/browser.js';
import {applyInlineField} from '../src/editor.js';
import {createInspection} from '../src/page-inspection.js';
import * as React from 'react';
import {transform} from 'esbuild';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';
// Match the existing React Aria DOM fixture; no browser capability is implied.
globalThis.CSS??={escape:value=>Array.from(String(value),char=>'\\'+char.codePointAt(0).toString(16)+' ').join('')};

const url='http://127.0.0.1:43111/records.html';
const html='<main class="catalog"><article class="book"><a href="/a">Same</a><b>10</b><i>x</i><i>y</i></article><article class="book"><a href="/b">Same</a></article><article class="book"><a href="/c">Third</a><b>30</b><i>z</i></article></main>';
const fields={title:'.catalog article.book a::text',url:'.catalog article.book a::href',price:'.catalog article.book b::text',tags:{selector:'.catalog article.book i',read:'text',cardinality:'many'}};
const config={url,itemConfig:fields,output:{fieldNames:{title:'标题'}},nextPageSelector:'a.next',maxPages:2,dedupeKey:'url'};
const expected=[{title:'Same',url:'/a',price:'10',tags:['x','y']},{title:'Same',url:'/b',price:'',tags:[]},{title:'Third',url:'/c',price:'30',tags:['z']}];
const plain=value=>JSON.parse(JSON.stringify(value));
function page(source=html){
 const document=new DOMParser().parseFromString(source,'text/html');
 return {url:async()=>url,evaluate:async(fn,...args)=>plain(vm.runInNewContext('('+fn.toString()+')(...args)',{document,location:{href:url},args}))};
}
const input={url,kind:'records',container:'',item:'',mode:'snapshot',itemConfig:fields,required:['url'],identity:['url']};
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function compile(path,replacements={}){
 let {code}=await transform(await readFile(new URL(path,import.meta.url),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'});
 for(const [from,to] of Object.entries({react:import.meta.resolve('react'),'react-aria-components':import.meta.resolve('react-aria-components'),...replacements}))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return moduleURL(code);
}
const button=await compile('../../../src/ui/react/components/ui/button.tsx');
const {ListScopeAssistant}=await import(await compile('../src/PageAssistant.jsx',{'@opendesk/ui':button,'./page-inspection.js':new URL('../src/page-inspection.js',import.meta.url).href}));

test('existing scope control consumes real preparation and original save/reopen retains the explicit rule',async t=>{
 const context=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
 for(const path of ['../src/app-model.js','../adapters/app-sdk.js'])vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
 const old={OpenDeskTool:globalThis.OpenDeskTool,ScrapyAppSdk:globalThis.ScrapyAppSdk,ScrapyAppModel:globalThis.ScrapyAppModel};
 let record={value:null,etag:'0'},inspection,applied,feedback='',starts=0;
 const request=async(op,payload)=>{
  if(op==='currentPage.info')return {status:'available',url};
  if(op==='controllers.read')return payload.clientRequestId?inspection:{controller:{}};
  if(op==='controllers.start'){
   starts++;const options=JSON.parse(payload.params.optionsJson);
   assert.ok(options.inspection,'the prepare gesture cannot collect');
   inspection={clientRequestId:payload.clientRequestId,runId:'r1',resultId:'result1',state:'completed',retirementState:'released',value:await runInspection({...options.inspection,url:payload.params.url},page())};
   return inspection;
  }
  if(op==='storage.get')return structuredClone(record);
  if(op==='storage.set'){assert.equal(payload.ifMatch,record.etag);record={value:plain(payload.value),etag:'1'};return {saved:true};}
  throw Error('Unexpected '+op);
 };
 Object.assign(globalThis,{OpenDeskTool:{request},ScrapyAppSdk:context.ScrapyAppSdk,ScrapyAppModel:context.ScrapyAppModel});
 t.after(()=>Object.assign(globalThis,old));
 const ui=createExtensionCenterDOM(t,{component:()=>React.createElement(ListScopeAssistant,{scope:{container:'',item:''},config,disabled:false,onOpenChange(){},onFeedback:text=>{feedback=text;},onUse:change=>{applied=applyInlineField(config,{scopeOnly:true,...change});}})});
 const trigger=ui.doc.querySelector('[aria-label="从完整字段准备逐条记录"]');assert.ok(trigger);
 trigger.dispatch('click');
 for(let i=0;i<25&&!applied;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(applied?.itemConfig._listItem,feedback);assert.match(feedback,/3 条记录/);assert.equal(starts,1);
 assert.equal(record.value,null,'preparation must not auto-save');
 const app=context.ScrapyAppModel.createApp(context.ScrapyAppSdk.createSdk(request));
 await app.load();app.edit(applied);assert.equal(await app.save('完整字段记录'),true);
 const reopened=context.ScrapyAppModel.createApp(context.ScrapyAppSdk.createSdk(request));await reopened.load();
 assert.deepEqual(plain(reopened.state.config),applied);assert.deepEqual(await ItemLoader.parse(page(),reopened.state.config.itemConfig),expected);
 assert.equal(starts,1,'save and reopen never infer again');
});

test('fixed page inspection prepares original complete fields, then original parse preserves record ownership on two pages',async()=>{
 const before=JSON.stringify(input),result=await runInspection(input,page());
 assert.equal(result.kind,'records');assert.equal(result.status,'ready',JSON.stringify(result));
 assert.equal(result.choices.length,1);
 const choice=result.choices[0];assert.equal(choice.count,3);
 const next=applyInlineField(config,{scopeOnly:true,container:'',item:choice.itemConfig._listItem,
  preparedList:{base:JSON.stringify(config),itemConfig:choice.itemConfig,rowShape:choice.rowShape}});
 assert.ok(next.itemConfig._listItem,'the consumer, never this driver, prepares the record selector');
 assert.deepEqual({...next,itemConfig:fields},config);
 const saved=JSON.stringify(next);
 for(let i=0;i<2;i++)assert.deepEqual(await ItemLoader.parse(page(),JSON.parse(saved).itemConfig),expected);
 const second=html.replace('href="/a"','href="/d"').replace('href="/b"','href="/e"').replace('href="/c"','href="/f"').replace('Third','Fourth');
 assert.deepEqual(await ItemLoader.parse(page(second),JSON.parse(saved).itemConfig),expected.map((row,i)=>({...row,url:['/d','/e','/f'][i],...(i===2?{title:'Fourth'}:{})})));
 assert.equal(JSON.stringify(input),before);
});

test('ambiguous or excluded evidence returns no applicable choice and never invents a scope',async()=>{
 const ambiguous='<main class="catalog"><div class="product"><article class="sku"><a>A</a></article></div><div class="product"><article class="sku"><a>C</a></article></div></main>';
 for(const [source,itemConfig,code] of [[ambiguous,{title:'.catalog .product .sku a::text'},'E_LIST_AMBIGUOUS'],[html.replace('<b>10</b>','<b hidden>10</b>'),fields,'E_LIST_EXCLUDED'],['<form>'+html+'</form>',fields,'E_LIST_EXCLUDED']]){
  const result=await runInspection({...input,itemConfig,required:[],identity:[]},page(source));
  assert.notEqual(result.status,'ready');assert.deepEqual(result.choices,[]);assert.ok(result.diagnostics.some(row=>row.code===code),JSON.stringify(result));
 }
});

test('prepared scope updates row shape, while later manual scope edits cannot reuse the old preparation',()=>{
 const initial={...config,validation:{version:1,rowShape:'old'}};
 const itemConfig={_listItem:'.catalog article.book',title:'a::text'};
 const form={scopeOnly:true,container:'',item:itemConfig._listItem,preparedList:{base:JSON.stringify(initial),itemConfig,rowShape:'article.book'}};
 const next=applyInlineField(initial,form);
 assert.deepEqual(next.itemConfig,itemConfig);assert.equal(next.validation.rowShape,'article.book');
 const edited=applyInlineField(next,{...form,item:'.other'});
 assert.equal(edited.itemConfig._listItem,'.other');assert.equal(edited.itemConfig.title,'a::text');
});

test('original inspection session rechecks the exact released request before using prepared fields',async()=>{
 const result=await runInspection(input,page());let reads=0;
 const receipt=id=>({clientRequestId:id,runId:'records-1',status:'completed',retired:true,result});
 const session=createInspection({prepare:async()=>{},currentPage:async()=>({status:'available',url}),inspect:async(_,id)=>receipt(id),read:async id=>{reads++;return receipt(id);}});
 await session.begin(input,'original');assert.equal(session.state.phase,'ready');
 assert.deepEqual(await session.use(0,'original'),result.choices[0]);assert.equal(reads,2);
 await assert.rejects(session.use(0,'changed'),/配置/);
});

test('inline preparation can cancel an unknown request and stays locked until original release without replay',async t=>{
 const old={ScrapyAppSdk:globalThis.ScrapyAppSdk,OpenDeskTool:globalThis.OpenDeskTool};
 let id,starts=0,stops=0,released=false,locked=false,applied=false;
 const sdk={prepare:async()=>{},currentPage:async()=>({status:'available',url}),
  inspect:async(_,requestId)=>{id=requestId;starts++;throw Error('读取结果未知');},
  stop:async requestId=>{assert.equal(requestId,id);stops++;throw Error('停止回执未知');},
  read:async requestId=>{assert.equal(requestId,id);return {clientRequestId:id,runId:'original',status:'cancelled',retired:released};}};
 Object.assign(globalThis,{ScrapyAppSdk:{createSdk:()=>sdk},OpenDeskTool:{request(){throw Error('unexpected');}}});
 t.after(()=>Object.assign(globalThis,old));
 const ui=createExtensionCenterDOM(t,{component:()=>React.createElement(ListScopeAssistant,{scope:{container:'',item:''},config,disabled:false,onOpenChange:value=>{locked=value;},onUse:()=>{applied=true;}})});
 ui.doc.querySelector('[aria-label="从完整字段准备逐条记录"]').dispatch('click');
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 await settle();assert.equal(locked,true);assert.equal(starts,1);
 const cancel=()=>[...ui.doc.querySelectorAll('button')].find(node=>node.textContent==='取消检查');
 assert.ok(cancel(),'unknown inline preparation must have a visible cancellation control');
 cancel().dispatch('click');await settle();assert.equal(stops,1);assert.equal(locked,true);
 assert.equal(ui.doc.querySelector('[aria-label="从完整字段准备逐条记录"]').disabled,true);
 released=true;cancel().dispatch('click');await settle();
 assert.equal(locked,false);assert.equal(starts,1);assert.equal(stops,1);assert.equal(applied,false);
 assert.equal(cancel(),undefined);
});
