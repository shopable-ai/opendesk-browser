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
    '#main > aside:nth-of-type(1) > div:nth-of-type(2)',
    '.ad-banner','aside.sponsored-ad','div.promo-slot'])
    assert.equal(validCosmeticSelector(selector),true,selector);
  for(const selector of ['body:nth-of-type(1)','html:nth-of-type(1)',
    'html.ad-banner','body.ad','head.sponsor',
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

test('picker uses outline-only mode, and timeout/Esc/tab switch release listeners without webpage banners',async()=>{
  const listeners=new Map(),timers=new Map(),sent=[],injected=[];
  let serial=0;
  const element=()=>({isConnected:false,style:{},setAttribute(){},
    replaceChildren(...items){this.children=items;},
    append(child){this.children.push(child);},
    remove(){this.isConnected=false;}});
  const doc={documentElement:{append(node){node.isConnected=true;injected.push(node);}},
    createElement:element,createTextNode:value=>({textContent:value}),
    addEventListener:(name,handler)=>listeners.set(name,handler),
    removeEventListener:name=>listeners.delete(name)};
  const win={setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id)};
  const api={runtime:{async sendMessage(value){sent.push(value);return {ok:true};}}};
  const picker=createAdblockElementPicker({api,doc,win});
  assert.equal(picker.begin(),true);
  assert.equal(injected.length,0,'selecting must not inject instruction text into the target page');
  assert.equal(listeners.size,3);
  const [deadline]=timers.values();
  assert.equal(deadline.ms,ADBLOCK_COSMETIC_PICK_TTL_MS);
  deadline.fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(listeners.size,0);
  assert.equal(timers.size,0);
  assert.equal(sent.at(-1).type,'cancel');
  assert.equal(injected.length,0,'timeout must not leave a banner on the target page');
  assert.equal(picker.begin(),true);
  picker.cancel('标签页已切换');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(listeners.size,0);
  assert.equal(timers.size,0);
  assert.equal(sent.at(-1).type,'cancel');
  assert.equal(picker.begin(),true);
  listeners.get('keydown')({type:'keydown',key:'Escape',isTrusted:true,preventDefault(){}});
  assert.equal(listeners.size,0);
  assert.equal(injected.length,0,'Esc must not create a banner on the target page');
  assert.equal(sent.at(-1).type,'cancel');
  picker.dispose();
  assert.equal(picker.begin(),false);
});

function pickerOutcomeFixture(send){
  const listeners=new Map(),nodes=[],calls=[],saved=[],undone=[],feedback=[];
  const body={nodeType:1,localName:'body'};
  const target={nodeType:1,localName:'aside',id:'promo',parentElement:body,
    getAttribute:()=>null,hasAttribute:()=>false,closest:()=>null,
    getBoundingClientRect:()=>({width:140,height:60,left:10,top:10})};
  const element=()=>({isConnected:false,style:{},children:[],setAttribute(){},
    replaceChildren(...items){this.children=items;},append(child){this.children.push(child);},
    addEventListener(type,fn){this[type]=fn;},remove(){this.isConnected=false;}});
  const doc={body,documentElement:{append(node){node.isConnected=true;nodes.push(node);}},
    createElement:element,createTextNode:textContent=>({textContent}),
    querySelectorAll:()=>[target],addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:type=>listeners.delete(type)};
  const win={location:new URL('https://news.example.com/story'),innerWidth:800,innerHeight:600,
    setTimeout,clearTimeout};
  const picker=createAdblockElementPicker({doc,win,
    api:{runtime:{sendMessage:async value=>{calls.push(value.type);return send(value);}}},
    onSaved:selector=>saved.push(selector),onUndone:selector=>undone.push(selector),
    onFeedback:text=>feedback.push(text)});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const select=async()=>{picker.begin();listeners.get('click')({type:'click',isTrusted:true,target,
    preventDefault(){},stopImmediatePropagation(){}});await flush();};
  return {picker,win,calls,saved,undone,select,flush,
    text:()=>feedback.at(-1)||'',inserted:()=>nodes};
}

for(const present of [true,false,null]){
  test('lost save receipt uses a single read-only lookup: '+present,async()=>{
    const f=pickerOutcomeFixture(async value=>{
      if(value.type==='hide')throw Error('reply lost after commit');
      if(present===null)throw Error('worker unavailable');
      return {ok:true,data:{version:1,host:'news.example.com',selector:value.selector,present}};
    });
    await f.select();
    assert.deepEqual(f.calls,['hide','lookup'],'never retry the write');
    assert.equal(f.saved.length,present===true?1:0);
    assert.equal(f.undone.length,present===false?1:0);
    assert.match(f.text(),present===true?/已保存/:present===false?/不存在/:/无法确认/);
    assert.doesNotMatch(f.text(),/未保存，已恢复/);
    f.picker.dispose();
  });
  test('saving never injects webpage toast/undo controls: '+present,async()=>{
    const f=pickerOutcomeFixture(async value=>value.type==='lookup'?
      {ok:true,data:{version:1,host:'news.example.com',selector:value.selector,present}}:
      {ok:true,data:{saved:true,host:'news.example.com',selector:value.selector}});
    await f.select();
    assert.equal(f.inserted().length,0,'no text elements or buttons on target webpage');
    assert.match(f.text(),/已隐藏并保存/);
    assert.deepEqual(f.calls,['hide']);
    f.picker.dispose();
  });
}
test('lookup for another host or selector cannot confirm a failed write',async()=>{
  for(const change of [{host:'other.example.com'},{selector:'#other'},{present:'false'}]){
    const f=pickerOutcomeFixture(async value=>{
      if(value.type==='hide')throw Error('lost');
      return {ok:true,data:{version:1,host:'news.example.com',selector:'#promo',present:true,...change}};
    });
    await f.select();assert.match(f.text(),/无法确认/);assert.deepEqual(f.saved,[]);
    assert.deepEqual(f.calls,['hide','lookup']);f.picker.dispose();
  }
});
test('a malformed successful write acknowledgement still requires read-only confirmation',async()=>{
  const f=pickerOutcomeFixture(async value=>({ok:true,data:value.type==='lookup'?
    {version:1,host:'news.example.com',selector:value.selector,present:false}:{saved:true}}));
  await f.select();assert.deepEqual(f.calls,['hide','lookup']);
  assert.match(f.text(),/规则不存在/);assert.deepEqual(f.saved,[]);f.picker.dispose();
});
test('an unanswered write expires and only reads back; an unanswered lookup stays unknown',async()=>{
  for(const lookupReplies of [true,false]){
    const f=pickerOutcomeFixture(async value=>{
      if(value.type==='hide'||!lookupReplies)return new Promise(()=>{});
      return {ok:true,data:{version:1,host:'news.example.com',selector:'#promo',present:true}};
    });
    const deadlines=[];
    f.win.setTimeout=(fn,ms)=>{if(ms===3000){deadlines.push(fn);return fn;}return setTimeout(fn,ms);};
    f.win.clearTimeout=id=>{if(typeof id!=='function')clearTimeout(id);};
    await f.select();deadlines.shift()();await f.flush();
    if(!lookupReplies){deadlines.shift()();await f.flush();}
    assert.deepEqual(f.calls,['hide','lookup']);
    assert.match(f.text(),lookupReplies?/已保存/:/无法确认/);
    f.picker.dispose();
  }
});

// R2.4: source-bound workflow checks complement (not replace) real Chrome tests.
test('R2.4 host review keeps advanced CSS writes behind a separate trusted confirmation',async()=>{
  const {readFile}=await import('node:fs/promises');
  const host=await readFile(new URL('../../examples/sidebar-tools/adblock/trusted/tool-host.js',import.meta.url),'utf8');
  const first=host.indexOf("if(['adblock.cosmetic.pick'");
  const advanced=host.indexOf("if(['adblock.cosmetic.add','adblock.cosmetic.replace'].includes(operation))");
  assert.ok(first>0&&advanced>first,'advanced write branch must remain reachable');
  assert.doesNotMatch(host.slice(first,advanced),/adblock\.cosmetic\.add|adblock\.cosmetic\.replace/,
    'CSS writes must not bypass trusted review');
  assert.match(host.slice(advanced),/requestBrowserClick\(/);
  assert.match(host.slice(advanced),/event\?\.isTrusted!==true/);
});
test('R2.4 locate, inspect and temporary display use the existing page and preview protocol',async()=>{
  const {readFile}=await import('node:fs/promises');
  const root=new URL('../../examples/sidebar-tools/adblock/',import.meta.url);
  const load=(name)=>readFile(new URL(name,root),'utf8');
  const [app,policy,service,page,mock,hostPreview,previewBuilder]=await Promise.all([
    load('src/App.jsx'),load('trusted/policy.js'),load('trusted/service.js'),
    load('trusted/page.js'),
    readFile(new URL('../../scripts/preview/adblock-mock.js',import.meta.url),'utf8'),
    readFile(new URL('../../scripts/preview/adblock-host-preview.js',import.meta.url),'utf8'),
    readFile(new URL('../../scripts/preview/build-preview.mjs',import.meta.url),'utf8')]);
  for(const [owner,source] of Object.entries({app,policy,service,mock,previewBuilder}))
    assert.ok(source.includes('adblock.cosmetic.locate'),owner+' locate operation');
  assert.match(page,/locate-selector/);
  assert.match(page,/transientLocate/);
  assert.match(page,/temporarilyVisible/);
  assert.match(hostPreview,/target-locate/);
  assert.match(previewBuilder,/pkg\.js/,'preview must execute compiled package');
  assert.match(app,/validCosmeticSelector\(draft\)/);
  assert.match(app,/draftChecked===null/,'do not save without matching readback');
});
