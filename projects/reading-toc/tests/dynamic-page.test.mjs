import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createDynamicReadingToc} from '../src/page/engine.js';
import {originStorageKey,preferenceState,updateStored,updateOrigin} from '../src/page/settings.js';
import {resolveUiLocale,uiMessage} from '../src/page/localization.js';
import catalog from '../trusted/locales.generated.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function storage(initial={}){
 const values=structuredClone(initial),versions={},writes=[];
 return {values,writes,
  async get({key}){return {value:structuredClone(values[key]??null),etag:String(versions[key]||0)};},
  async set({key,value,ifMatch}){
   if(ifMatch!==String(versions[key]||0))throw Object.assign(Error('Conflict'),{code:'E_STORAGE_CONFLICT'});
   values[key]=structuredClone(value);versions[key]=(versions[key]||0)+1;writes.push({key,value});return {saved:true};
  }};
}
function events(target={}){
 const listeners=new Map();
 return Object.assign(target,{listeners,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},fire(type,event={}){for(const fn of [...listeners.get(type)||[]])fn(event);}});
}
function fixture(initial={}){
 const $=load('<main><article><h1>Article</h1><h2>Details</h2></article></main>'),cache=new WeakMap();
 const timers=new Map(),frames=new Map(),observers=[],views=[];let serial=0,scrolls=0,handler=null,contextFailure=false;
 const win=events({location:new URL('https://example.org/article'),innerWidth:1200,innerHeight:800,crypto:{subtle:{digest:async(_,bytes)=>createHash('sha256').update(bytes).digest()}},
  getComputedStyle:()=>({display:'block',visibility:'visible',overflowY:'visible',position:'static'}),
  setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
  MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},
  scrollTo({top}){scrolls++;doc.scrollingElement.scrollTop=top;win.scrollY=top;}});
 const wrap=node=>{
  if(!node)return null;
  if(!cache.has(node))cache.set(node,{
   get tagName(){return node.name?.toUpperCase();},get textContent(){return $(node).text();},
   get parentElement(){return wrap(node.parent);},isConnected:true,
   closest:sel=>wrap($(node).closest(sel)[0]),matches:sel=>$(node).is(sel),contains(other){return other===this;},
   querySelector:sel=>wrap($(node).find(sel)[0]),getAttribute:key=>$(node).attr(key)??null,
   getClientRects:()=>[1],getBoundingClientRect(){const top=(node.name==='h2'?900:200)-(doc.scrollingElement.scrollTop||0);return {top,bottom:top+30,left:100,right:500,width:400,height:30};}
  });return cache.get(node);
 };
 const doc=events({body:wrap($('body')[0]),documentElement:wrap($('html')[0]),defaultView:win,location:win.location,visibilityState:'visible',
  querySelector:sel=>wrap($(sel)[0]),querySelectorAll:sel=>$(sel).toArray().map(wrap)});
 doc.scrollingElement=doc.documentElement;Object.assign(doc.scrollingElement,{scrollTop:0,scrollHeight:4000,clientHeight:800});
 const store=storage(initial),disposeCallbacks=[];
 const owner={onDispose:fn=>disposeCallbacks.push(fn),destroy(){this.destroyed=true;return Promise.all(disposeCallbacks.map(fn=>fn()));}};
 const bridge={storage:store,async readContext(){if(contextFailure)throw Error('Revoked');return {locale:'en',catalog,data:store.values};},
  onRequest(fn){handler=fn;return ()=>{handler=null;};}};
 const engine=createDynamicReadingToc({bridge,owner,doc,win,createView(options){
  const node={removed:false};const view={options,node,render(snapshot){this.snapshot=snapshot;},setLocale(){},placements:[],collapses:[],setPlacement(value){this.placements.push(value);},setCollapsed(value){this.collapses.push(value);},dispose(){node.removed=true;}};
  views.push(view);return view;
 }});
 const paint=async()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn();}await tick();};
 const advance=async ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry,'scheduled '+ms);timers.delete(entry[0]);await entry[1].fn();await tick();};
 const runNavigation=async(id='h-2')=>{const p=engine.navigate(id,'s-1');await tick();await paint();await paint();return p;};
 return {engine,doc,win,store,owner,views,observers,timers,frames,paint,advance,runNavigation,
  get handler(){return handler;},get scrolls(){return scrolls;},revoke(){contextFailure=true;}};
}

