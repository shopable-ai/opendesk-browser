import test from 'node:test';
import assert from 'node:assert/strict';
import {build,transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

let bundleId=0;
async function bundle(path){
 const result=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')+'#'+bundleId++);
}
const {createHeaderActions,HEADER_ACTIONS_KEY:KEY,DEFAULT_HEADER_ACTIONS}=await bundle('../src/ui/header-actions.js');
const {configureEnvironment}=await bundle('../src/environment.ts');
const headerActionsDomain=await bundle('../src/domain/header-actions.ts');
const domainConfig=await bundle('../src/domain/config.ts');
// Separate surfaces have separate module instances, including adapter ETag caches.
const {configureEnvironment:configureOtherEnvironment}=await bundle('../src/environment.ts');
function storageHost(){
 const values=new Map(),etags=new Map();let writes=0,reads=0,gate=null,failure=null;
 const host={
  mutate(value){values.set(KEY,value);etags.set(KEY,(etags.get(KEY)??0)+1);},
  get writes(){return writes;},
  get reads(){return reads;},
  set gate(value){gate=value;},set failure(value){failure=value;},
  bridge:{setState(){},async request(method,{key,value,ifMatch}){
   if(method==='storage.get'){reads++;return {value:values.get(key)??null,etag:String(etags.get(key)??0)};}
   assert.equal(method,'storage.set');writes++;
   if(gate)await gate;
   if(failure)throw Object.assign(Error(failure),{code:failure});
   if(ifMatch!==String(etags.get(key)??0))throw Object.assign(Error('conflict'),{code:'E_CONFLICT'});
   values.set(key,value);etags.set(key,(etags.get(key)??0)+1);return {saved:true};
  }}
 };
 return host;
}
function mount(host,surface={},configure=configureEnvironment){
 const env=configure(host.bridge,null,{trusted:true});
 const previous={window:globalThis.window,document:globalThis.document};
 let store;
 try{
  globalThis.window=surface.window;globalThis.document=surface.document;
  store=createHeaderActions(env);
  store.start();
 }finally{
  for(const key of ['window','document']){
   if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];
  }
 }
 return {env,store,close(){store.dispose();env.dispose();}};
}
function nativeSurface(){
 class Target extends EventTarget{
  listeners=new Map();
  addEventListener(type,fn,...args){super.addEventListener(type,fn,...args);this.listeners.set(type,fn);}
  removeEventListener(type,fn,...args){super.removeEventListener(type,fn,...args);if(this.listeners.get(type)===fn)this.listeners.delete(type);}
 }
 const window=new Target(),document=new Target();document.visibilityState='visible';
 return {window,document,focus(){window.dispatchEvent(new Event('focus'));},
  visibility(value){document.visibilityState=value;document.dispatchEvent(new Event('visibilitychange'));}};
}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}

test('two real surface stores: focus and visible resume read PC commits into a clean sidebar',async()=>{
 const host=storageHost(),surface=nativeSurface(),sidebar=mount(host,surface),pc=mount(host,{},configureOtherEnvironment);
 try{
  await sidebar.store.reload();await pc.store.reload();
  pc.store.edit(['official','settings']);await pc.store.save();
  assert.deepEqual(sidebar.store.getSnapshot().saved,DEFAULT_HEADER_ACTIONS);
  surface.focus();await settle();
  assert.deepEqual(sidebar.store.getSnapshot().saved,['official','settings']);
  assert.deepEqual(sidebar.store.getSnapshot().draft,['official','settings']);
  assert.equal(sidebar.env.hasDrafts(),false);
  pc.store.edit([]);await pc.store.save();const reads=host.reads;
  surface.visibility('hidden');await settle();assert.equal(host.reads,reads);
  surface.visibility('visible');surface.focus();await settle();
  assert.deepEqual(sidebar.store.getSnapshot().saved,[]);
  assert.equal(host.reads,reads+1);assert.equal(host.writes,2);
  // The clean refresh must also provide the new CAS base for the next edit.
  sidebar.store.edit(['diagnostics']);await sidebar.store.save();
  assert.equal(sidebar.store.getSnapshot().savedNotice,true);assert.equal(host.writes,3);
 }finally{sidebar.close();pc.close();}
});

