import test from 'node:test';
import assert from 'node:assert/strict';
import {ADBLOCK_COSMETIC_STORE,validCosmeticSelector,readCosmeticState,
  addCosmeticRule,removeCosmeticRule,cosmeticForHost,hasCosmeticRule,
  ADBLOCK_COSMETIC_PICK_TTL_MS} from '../../examples/sidebar-tools/adblock/trusted/cosmetic-policy.js';
import {adblockElementSelector,createAdblockElementPicker} from '../../examples/sidebar-tools/adblock/trusted/picker.js';
import {createAdblockCosmeticController} from '../../examples/sidebar-tools/adblock/trusted/cosmetic.js';
import {writeVerifiedLocalValue} from '../../src/ui/sidebar-tools/storage-state.js';

test('selectors accept stable CSS paths and reject CSS injection',()=>{
  for(const selector of ['#sponsored','section:nth-of-type(2)',
    '#main > aside:nth-of-type(1) > div:nth-of-type(2)'])
    assert.equal(validCosmeticSelector(selector),true,selector);
  for(const selector of ['body:nth-of-type(1)','html:nth-of-type(1)',
    'main:nth-of-type(1)','#app','#root','#__next',
    '*','a[href=x]','.ad,body','div{display:block}','div:not(.ad)',
    'main:has(.ad)','a:nth-of-type(0)','section:nth-of-type(1000)',
    'div:nth-of-type(1)\nbody','',null])
    assert.equal(validCosmeticSelector(selector),false,String(selector));
});

test('selection uses unique stable id or bounded DOM path',()=>{
  const body={nodeType:1,localName:'body',id:'',parentElement:null,
    previousElementSibling:null};
  const wrapper={nodeType:1,localName:'div',id:'layout',parentElement:body,
    previousElementSibling:null};
  const first={nodeType:1,localName:'aside',id:'',parentElement:wrapper,
    previousElementSibling:null};
  const ad={nodeType:1,localName:'aside',id:'',parentElement:wrapper,
    previousElementSibling:first};
  const doc={body,documentElement:{nodeType:1},querySelectorAll:id=>
    id==='#layout'?[wrapper]:[]};
  assert.equal(adblockElementSelector(ad,doc),'#layout > aside:nth-of-type(2)');
  assert.equal(adblockElementSelector(wrapper,doc),'#layout');
  assert.equal(adblockElementSelector(body,doc),null);
  // A root-like application surface must never become a saved hide rule.
  const app={...wrapper,id:'app'};
  assert.equal(adblockElementSelector(app,doc),null);
  const main={...wrapper,localName:'main',id:'layout'};
  assert.equal(adblockElementSelector(main,doc),null);
  ad.localName='*';assert.equal(adblockElementSelector(ad,doc),null);
});

test('host-specific rules deduplicate and undo without affecting other sites',()=>{
  const blank=readCosmeticState(undefined);
  const first=addCosmeticRule(blank,'news.example.com','#promo');
  assert.equal(addCosmeticRule(first,'news.example.com','#promo'),first);
  const second=addCosmeticRule(first,'shop.example.com','#promo');
  assert.deepEqual(cosmeticForHost(second,'news.example.com'),[{selector:'#promo'}]);
  assert.deepEqual(cosmeticForHost(second,'shop.example.com'),[{selector:'#promo'}]);
  assert.deepEqual(cosmeticForHost(second,'evil.news.example.com'),[]);
  assert.equal(hasCosmeticRule(second,'news.example.com','#promo'),true);
  const restored=removeCosmeticRule(second,'news.example.com','#promo');
  assert.equal(hasCosmeticRule(restored,'news.example.com','#promo'),false);
  assert.equal(hasCosmeticRule(restored,'shop.example.com','#promo'),true);
  assert.deepEqual(cosmeticForHost(restored,'news.example.com'),[]);
  assert.deepEqual(cosmeticForHost(restored,'shop.example.com'),[{selector:'#promo'}]);
  assert.deepEqual(readCosmeticState(second),second);
});