test('real shared index serves requests independently of sidebar and managed disposal removes resources',async()=>{
 const f=fixture();await f.engine.ready;
 const snapshot=await f.handler({operation:'toc.snapshot'});
 assert.deepEqual(snapshot.items.map(v=>v.label),['Article','Details']);
 assert.equal(f.views.length,1);assert.equal(f.observers[0].active,true);
 await f.owner.destroy();
 assert.equal(f.views[0].node.removed,true);assert.equal(f.observers[0].active,false);
 assert.equal(f.handler,null);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
 assert.ok([...f.doc.listeners.values(),...f.win.listeners.values()].every(set=>set.size===0));
 await assert.rejects(f.engine.handle({operation:'toc.snapshot'}));
});
test('disabled site stops indexing and can re-enable through polling without sidebar',async()=>{
 const f=fixture();await f.engine.ready;
 f.store.values.preferences={blockedOrigins:['https://example.org']};await f.engine.refreshPolicy();
 assert.equal(f.observers[0].active,false);assert.equal(f.views[0].node.removed,true);
 const off=await f.handler({operation:'toc.snapshot'});assert.equal(off.settings.enabled,false);assert.deepEqual(off.items,[]);
 assert.equal((await f.engine.navigate('h-1','s-1')).ok,false);
 f.store.values.preferences={blockedOrigins:[]};await f.advance(1500);
 assert.equal(f.observers.at(-1).active,true);assert.equal(f.views.at(-1).node.removed,false);await f.owner.destroy();
});
test('hidden page removes only overlay; snapshots/navigation remain available',async()=>{
 const f=fixture();await f.engine.ready;
 f.store.values.preferences={hiddenPages:['https://example.org/article']};await f.engine.refreshPolicy();
 assert.equal(f.views[0].node.removed,true);assert.equal(f.observers[0].active,true);
 const snapshot=await f.handler({operation:'toc.snapshot'});assert.equal(snapshot.items.length,2);
 assert.equal((await f.runNavigation()).ok,true);await f.owner.destroy();
});
test('failed authorization read immediately retires overlay, handler, observers and timers',async()=>{
 const f=fixture();await f.engine.ready;f.revoke();await f.engine.refreshPolicy();
 assert.equal(f.owner.destroyed,true);assert.equal(f.views[0].node.removed,true);
 assert.equal(f.handler,null);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});