test('dirty resume preserves the real adapter CAS baseline and requires explicit reread',async()=>{
 const host=storageHost(),surface=nativeSurface(),sidebar=mount(host,surface),pc=mount(host,{},configureOtherEnvironment);
 try{
  await sidebar.store.reload();await pc.store.reload();sidebar.store.edit(['official']);
  pc.store.edit(['diagnostics']);await pc.store.save();const reads=host.reads;
  surface.focus();surface.visibility('visible');await settle();
  assert.equal(host.reads,reads);assert.equal(sidebar.store.getSnapshot().readRequired,true);
  assert.equal(sidebar.store.getSnapshot().error,'apHeaderConflict');
  assert.deepEqual(sidebar.store.getSnapshot().saved,DEFAULT_HEADER_ACTIONS);
  assert.deepEqual(sidebar.store.getSnapshot().draft,['official']);assert.equal(sidebar.env.hasDrafts(),true);
  await sidebar.store.save();assert.equal(host.writes,1);
  // Bypass only the store guard to prove notifications did not refresh ETag.
  await assert.rejects(sidebar.env.storage.local.set({[KEY]:['official']}),{code:'E_CONFLICT'});
  sidebar.env.clearDrafts();surface.focus();await settle();
  assert.equal(host.reads,reads);assert.equal(sidebar.store.getSnapshot().readRequired,true);
  await sidebar.store.reload();assert.deepEqual(sidebar.store.getSnapshot().draft,['diagnostics']);
  assert.equal(sidebar.env.hasDrafts(),false);
  sidebar.store.edit(['settings']);await sidebar.store.save();
  await pc.store.reload();assert.deepEqual(pc.store.getSnapshot().saved,['settings']);
 }finally{sidebar.close();pc.close();}
});

test('resume skips busy/unknown without deferred reads or automatic writes',async()=>{
 const host=storageHost(),surface=nativeSurface(),app=mount(host,surface);
 try{
  await app.store.reload();app.store.edit(['official']);let release;
  host.gate=new Promise(resolve=>{release=resolve;});const saving=app.store.save(),reads=host.reads;
  surface.focus();surface.visibility('visible');await settle();assert.equal(host.reads,reads);
  release();await saving;await settle();assert.equal(host.reads,reads+1);assert.equal(host.writes,1);
  host.gate=null;host.failure='E_OUTCOME_UNKNOWN';app.store.edit([]);await app.store.save();
  const before=app.store.getSnapshot(),unknownReads=host.reads;
  surface.focus();surface.visibility('visible');await settle();
  assert.equal(app.store.getSnapshot(),before);assert.equal(host.reads,unknownReads);assert.equal(host.writes,2);
  host.failure=null;await app.store.reload();assert.equal(app.store.getSnapshot().unknown,false);
 }finally{app.close();}
});

test('editing during resume blocks save despite late adapter read; disposal removes listeners and ignores late reads',async()=>{
 const host=storageHost(),surface=nativeSurface(),app=mount(host,surface);
 try{
  await app.store.reload();const get=app.env.storage.local.get;let release;
  app.env.storage.local.get=async key=>{await new Promise(resolve=>{release=resolve;});return get(key);};
  surface.focus();app.store.edit(['official']);host.mutate(['diagnostics']);release();await settle();
  assert.deepEqual(app.store.getSnapshot().draft,['official']);
  assert.deepEqual(app.store.getSnapshot().saved,DEFAULT_HEADER_ACTIONS);
  assert.equal(app.store.getSnapshot().readRequired,true);await app.store.save();assert.equal(host.writes,0);
  app.env.storage.local.get=get;await app.store.reload();
  let reads=0,notifications=0;
  app.env.storage.local.get=async key=>{reads++;await new Promise(resolve=>{release=resolve;});return get(key);};
  app.store.subscribe(()=>notifications++);surface.visibility('visible');
  assert.equal(reads,1);app.store.dispose();const before=app.store.getSnapshot(),count=notifications;
  assert.equal(surface.window.listeners.size,0);assert.equal(surface.document.listeners.size,0);
  release();await settle();surface.focus();surface.visibility('visible');await settle();
  assert.equal(app.store.getSnapshot(),before);assert.equal(notifications,count);assert.equal(reads,1);
  app.env.clearDrafts();assert.equal(app.store.getSnapshot(),before);
 }finally{app.close();}
});