test('corrupt state fails closed without overwriting it',()=>{
  const good={version:1,entries:[{host:'news.example.com',selector:'#ad'}]};
  for(const bad of [{...good,version:2},{...good,extra:true},
    {version:1,entries:[...good.entries,...good.entries]},
    {version:1,entries:[{host:'evil.example/',selector:'#ad'}]},
    {version:1,entries:[{host:'news.example.com',selector:'body{display:none}'}]}])
    assert.throws(()=>readCosmeticState(bad),{code:'E_ADBLOCK_COSMETIC_CORRUPT'});
});

test('Chrome local readback keeps rules after reload and deletes them on undo',async()=>{
  const memory=new Map();
  const api={storage:{local:{
    async get(key){return memory.has(key)?{[key]:structuredClone(memory.get(key))}:{};},
    async set(values){for(const [key,value] of Object.entries(values))
      memory.set(key,structuredClone(value));}
  }}};
  const initial=readCosmeticState(undefined);
  const next=addCosmeticRule(initial,'news.example.com','#native-ad');
  await writeVerifiedLocalValue(api,ADBLOCK_COSMETIC_STORE,next,initial,'手动屏蔽');
  let reloaded=readCosmeticState((await api.storage.local.get(ADBLOCK_COSMETIC_STORE))[ADBLOCK_COSMETIC_STORE]);
  assert.deepEqual(cosmeticForHost(reloaded,'news.example.com'),[{selector:'#native-ad'}]);
  const removed=removeCosmeticRule(reloaded,'news.example.com','#native-ad');
  await writeVerifiedLocalValue(api,ADBLOCK_COSMETIC_STORE,removed,reloaded,'撤销');
  reloaded=readCosmeticState((await api.storage.local.get(ADBLOCK_COSMETIC_STORE))[ADBLOCK_COSMETIC_STORE]);
  assert.deepEqual(reloaded.entries,[]);
});

test('single existing stylesheet controller supports user rules and disabling restores the page',()=>{
  const head={nodes:[],appendChild(node){this.nodes.push(node);node.parentNode=this;}};
  const doc={head,createElement:tag=>({tagName:tag,textContent:'',parentNode:null,
    remove(){const p=this.parentNode;if(p){p.nodes=p.nodes.filter(n=>n!==this);this.parentNode=null;}}})};
  const location=new URL('https://news.example.com/article');
  const controller=createAdblockCosmeticController({document:doc,location});
  assert.equal(controller.apply({version:1,enabled:true,host:'news.example.com'}),false);
  assert.equal(controller.apply({version:1,enabled:true,host:'news.example.com',
    rules:[{selector:'#native-ad'}]}),true);
  assert.match(head.nodes[0].textContent,/#native-ad \{ display: none !important; \}/);
  assert.equal(controller.apply({version:1,enabled:false,host:'news.example.com',
    rules:[{selector:'#native-ad'}]}),false);
  assert.equal(head.nodes.length,0);
  controller.dispose();
});

test('picker timeout and tab switch release the capture listeners',async()=>{
  const listeners=new Map(),timers=new Map(),sent=[];
  let serial=0;
  const element=()=>({isConnected:false,style:{},setAttribute(){},
    replaceChildren(...items){this.children=items;},
    append(child){this.children.push(child);},
    remove(){this.isConnected=false;}});
  const doc={documentElement:{append(node){node.isConnected=true;}},
    createElement:element,createTextNode:value=>({textContent:value}),
    addEventListener:(name,handler)=>listeners.set(name,handler),
    removeEventListener:name=>listeners.delete(name)};
  const win={setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id)};
  const api={runtime:{async sendMessage(value){sent.push(value);return {ok:true};}}};
  const picker=createAdblockElementPicker({api,doc,win});
  assert.equal(picker.begin(),true);
  assert.equal(listeners.size,3);
  const [deadline]=timers.values();
  assert.equal(deadline.ms,ADBLOCK_COSMETIC_PICK_TTL_MS);
  deadline.fn();
  assert.equal(listeners.size,0);
  assert.equal(timers.size,0);
  assert.equal(sent.at(-1).type,'cancel');
  assert.equal(picker.begin(),true);
  picker.cancel('标签页已切换');
  assert.equal(listeners.size,0);
  assert.equal(timers.size,0);
  assert.equal(sent.at(-1).type,'cancel');
  picker.dispose();
  assert.equal(picker.begin(),false);
});