test('unchanged polls do not invalidate navigation and success requires measured position',async()=>{
 const f=fixture();await f.engine.ready;
 const promise=f.engine.navigate('h-2','s-1');await tick();
 await f.engine.refreshPolicy();await f.paint();await f.paint();
 assert.equal((await promise).ok,true);assert.equal(f.scrolls,1);
 assert.equal(f.views[0].snapshot.activeId,'h-2');await f.owner.destroy();
});
test('sticky header geometry is measured and corrected after layout changes',async()=>{
 const f=fixture();await f.engine.ready;let bottom=110;
 const sticky={parentElement:null,closest:()=>null,getBoundingClientRect:()=>({top:0,bottom,height:bottom})};
 f.doc.elementsFromPoint=()=>[sticky];f.win.getComputedStyle=node=>({position:node===sticky?'sticky':'static'});
 const promise=f.engine.navigate('h-2','s-1');await tick();bottom=180;
 await f.paint();await f.paint();await f.paint();await f.paint();
 assert.equal((await promise).ok,true);assert.equal(f.scrolls,2);await f.owner.destroy();
});
test('URL, document, index revision, permission and dispose changes cancel pending navigation',async()=>{
 for(const change of ['url','document','revision','permission','dispose','input']){
  const f=fixture();await f.engine.ready;
  const promise=f.engine.navigate('h-2','s-1');await tick();
  if(change==='url')f.win.location=new URL('https://example.org/other');
  if(change==='document')f.doc.documentElement.isConnected=false;
  if(change==='revision')await f.handler({operation:'toc.snapshot',payload:{refresh:true}});
  if(change==='permission')f.store.values.preferences={disabledPages:['https://example.org/article']};
  if(change==='dispose')await f.owner.destroy();
  if(change==='input')f.doc.fire('wheel');
  await f.paint();await f.paint();assert.equal((await promise).ok,false,change);
  await f.owner.destroy();assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
 }
});
test('frame timeout fails measured navigation rather than reporting attempted scroll as success',async()=>{
 const f=fixture();await f.engine.ready;const promise=f.engine.navigate('h-2','s-1');await tick();
 await f.advance(650);assert.equal((await promise).ok,false);await f.owner.destroy();
});
test('streaming mutations debounce at 280ms and scroll updates active heading',async()=>{
 const f=fixture();await f.engine.ready;const before=(await f.handler({operation:'toc.snapshot'})).revision;
 f.observers[0].fn([]);f.observers[0].fn([]);assert.equal([...f.timers.values()].filter(t=>t.ms===280).length,1);
 await f.advance(280);assert.equal((await f.handler({operation:'toc.snapshot'})).revision,before+1);
 f.win.scrollTo({top:850});f.doc.fire('scroll');await f.paint();
 assert.equal(f.views[0].snapshot.activeId,'h-2');await f.owner.destroy();
});
test('origin CAS merges concurrent placement/collapse, preserves migration, detects collisions and capacity',async()=>{
 const key=await originStorageKey('https://example.org');assert.match(key,/^origin\.[a-f0-9]{12}$/);
 const s=storage({[key]:{origin:'https://example.org',collapsed:false,legacyMigration:{v:1}}});
 await Promise.all([updateOrigin(s,key,'https://example.org',{placement:{v:1,dock:'left',x:0,y:.3}}),updateOrigin(s,key,'https://example.org',{collapsed:true})]);
 assert.equal(s.values[key].collapsed,true);assert.equal(s.values[key].placement.dock,'left');assert.deepEqual(s.values[key].legacyMigration,{v:1});
 const old=structuredClone(s.values);await assert.rejects(updateOrigin(s,key,'https://collision.org',{collapsed:false}),/collision/);assert.deepEqual(s.values,old);
 let calls=0;s.set=async()=>{calls++;throw Object.assign(Error('Full'),{code:'E_STORAGE_QUOTA'});};
 await assert.rejects(updateStored(s,key,v=>({...v,collapsed:false})),/Full/);assert.equal(calls,1);assert.deepEqual(s.values,old);
});
test('preference matching uses full origin/exact page, validates lists and rejects unsupported URLs',()=>{
 assert.equal(preferenceState({disabledPages:['https://example.org/a']},'https://example.org/a#section').enabled,false);
 assert.equal(preferenceState({blockedOrigins:['https://example.org']},'https://example.org.evil/a').enabled,true);
 assert.equal(preferenceState({hiddenSites:['https://example.org']},'https://example.org/a').visible,false);
 assert.throws(()=>preferenceState({disabledPages:'bad'},'https://example.org/a'));
 assert.throws(()=>preferenceState({},'file:///tmp/a'));
});
test('locale helper preserves regional fallback, reviewed translations and safe parameter interpolation',()=>{
 assert.equal(resolveUiLocale('en-US',['en','zh-CN']),'en');
 const c={sourceLocale:'en',messages:{en:{x:'Hello {name}'},ja:{x:{source:'Hello {name}',text:'こんにちは {name}'}}}};
 assert.equal(uiMessage(c,'ja','x',{name:'Joe'}),'こんにちは Joe');
 c.messages.ja.x.source='old';assert.equal(uiMessage(c,'ja','x',{name:'Joe'}),'Hello Joe');
 assert.equal(uiMessage(c,'en','x',{name:{}}),'Hello ');
});