test('default four, ordered whitelist and empty selection save with original CAS/readback and survive reopening',async()=>{
 const host=storageHost();let app=mount(host);
 await app.store.reload();assert.deepEqual(app.store.getSnapshot().saved,DEFAULT_HEADER_ACTIONS);
 app.store.edit(['official','settings','add-proxy']);assert.equal(app.env.hasDrafts(),true);
 await app.store.save();assert.equal(app.env.hasDrafts(),false);assert.equal(app.store.getSnapshot().savedNotice,true);
 app.close();app=mount(host);await app.store.reload();
 assert.deepEqual(app.store.getSnapshot().saved,['official','settings','add-proxy']);
 app.store.edit([]);await app.store.save();app.close();app=mount(host);await app.store.reload();
 assert.deepEqual(app.store.getSnapshot().saved,[]);assert.equal(host.writes,2);app.close();
});

test('CAS conflict preserves the draft, blocks replay until explicit cancel/read, and never loses another window update',async()=>{
 const host=storageHost(),app=mount(host);await app.store.reload();
 app.store.edit(['official']);host.mutate(['diagnostics']);
 await app.store.save();assert.equal(app.store.getSnapshot().error,'apHeaderConflict');
 assert.deepEqual(app.store.getSnapshot().draft,['official']);assert.equal(app.env.hasDrafts(),true);
 app.store.edit(['official','settings']);await app.store.save();assert.equal(host.writes,1);
 await app.store.reload();assert.deepEqual(app.store.getSnapshot().draft,['diagnostics']);
 assert.equal(app.env.hasDrafts(),false);app.close();
});

test('unknown write is not retried, leaves draft and feedback, and requires explicit actual-state read',async()=>{
 const host=storageHost(),app=mount(host);await app.store.reload();app.store.edit(['official']);
 host.failure='E_OUTCOME_UNKNOWN';await app.store.save();
 assert.equal(app.store.getSnapshot().unknown,true);assert.equal(app.store.getSnapshot().error,'apHeaderUnknown');
 assert.deepEqual(app.store.getSnapshot().draft,['official']);assert.equal(app.env.hasDrafts(),true);
 await app.store.save();assert.equal(host.writes,1);
 host.failure=null;await app.store.reload();assert.equal(app.store.getSnapshot().unknown,false);app.close();
});

test('busy blocks duplicate saves; late receipt cannot clear or overwrite a newer draft; discard uses existing events',async()=>{
 const host=storageHost(),app=mount(host);await app.store.reload();app.store.edit(['official']);
 let release;host.gate=new Promise(resolve=>{release=resolve;});
 const saving=app.store.save();await app.store.save();assert.equal(host.writes,1);
 app.store.edit(['settings']);release();await saving;
 assert.deepEqual(app.store.getSnapshot().saved,['official']);assert.deepEqual(app.store.getSnapshot().draft,['settings']);
 assert.equal(app.store.getSnapshot().savedNotice,false);assert.equal(app.env.hasDrafts(),true);
 app.env.clearDrafts();assert.deepEqual(app.store.getSnapshot().draft,['official']);app.close();
});

test('invalid saved IDs are rejected, save errors give feedback, and disposal ignores late results',async()=>{
 const host=storageHost(),app=mount(host);host.mutate(['not-allowed']);await app.store.reload();
 assert.equal(app.store.getSnapshot().ready,false);assert.equal(app.store.getSnapshot().error,'apHeaderReadFailed');
 host.mutate(null);await app.store.reload();
 assert.throws(()=>app.store.edit(['settings','settings']));assert.throws(()=>app.store.edit(['script']));
 app.store.edit(['official']);host.failure='E_DENIED';await app.store.save();
 assert.equal(app.store.getSnapshot().error,'apHeaderSaveFailed');assert.deepEqual(app.store.getSnapshot().draft,['official']);
 host.failure=null;let release;host.gate=new Promise(resolve=>{release=resolve;});
 const saving=app.store.save();app.close();const before=app.store.getSnapshot();release();await saving;
 assert.equal(app.store.getSnapshot(),before);
});

