import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8')
  .replace('  void load();',
    "  globalThis.__queueTest={enqueue,persistQueue,snapshot:()=>queue,isWriteLocked:()=>writeLocked};\n  void load();");
const ETAG='a'.repeat(64);
class Element {
  constructor(){this.dataset={};this.value='';this.children=[];this.hidden=false;this.handlers={};}
  addEventListener(kind,handler){(this.handlers[kind]??=[]).push(handler);}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
}
async function app({existing=[],setBehavior='success'}={}){
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const root={
    querySelector:selector=>{
      if(selector.startsWith('#'))return get(selector.slice(1));
      return get(selector);
    },
    querySelectorAll:()=>[],
    addEventListener(){},
    ownerDocument:{createElement:()=>new Element()}
  };
  const writes=[];
  const tool={
    root,onDispose(){},setState(){},
    async request(op,payload){
      if(op==='storage.get')return {value:payload.key==='review-queue'?existing:null,etag:ETAG};
      if(op==='storage.set'){
        writes.push(payload);
        if(setBehavior==='unknown')throw Error('simulated unknown outcome');
        return {saved:true,etag:'b'.repeat(64)};
      }
      throw Error('Unexpected bridge '+op);
    }
  };
  const context={OpenDeskTool:tool,TextEncoder,Date};
  vm.createContext(context);
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve)); // initial storage.get/load/render
  return {qa:context.__queueTest,writes,elements};
}
const sample=(id='demo12345')=>({
  id,title:'Android 开发',company:'样例科技',salary:'20-35K',
  location:'北京',description:'Kotlin',descriptionScope:'card_summary'
});
test('legacy .html IDs are migrated in memory; same job is not enqueued again',async()=>{
  const old={...sample('demo12345.html'),status:'pending_review',addedAt:1};
  const state=await app({existing:[old]});
  assert.equal(state.qa.snapshot()[0].id,'demo12345');
  await state.qa.enqueue(sample());
  assert.equal(state.writes.length,0);
  assert.equal(state.qa.snapshot().length,1);
});
test('unknown CAS storage response locks further writes, avoiding replay',async()=>{
  const state=await app({setBehavior:'unknown'});
  await state.qa.enqueue(sample());
  assert.equal(state.writes.length,1);
  assert.equal(state.qa.isWriteLocked(),true);
  await state.qa.enqueue(sample());
  assert.equal(state.writes.length,1);
  assert.match(state.elements.get('#ja-status').textContent,/锁定写入/);
});
test('full review queue is never silently truncated by adding another job',async()=>{
  const existing=Array.from({length:24},(_,i)=>sample('demo'+String(i).padStart(5,'0')));
  const state=await app({existing});
  assert.equal(state.qa.snapshot().length,24);
  await state.qa.enqueue(sample('next12345'));
  assert.equal(state.qa.snapshot().length,24);
  assert.equal(state.writes.length,0);
  assert.match(state.elements.get('#ja-status').textContent,/已满/);
});
test('successful explicit enqueue persists pending_review under original CAS token',async()=>{
  const state=await app();
  await state.qa.enqueue(sample());
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0].key,'review-queue');
  assert.equal(state.writes[0].ifMatch,ETAG);
  assert.equal(state.writes[0].value[0].status,'pending_review');
  assert.equal(state.qa.snapshot().length,1);
});