// Execute the actual sidebar program against a small DOM/SDK fixture.
class SidebarNode{
 constructor(tag='div'){events(this);this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.dataset={};this.style={setProperty(){}};this.textContent='';this.hidden=false;}
 append(...nodes){this.children.push(...nodes.flatMap(n=>n.tagName==='FRAGMENT'?n.children:[n]));}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attributes.set(k,String(v));}removeAttribute(k){this.attributes.delete(k);}
 focus(){this.focused=true;}
 get options(){return this.children.filter(n=>n.tagName==='OPTION');}
 querySelector(selector){return this.children.find(node=>node.tagName===selector.toUpperCase())||null;}
 querySelectorAll(selector){return this.children.flatMap(n=>[n,...n.querySelectorAll(selector)]).filter(n=>
  selector==='button'?n.tagName==='BUTTON':selector==='input'?n.tagName==='INPUT':
  selector==='input[data-toc-setting]'?n.dataset.tocSetting:selector==='[data-setting-label]'?n.settingLabel:false);}
}
async function sidebarFixture({navigation=false,rejectActions=false}={}){
 const fields=['blockedOrigins','disabledPages','hiddenSites','hiddenPages'];
 const nodes=Object.fromEntries(['toc-source','toc-list','toc-empty','toc-error','toc-overview-more','toc-refresh','toc-settings','toc-settings-error','toc-settings-open','toc-settings-back','toc-free-view'].map(id=>[id,new SidebarNode(id==='toc-source'?'select':'div')]));
 const modes=['top','focus','full','ai'].map(mode=>{const n=new SidebarNode('button');n.dataset.tocMode=mode;return n;});
 const inputs=fields.map(field=>{const n=new SidebarNode('input');n.dataset.tocSetting=field;return n;});
 nodes['toc-settings'].append(...inputs);
 const containers=Object.fromEntries(['.toc-panel','.toc-head','.toc-title','.toc-modes','.toc-scroll'].map(s=>[s,new SidebarNode()]));
 const root=events({querySelector:s=>s.startsWith('#')?nodes[s.slice(1)]:containers[s],querySelectorAll:()=>modes});
 const requests=[],store=storage({preferences:{blockedOrigins:[],disabledPages:[],hiddenSites:[],hiddenPages:[],custom:'preserve'},legacyMigration:{version:1}});
 const data={url:'https://example.org/article?x=1',items:[{id:'h-1',sourceId:'s-1',label:'Article',depth:0,topId:'h-1'}],sources:[{id:'s-1',label:'Article'}],activeId:'h-1'};
 let conflict=false,quota=false,unconfirmed=false,saveGate=null,releaseSave=null,localeChange=null;
 const states=[],navigations=[];
 const request=async(name,payload)=>{
  requests.push({name,payload});
  if(name==='page.request')return payload.operation==='toc.snapshot'?data:{ok:true};
  if(name==='storage.get')return store.get(payload);
  if(name==='storage.set'){
   if(saveGate)await saveGate;
   if(unconfirmed)return {saved:false};
   if(quota)throw Object.assign(Error('Full'),{code:'E_STORAGE_QUOTA'});
   if(conflict){conflict=false;const before=await store.get({key:'preferences'});
    await store.set({key:'preferences',value:{...before.value,hiddenSites:['https://peer.org']},ifMatch:before.etag});
    throw Object.assign(Error('Conflict'),{code:'E_STORAGE_CONFLICT'});}
   return store.set(payload);
  }
  throw Error('Unexpected operation '+name);
 };
 const document=events({createElement:tag=>new SidebarNode(tag),createDocumentFragment:()=>new SidebarNode('fragment'),hidden:false});
 const sidebarCatalog={sourceLocale:catalog.sourceLocale,messages:Object.fromEntries(Object.entries(catalog.messages).map(([locale,rows])=>[locale,Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,typeof value==='string'?value:value.text]))]))};
 const window=events(),timers=new Map();let serial=0;
 runInNewContext(await readFile(new URL('../src/main.js',import.meta.url),'utf8'),{
  globalThis:{OpenDeskTool:{root,request,setState(state){states.push({...state});},onLocaleChange(fn){localeChange=fn;},messages:sidebarCatalog,locale:'en',
   ...(navigation?{navigationFeatures:{headerActions:true},setNavigation(state){navigations.push(state);return !(rejectActions&&state.headerActions);}}:{})}},__OPENDESK_TOOL_MESSAGES__:sidebarCatalog,
  document,window,URL,Intl,setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)});
 await tick();await tick();
 return {root,containers,navigations,nodes,inputs,modes,store,requests,window,states,conflict(){conflict=true;},quota(){quota=true;},
  unconfirmed(){unconfirmed=true;},holdSave(){saveGate=new Promise(resolve=>{releaseSave=resolve;});},
  releaseSave(){releaseSave();saveGate=null;},changeLocale(next){localeChange(next);}};
}
test('sidebar uses page.request for snapshots/navigation and settings CAS merges independent edits',async()=>{
 const f=await sidebarFixture();assert.equal(f.nodes['toc-list'].children.length,1);
 f.nodes['toc-list'].children[0].children[0].fire('click');await tick();
 assert.ok(f.requests.some(r=>r.name==='page.request'&&r.payload.operation==='toc.navigate'));
 assert.ok(f.requests.every(r=>!r.name.startsWith('toc.')));
 for(const mode of f.modes){mode.fire('click');assert.equal(mode.attributes.get('aria-pressed'),'true');}
 f.conflict();f.inputs[1].checked=false;
 f.nodes['toc-settings'].fire('change',{target:f.inputs[1]});await tick();await tick();
 assert.deepEqual(f.store.values.preferences.disabledPages,['https://example.org/article']);
 assert.deepEqual(f.store.values.preferences.hiddenSites,['https://peer.org']);
 assert.equal(f.store.values.preferences.custom,'preserve');assert.deepEqual(f.store.values.legacyMigration,{version:1});
 f.window.fire('pagehide');
});
test('sidebar capacity errors preserve settings and do not retry unknown writes',async()=>{
 const f=await sidebarFixture(),before=structuredClone(f.store.values);f.quota();
 f.inputs[0].checked=false;f.nodes['toc-settings'].fire('change',{target:f.inputs[0]});await tick();await tick();
 assert.deepEqual(f.store.values,before);
 assert.equal(f.requests.filter(r=>r.name==='storage.set').length,1);assert.equal(f.inputs[0].checked,true);
 assert.equal(f.nodes['toc-settings-error'].hidden,false);assert.match(f.nodes['toc-settings-error'].textContent,/Full/);
 f.window.fire('pagehide');
});