// Execute the real editor handlers against the real App-owned model.
const editorCode=(await transform(await readFile(new URL('../src/ui/HeaderActionsEditor.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'})).code;
const module={exports:{}};
runInNewContext(editorCode,{module,exports:module.exports,require(name){
 if(name==='react')return {createElement:(type,props,...children)=>({type,props:{...props,children}})};
 if(name==='@opendesk/ui')return {Button:'button'};
 if(name==='../i18n/LocaleProvider')return {useI18n:()=>({t:key=>key})};
 if(name==='./header-actions.css')return {};
 if(name==='./header-actions')return {HEADER_ACTION_IDS:[...DEFAULT_HEADER_ACTIONS,'official']};
 throw Error(name);
}});
function nodes(tree){return tree&&typeof tree==='object'?[tree,...(tree.props?.children??[]).flat(Infinity).flatMap(nodes)]:[];}
test('real settings checkbox, up/down, save/cancel handlers persist order and recover from unknown',async()=>{
 const host=storageHost(),app=mount(host);await app.store.reload();
 const render=()=>nodes(module.exports.HeaderActionsEditor({store:app.store}));
 render().filter(node=>node.type==='input').at(-1).props.onChange({target:{checked:true}});
 let move=render().find(node=>node.props['aria-label']==='apHeaderMoveUp officialNetwork');move.props.onClick();
 assert.deepEqual(app.store.getSnapshot().draft,['add-proxy','diagnostics','subscriptions','official','settings']);
 render().find(node=>node.props['aria-label']==='apHeaderMoveDown officialNetwork').props.onClick();
 await render().find(node=>node.type==='button'&&node.props.children[0]==='saveChanges').props.onClick();
 // Handler intentionally consumes async errors; wait for the storage readback.
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(app.store.getSnapshot().saved.at(-1),'official');
 app.store.edit([]);render().find(node=>node.type==='button'&&node.props.children[0]==='cancel').props.onClick();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(app.store.getSnapshot().draft.at(-1),'official');
 app.store.edit([]);host.failure='E_OUTCOME_UNKNOWN';await app.store.save();
 const reload=render().find(node=>node.type==='button'&&node.props.children[0]==='apHeaderReload');
 assert.equal(reload.props.disabled,false);assert.ok(render().some(node=>node.props.role==='alert'));app.close();
});

const appCode=(await transform(await readFile(new URL('../src/App.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'})).code;
const hookCode=(await transform(await readFile(new URL('../src/ui/header-actions.js',import.meta.url),'utf8'),{format:'cjs'})).code;
function workspace(host,enhanced=true,surface={}){
 const snapshots=[],listeners=new Set();
 host.bridge.navigationFeatures={headerActions:enhanced};
 host.bridge.setNavigation=value=>{snapshots.push(value);return true;};
 host.bridge.subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
 const env=configureEnvironment(host.bridge,null,{trusted:true});
 const hooks=[],effects=[];let cursor=0,store;
 const react={
  createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;
   return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},
  useRef(initial){const i=cursor++;return hooks[i]??={current:initial};},
  useEffect(fn,deps){const i=cursor++,previous=hooks[i];
   if(!previous||deps.some((value,index)=>value!==previous.deps[index]))effects.push(()=>{
    previous?.cleanup?.();hooks[i]={deps,effect:fn,cleanup:fn()};
   });}
 };
 const headerModule={exports:{}};
 runInNewContext(hookCode,{module:headerModule,exports:headerModule.exports,require:()=>react,...surface});
 const appModule={exports:{}},t=key=>key;
 runInNewContext(appCode,{module:appModule,exports:appModule.exports,document:{activeElement:null},require(name){
  if(name==='react')return react;
  if(name==='./domain/header-actions')return headerActionsDomain;
  if(name==='./environment')return {getEnvironment:()=>env};
  if(name==='./ui/header-actions')return {useHeaderActions(environment){store=headerModule.exports.useHeaderActions(environment);return store;}};
  if(name==='./i18n/LocaleProvider')return {LocaleProvider:'locale',useI18n:()=>({t})};
  return {default:name,Button:'button'};
 }});
 const Workspace=appModule.exports.default().props.children[0].type;
 return {env,snapshots,get store(){return store;},renderOnly(){cursor=0;return Workspace({surface:'side-panel'});},
  replayEffects(){for(const hook of hooks)if(hook?.effect){hook.cleanup?.();hook.cleanup=hook.effect();}},
  render(){cursor=0;const tree=Workspace({surface:'side-panel'});
  while(effects.length)effects.shift()();return tree;},
  async settle(){for(let i=0;i<8;i++)await Promise.resolve();return this.render();},
  async header(id,page=snapshots.at(-1).page){for(const fn of [...listeners])await fn({action:'header',actionId:id,page});},
  close(){for(const hook of hooks)hook?.cleanup?.();env.dispose();}
 };
}

test('real App hook shares Settings state with Header, projects saved order, guards drafts/busy/unknown, and routes official',async()=>{
 const host=storageHost(),app=workspace(host);app.render();await app.settle();
 assert.deepEqual(Array.from(app.snapshots.at(-1).headerActions,item=>item.id),DEFAULT_HEADER_ACTIONS);
 app.store.edit(['official','settings']);app.render();
 assert.ok(app.snapshots.at(-1).headerActions.every(item=>item.disabledReason));
 await app.header('settings');assert.equal(app.env.navigation.getRoute(),'');
 await app.store.save();app.render();
 assert.deepEqual(Array.from(app.snapshots.at(-1).headerActions,item=>item.id),['official','settings']);
 const opens=[];app.env.openOwnPage=async target=>{opens.push(target);};
 await app.header('official');assert.deepEqual(JSON.parse(JSON.stringify(opens)),[{view:'settings',section:'official'}]);
 app.env.navigation.navigate('#/general');const tree=app.render();
 const region=tree.props.children.find(child=>child?.props?.className==='proxy-route');
 assert.equal(region.props.children[0].props.headerActionsStore,app.store);
 app.store.edit(['diagnostics']);let release;host.gate=new Promise(resolve=>{release=resolve;});
 const saving=app.store.save();app.render();
 assert.equal(app.env.navigation.navigate(''),false);
 await app.header('official');assert.equal(opens.length,1);
 release();await saving;app.render();
 app.store.edit(['official']);host.failure='E_OUTCOME_UNKNOWN';await app.store.save();app.render();
 assert.equal(app.env.navigation.navigate(''),false);await app.header('diagnostics');assert.equal(opens.length,1);
 app.close();
});

test('App passes Host support to QuickPanel, including empty saved actions, and keeps old Host base fallback',async()=>{
 for(const enhanced of [true,false]){
  const host=storageHost();host.mutate([]);const app=workspace(host,enhanced);app.render();const tree=await app.settle();
  const region=tree.props.children.find(child=>child?.props?.className==='proxy-route');
  const quick=region.props.children[0];
  assert.equal(quick.props.headerNavigation,enhanced);
  if(enhanced)assert.deepEqual(Array.from(app.snapshots.at(-1).headerActions),[]);
  else assert.equal(Object.hasOwn(app.snapshots.at(-1),'headerActions'),false);
  await app.header('official');assert.equal(app.env.navigation.getRoute(),'');
  assert.equal(app.env.navigation.navigate('#/general'),true);app.close();
 }
});

test('real App hook publishes focus-refreshed Header without remounting, including old Host fallback',async()=>{
 for(const enhanced of [true,false]){
  const host=storageHost(),surface=nativeSurface(),app=workspace(host,enhanced,surface);
  const pc=mount(host,{},configureOtherEnvironment);
  try{
   app.render();await app.settle();await pc.store.reload();
   pc.store.edit(['official','settings']);await pc.store.save();
   const before=app.snapshots.length;surface.focus();await app.settle();
   assert.deepEqual(Array.from(app.store.getSnapshot().saved),['official','settings']);
   assert.ok(app.snapshots.length>before);
   if(enhanced)assert.deepEqual(Array.from(app.snapshots.at(-1).headerActions,item=>item.id),['official','settings']);
   else assert.equal(Object.hasOwn(app.snapshots.at(-1),'headerActions'),false);
   assert.equal(host.writes,1);
  }finally{app.close();pc.close();}
  assert.equal(surface.window.listeners.size,0);assert.equal(surface.document.listeners.size,0);
 }
});

test('late read cannot overwrite a newer draft or silently rebase its next save',async()=>{
 const host=storageHost(),app=mount(host);await app.store.reload();app.store.edit(['official']);
 const get=app.env.storage.local.get;let release;
 app.env.storage.local.get=async key=>{await new Promise(resolve=>{release=resolve;});return get(key);};
 const reading=app.store.reload();app.store.edit(['settings']);host.mutate(['diagnostics']);release();await reading;
 assert.deepEqual(app.store.getSnapshot().draft,['settings']);
 assert.equal(app.store.getSnapshot().error,'apHeaderConflict');
 await app.store.save();assert.equal(host.writes,0);app.close();
});


test('abandoned render registers no Header listeners or storage work',()=>{
 const host=storageHost(),surface=nativeSurface(),app=workspace(host,true,surface);
 let registrations=0;
 const add=app.env.events.addEventListener.bind(app.env.events);
 app.env.events.addEventListener=(...args)=>{registrations++;return add(...args);};
 try{
  app.renderOnly();
  assert.equal(surface.window.listeners.size,0);
  assert.equal(surface.document.listeners.size,0);
  assert.equal(registrations,0);assert.equal(host.reads,0);assert.equal(host.writes,0);
 }finally{app.close();}
});

test('StrictMode effect cleanup/setup restores the same Header store and fences the abandoned read',async()=>{
 const host=storageHost(),surface=nativeSurface(),app=workspace(host,true,surface);
 const get=app.env.storage.local.get;let release;
 app.env.storage.local.get=async key=>{await new Promise(resolve=>{release=resolve;});return get(key);};
 try{
  app.render();const store=app.store;
  app.env.storage.local.get=get;host.mutate(['official']);
  app.replayEffects();await app.settle();
  assert.equal(app.store,store);assert.equal(store.getSnapshot().busy,false);
  assert.deepEqual(Array.from(store.getSnapshot().saved),['official']);
  store.edit(['settings']);const draft=store.getSnapshot();release();await settle();
  assert.equal(store.getSnapshot(),draft);
  await store.save();assert.equal(host.writes,1);
  host.mutate(['diagnostics']);surface.focus();await app.settle();
  assert.deepEqual(Array.from(store.getSnapshot().saved),['diagnostics']);
  store.edit(['settings']);app.env.clearDrafts();
  assert.deepEqual(Array.from(store.getSnapshot().draft),['diagnostics']);
 }finally{app.close();}
 assert.equal(surface.window.listeners.size,0);assert.equal(surface.document.listeners.size,0);
});

test('effect replay preserves dirty CAS base and reinstalls exactly one set of listeners',async()=>{
 const host=storageHost(),surface=nativeSurface(),app=workspace(host,true,surface);
 const counts=new Map(),add=app.env.events.addEventListener.bind(app.env.events),remove=app.env.events.removeEventListener.bind(app.env.events);
 app.env.events.addEventListener=(type,fn,...args)=>{if(type==='ai-proxy-draft')counts.set(fn,true);return add(type,fn,...args);};
 app.env.events.removeEventListener=(type,fn,...args)=>{if(type==='ai-proxy-draft')counts.delete(fn);return remove(type,fn,...args);};
 try{
  app.render();await app.settle();app.store.edit(['official']);
  const draftListeners=counts.size;assert.ok(draftListeners>0);
  host.mutate(['diagnostics']);const reads=host.reads;
  app.replayEffects();app.replayEffects();await app.settle();
  assert.equal(host.reads,reads);assert.equal(counts.size,draftListeners);
  assert.equal(surface.window.listeners.size,1);assert.equal(surface.document.listeners.size,1);
  surface.focus();await settle();assert.equal(host.reads,reads);
  assert.deepEqual(Array.from(app.store.getSnapshot().draft),['official']);
  assert.equal(app.store.getSnapshot().readRequired,true);
  await assert.rejects(app.env.storage.local.set({[KEY]:['official']}),{code:'E_CONFLICT'});
 }finally{app.close();}
 assert.equal(counts.size,0);assert.equal(surface.window.listeners.size,0);assert.equal(surface.document.listeners.size,0);
});

test('remount during an outstanding write preserves unknown and ignores late success or failure without replay',async()=>{
 for(const failure of [null,'E_OUTCOME_UNKNOWN']){
  const host=storageHost(),surface=nativeSurface(),app=workspace(host,true,surface);
  try{
   app.render();await app.settle();app.store.edit(['official']);
   let release;host.gate=new Promise(resolve=>{release=resolve;});host.failure=failure;
   const saving=app.store.save();app.replayEffects();await app.settle();
   const snapshot=app.store.getSnapshot(),reads=host.reads;
   assert.equal(snapshot.busy,false);assert.equal(snapshot.unknown,true);assert.equal(snapshot.readRequired,true);
   assert.deepEqual(Array.from(snapshot.draft),['official']);assert.equal(app.env.hasDrafts(),true);
   surface.focus();surface.visibility('visible');await app.store.save();await settle();
   assert.equal(host.writes,1);assert.equal(host.reads,reads);
   release();await saving;await settle();assert.equal(app.store.getSnapshot(),snapshot);
   host.gate=null;host.failure=null;await app.store.reload();
   assert.equal(app.store.getSnapshot().unknown,false);assert.equal(app.env.hasDrafts(),false);
   app.store.edit(['settings']);await app.store.save();assert.equal(host.writes,2);
   assert.deepEqual(Array.from(app.store.getSnapshot().saved),['settings']);
  }finally{app.close();}
 }
});


test('remount fences a pending focus read and blocks saving against its late adapter CAS base',async()=>{
 const host=storageHost(),surface=nativeSurface(),app=workspace(host,true,surface);
 try{
  app.render();await app.settle();const get=app.env.storage.local.get;let release;
  app.env.storage.local.get=async key=>{await new Promise(resolve=>{release=resolve;});return get(key);};
  surface.focus();app.replayEffects();app.store.edit(['official']);
  host.mutate(['diagnostics']);release();await settle();
  assert.deepEqual(Array.from(app.store.getSnapshot().draft),['official']);
  assert.equal(app.store.getSnapshot().readRequired,true);
  await app.store.save();assert.equal(host.writes,0);
  app.env.storage.local.get=get;await app.store.reload();
  app.store.edit(['settings']);await app.store.save();assert.equal(host.writes,1);
 }finally{app.close();}
});

test('0.3.9 legacy preferences are optional, new shortcuts are a strict list of known IDs',()=>{
  const old=domainConfig.freshConfig();
  assert.equal(domainConfig.validateConfig(old).headerActions,undefined);
  const next={...old,headerActions:['settings','add-proxy']};
  assert.deepEqual(domainConfig.validateConfig(next).headerActions,next.headerActions);
  assert.deepEqual(domainConfig.validateConfig({...old,headerActions:[]}).headerActions,[]);
  for(const bad of [['settings','settings'],['run-script'],['settings',7],null,{},Array(5).fill('settings')])
    assert.throws(()=>domainConfig.validateConfig({...old,headerActions:bad}));
  const exported=domainConfig.exportShare(next);
  assert.deepEqual(exported.headerActions,next.headerActions);
  assert.equal(exported.managed,false);
});