test('settings use a header action and subpage while preserving the outline and selected mode',async()=>{
 const f=await sidebarFixture({navigation:true});
 assert.equal(f.nodes['toc-settings'].hidden,true);
 assert.equal(f.nodes['toc-settings-open'].hidden,true);
 assert.equal(f.navigations.at(-1).headerActions[0].id,'settings');
 assert.equal(f.containers['.toc-title'].hidden,true);
 f.modes[2].fire('click');
 const outline=f.nodes['toc-list'].children;
 f.root.fire('opendesk-tool-navigation',{detail:{action:'header',page:'home',actionId:'settings'}});
 assert.equal(f.nodes['toc-settings'].hidden,false);
 assert.equal(f.nodes['toc-free-view'].hidden,true);
 assert.equal(f.navigations.at(-1).page,'settings');assert.equal(f.navigations.at(-1).canBack,true);
 assert.equal(f.navigations.at(-1).headerActions.length,0);
 f.root.fire('opendesk-tool-navigation',{detail:{action:'back'}});
 assert.equal(f.nodes['toc-settings'].hidden,true);assert.equal(f.nodes['toc-free-view'].hidden,false);
 assert.equal(f.modes[2].attributes.get('aria-pressed'),'true');
 assert.equal(f.nodes['toc-list'].children,outline);
 const count=f.navigations.length;f.window.fire('pagehide');
 f.root.fire('opendesk-tool-navigation',{detail:{action:'header',page:'home',actionId:'settings'}});
 assert.equal(f.navigations.length,count);
});
test('old or declined header actions keep a local gear and safe back navigation',async()=>{
 for(const options of [{},{navigation:true,rejectActions:true}]){
  const f=await sidebarFixture(options);
  assert.equal(f.nodes['toc-settings-open'].hidden,false);
  f.nodes['toc-settings-open'].fire('click');
  assert.equal(f.nodes['toc-settings'].hidden,false);
  assert.equal(f.nodes['toc-settings-back'].hidden,!!options.navigation);
  if(options.navigation){
   assert.equal(f.navigations.at(-1).page,'settings');assert.equal(f.navigations.at(-1).headerActions,undefined);
   f.root.fire('opendesk-tool-navigation',{detail:{action:'back'}});
  }else f.nodes['toc-settings-back'].fire('click');
  assert.equal(f.nodes['toc-settings'].hidden,true);f.window.fire('pagehide');
 }
});
test('settings cannot leave a pending or unconfirmed save and opening them never writes preferences',async()=>{
 const f=await sidebarFixture();f.nodes['toc-settings-open'].fire('click');
 assert.equal(f.requests.filter(r=>r.name==='storage.set').length,0);
 f.holdSave();f.unconfirmed();f.inputs[0].checked=false;
 f.nodes['toc-settings'].fire('change',{target:f.inputs[0]});await tick();
 f.nodes['toc-settings-back'].fire('click');assert.equal(f.nodes['toc-settings'].hidden,false);
 f.releaseSave();await tick();await tick();
 f.nodes['toc-settings-back'].fire('click');assert.equal(f.nodes['toc-settings'].hidden,false);
 assert.equal(f.nodes['toc-settings-error'].hidden,false);f.window.fire('pagehide');
});

test('overlay callbacks persist preferences and managed disposal waits for submitted writes',async()=>{
 const key=await originStorageKey('https://example.org');
 const f=fixture({[key]:{origin:'https://example.org',collapsed:false},legacyMigration:{version:1}});
 await f.engine.ready;
 f.views[0].options.onPlacementChange({v:1,dock:'right',x:1,y:.5});await tick();
 assert.equal(f.store.values[key].placement.dock,'right');
 const originalSet=f.store.set;let release;
 f.store.set=async payload=>{await new Promise(resolve=>{release=resolve;});return originalSet(payload);};
 f.views[0].options.onCollapseChange(true);await tick();assert.equal(typeof release,'function');
 let finished=false;const cleanup=f.owner.destroy().then(()=>{finished=true;});await tick();assert.equal(finished,false);
 release();await cleanup;assert.equal(f.store.values[key].collapsed,true);
 assert.deepEqual(f.store.values.legacyMigration,{version:1});assert.equal(f.views[0].node.removed,true);
 const count=f.store.writes.length;f.views[0].options.onCollapseChange(false);await tick();assert.equal(f.store.writes.length,count);
});
test('origin hash collision fails closed without overwriting either origin record',async()=>{
 const key=await originStorageKey('https://example.org'),value={origin:'https://other.org',collapsed:true};
 const f=fixture({[key]:value});await f.engine.ready;
 assert.equal(f.owner.destroyed,true);assert.equal(f.views.length,0);assert.deepEqual(f.store.values[key],value);assert.equal(f.store.writes.length,0);
});
test('occluded heading cannot produce navigation success despite completed scroll frames',async()=>{
 const f=fixture();await f.engine.ready;f.doc.elementFromPoint=()=>({});
 const promise=f.engine.navigate('h-2','s-1');await tick();
 for(let i=0;i<6;i++)await f.paint();
 assert.equal((await promise).ok,false);assert.equal(f.scrolls,3);await f.owner.destroy();
});
test('page-level migrated settings cover queries and anchors while keeping other paths enabled',()=>{
 const preferences={disabledPages:['https://example.org/article'],hiddenPages:['https://example.org/article']};
 assert.deepEqual(preferenceState(preferences,'https://example.org/article?x=1#part'),{
  origin:'https://example.org',page:'https://example.org/article',enabled:false,visible:false});
 assert.equal(preferenceState(preferences,'https://example.org/other').enabled,true);
});

test('policy polls apply only changed geometry and defer stored updates during local writes',async()=>{
 const key=await originStorageKey('https://example.org');
 const f=fixture({[key]:{origin:'https://example.org',collapsed:false}});await f.engine.ready;
 const view=f.views[0];await f.engine.refreshPolicy();await f.engine.refreshPolicy();
 assert.equal(view.placements.length,0);assert.equal(view.collapses.length,0);
 f.store.values[key].placement={v:1,dock:'left',x:0,y:.3};await f.engine.refreshPolicy();await f.engine.refreshPolicy();
 assert.equal(view.placements.length,1);
 const originalSet=f.store.set;let release,held=false;
 f.store.set=async payload=>{if(!held){held=true;await new Promise(resolve=>{release=resolve;});}return originalSet(payload);};
 view.options.onCollapseChange(true);await tick();
 const before=await f.store.get({key});
 await originalSet({key,value:{...before.value,placement:{v:1,dock:'right',x:1,y:.3}},ifMatch:before.etag});
 await f.engine.refreshPolicy();
 assert.equal(view.placements.length,1);assert.equal(view.collapses.length,0);
 release();await tick();await f.engine.refreshPolicy();await f.engine.refreshPolicy();
 assert.equal(view.placements.length,2);assert.deepEqual(view.collapses,[true]);await f.owner.destroy();
});

test('confirmed settings save clears dirty after busy completion; polls never clear state',async()=>{
 const f=await sidebarFixture();f.holdSave();f.inputs[2].checked=false;
 f.nodes['toc-settings'].fire('change',{target:f.inputs[2]});await tick();
 assert.deepEqual(f.states,[{dirty:true,busy:true}]);
 f.releaseSave();await tick();await tick();
 assert.deepEqual(f.states,[{dirty:true,busy:true},{dirty:false,busy:false}]);
 assert.deepEqual(f.store.values.preferences.hiddenSites,['https://example.org']);
 const count=f.states.length;f.window.fire('focus');await tick();await tick();assert.equal(f.states.length,count);
 assert.equal(f.nodes['toc-settings-open'].title,'Site and page settings');
 f.changeLocale('zh-CN');assert.equal(f.nodes['toc-settings-open'].title,'网站与页面设置');
 // Restoring a saved setting follows the same confirmed-save state transition.
 f.inputs[2].checked=true;f.nodes['toc-settings'].fire('change',{target:f.inputs[2]});await tick();await tick();
 assert.deepEqual(f.states.slice(-2),[{dirty:true,busy:true},{dirty:false,busy:false}]);
 assert.deepEqual(f.store.values.preferences.hiddenSites,[]);f.window.fire('pagehide');
});
test('failed or unconfirmed settings saves retain dirty protection after busy ends and later polls',async()=>{
 for(const failure of ['quota','unconfirmed']){
  const f=await sidebarFixture();f[failure]();f.inputs[2].checked=false;
  f.nodes['toc-settings'].fire('change',{target:f.inputs[2]});await tick();await tick();
  assert.deepEqual(f.states,[{dirty:true,busy:true},{dirty:true,busy:false}],failure);
  assert.deepEqual(f.store.values.preferences.hiddenSites,[]);
  const count=f.states.length;f.window.fire('focus');await tick();await tick();
  assert.equal(f.states.length,count);assert.equal(f.states.at(-1).dirty,true);
  f.window.fire('pagehide');
 }
});
