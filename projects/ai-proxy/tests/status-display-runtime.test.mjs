import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform,build} from 'esbuild';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';

const compile=async path=>(await transform(await readFile(new URL(path,import.meta.url),'utf8'),
  {loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const preferenceCode=await compile('../src/ui/PcPreferences.tsx');
const quickCode=await compile('../src/QuickPanel.tsx');
const configBuild=await build({entryPoints:[new URL('../src/domain/config.ts',import.meta.url).pathname],
  bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import(`data:text/javascript;base64,${Buffer.from(configBuild.outputFiles[0].text).toString('base64')}`);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Execute the real hook. Only React scheduling and the public storage boundary
// are controlled; refs survive renders and setters after cleanup are counted.
function preferenceFixture({component=false}={}){
  const slots=[],effects=[],reads=[],writes=[],listeners=new Set(),removed=[],forbidden=[],languages=[];
  let cursor=0,unmounted=false,lateUpdates=0,tree,preference='auto';
  const hooks={...React,
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
      return [slots[index],next=>{if(unmounted)lateUpdates++;slots[index]=typeof next==='function'?next(slots[index]):next;}];},
    useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
    useEffect(effect){const index=cursor++;if(!(index in slots)){slots[index]=true;effects.push(effect);}}
  };
  const env=new Proxy({storage:{local:{
    get(key){const operation={key,...deferred()};reads.push(operation);return operation.promise;},
    set(items){const operation={items,...deferred()};writes.push(operation);return operation.promise;}
  },onChanged:{addListener(fn){listeners.add(fn);},removeListener(fn){removed.push(fn);listeners.delete(fn);}}}},
  {get(target,key){if(key in target)return target[key];forbidden.push(key);throw Error(`Unexpected environment access: ${String(key)}`);}});
  const module={exports:{}};
  runInNewContext(preferenceCode,{module,exports:module.exports,require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return jsxRuntime;
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({t:key=>key,preference,setPreference(value){
      const operation={value,...deferred()};languages.push(operation);
      return operation.promise.then(()=>{preference=value;});
    }})};
    if(name==='./ProxyIcon')return {ProxyIcon:()=>null};
    throw Error(`Unexpected dependency: ${name}`);
  }});
  function render(){cursor=0;return tree=component?module.exports.PcPreferences():module.exports.useStatusDisplay();}
  function visit(predicate,node){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node){const found=visit(predicate,child);if(found)return found;}return;}
    return predicate(node)?node:visit(predicate,node.props?.children);
  }
  const initial=render();let cleanups=effects.map(effect=>effect());
  return {render,initial,reads,writes,listeners,removed,forbidden,languages,key:module.exports.STATUS_DISPLAY_KEY,
    find:predicate=>visit(predicate,tree),html:()=>renderToStaticMarkup(render()),
    restartEffects(){cleanups.forEach(cleanup=>cleanup?.());cleanups=effects.map(effect=>effect());},
    emit(changes,area='local'){for(const listener of [...listeners])listener(changes,area);},
    unmount(){unmounted=true;cleanups.forEach(cleanup=>cleanup?.());},
    get lateUpdates(){return lateUpdates;}};
}

test('status preference defaults visible and only a persisted boolean false collapses it',async()=>{
  for(const stored of [undefined,true,false,null,0,'false']){
    const f=preferenceFixture();
    assert.equal(f.initial.show,true);assert.equal(f.initial.ready,false);
    await f.initial.save(false);
    assert.equal(f.writes.length,0,'no save before the stored preference is known');
    assert.equal(f.reads.length,1);assert.equal(f.reads[0].key,f.key);
    f.reads[0].resolve(stored===undefined?{}:{[f.key]:stored});await tick();
    assert.equal(f.render().show,stored!==false);assert.equal(f.render().ready,true);
    f.render();assert.equal(f.reads.length,1,'ordinary renders do not reload storage');
    assert.equal(f.listeners.size,1);assert.equal(f.writes.length,0);assert.deepEqual(f.forbidden,[]);
    f.unmount();assert.equal(f.listeners.size,0);
  }
});

test('save is single-flight before rerender, stays pending, and reports success only after storage confirms',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  const ready=f.render(),first=ready.save(false),duplicate=ready.save(true);
  await duplicate;
  assert.equal(f.writes.length,1);
  assert.deepEqual(Object.entries(f.writes[0].items),[[f.key,false]]);
  assert.equal(f.render().busy,true);assert.equal(f.render().show,true);assert.equal(f.render().saved,false);
  f.writes[0].resolve();await first;
  assert.equal(f.render().busy,false);assert.equal(f.render().show,false);assert.equal(f.render().saved,true);
  const next=f.render().save(true);
  assert.equal(f.render().saved,false);assert.equal(f.writes.length,2);
  f.writes[1].resolve();await next;
  assert.equal(f.render().show,true);assert.deepEqual(f.forbidden,[]);f.unmount();
});

test('failed reads or writes disable replay and preserve the last confirmed display value',async()=>{
  for(const failRead of [true,false]){
    const f=preferenceFixture();
    if(failRead){f.reads[0].reject(Error('storage unavailable'));await tick();}
    else{
      f.reads[0].resolve({});await tick();
      const pending=f.render().save(false);f.writes[0].reject(Error('write outcome unknown'));await pending;
    }
    const failed=f.render();assert.equal(failed.error,true);assert.equal(failed.ready,false);
    assert.equal(failed.busy,false);assert.equal(failed.saved,false);assert.equal(failed.show,true);
    const count=f.writes.length;await failed.save(false);await f.render().save(true);
    assert.equal(f.writes.length,count,'unknown writes are never automatically replayed');
    assert.deepEqual(f.forbidden,[]);f.unmount();
  }
});

test('a failed preference write blocks replay through the previous ready handler and later storage events',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  const save=f.render().save,pending=save(false);
  f.writes[0].reject(Error('unknown write outcome'));await pending;
  f.emit({[f.key]:{newValue:true}});
  const replay=save(false);
  // Settle an accidental extra write so a regression fails rather than hangs.
  for(const operation of f.writes.slice(1))operation.resolve();await replay;
  assert.equal(f.writes.length,1);assert.equal(f.render().ready,false);
  assert.equal(f.render().error,true);assert.equal(f.render().saved,false);
  assert.deepEqual(f.forbidden,[]);f.unmount();
});

test('a pending write receipt cannot overwrite a newer storage value or deletion; own events still confirm saves',async()=>{
  for(const newValue of [true,undefined,false]){
    const f=preferenceFixture();f.reads[0].resolve({});await tick();
    const pending=f.render().save(false);
    f.emit({[f.key]:newValue===undefined?{oldValue:false}:{newValue}});
    assert.equal(f.render().show,newValue!==false);
    f.writes[0].resolve();await pending;
    assert.equal(f.render().show,newValue!==false,'write acknowledgement must not restore the older value');
    assert.equal(f.render().saved,newValue===false,'only the still-current saved value has a success receipt');
    assert.equal(f.render().busy,false);assert.equal(f.render().error,false);
    assert.equal(f.writes.length,1);assert.deepEqual(f.forbidden,[]);f.unmount();
  }
});

test('an own storage event arriving after its write acknowledgement retains the confirmed save receipt',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  const pending=f.render().save(false);f.writes[0].resolve();await pending;
  assert.equal(f.render().saved,true);
  f.emit({[f.key]:{newValue:false}});
  assert.equal(f.render().show,false);assert.equal(f.render().saved,true);
  f.emit({[f.key]:{newValue:true}});
  assert.equal(f.render().show,true);assert.equal(f.render().saved,false);
  assert.equal(f.writes.length,1);assert.deepEqual(f.forbidden,[]);f.unmount();
});

test('a saved ready handler cannot write or update UI after unmount',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  const save=f.render().save;f.unmount();const pending=save(false);
  for(const operation of f.writes)operation.resolve();await pending;
  assert.equal(f.writes.length,0);assert.equal(f.lateUpdates,0);assert.deepEqual(f.forbidden,[]);
});

test('effect restart isolates pending writes, locks and callbacks from the new preference session',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  const oldSave=f.render().save,oldPending=oldSave(false);
  f.restartEffects();f.reads[1].resolve({});await tick();
  const newSave=f.render().save,newPending=newSave(true);
  assert.equal(f.writes.length,2,'a previous session lock cannot disable the new session');
  f.writes[0].reject(Error('old write outcome unknown'));await oldPending;
  assert.equal(f.render().busy,true);assert.equal(f.render().error,false);
  const stale=oldSave(false),duplicate=newSave(false);
  for(const operation of f.writes.slice(2))operation.resolve();await stale;await duplicate;
  assert.equal(f.writes.length,2,'old settlement cannot unlock a newer pending write or revive an old callback');
  f.writes[1].resolve();await newPending;
  assert.equal(f.render().busy,false);assert.equal(f.render().show,true);
  assert.equal(f.listeners.size,1);assert.deepEqual(f.forbidden,[]);f.unmount();
});

test('real PcPreferences checkbox hydrates, disables while pending, and reports only confirmed saves',async()=>{
  const f=preferenceFixture({component:true}),input=()=>f.find(node=>node.type==='input');
  assert.equal(input().props.checked,true);assert.equal(input().props.disabled,true);
  assert.equal(f.find(node=>node.type==='label'&&node.props.htmlFor===input().props.id).props.children,'pcShowStatus');
  f.reads[0].resolve({[f.key]:false});await tick();f.render();
  assert.equal(input().props.checked,false);assert.equal(input().props.disabled,false);
  input().props.onChange({target:{checked:true}});f.render();
  assert.equal(input().props.disabled,true);assert.equal(input().props.checked,false);
  assert.deepEqual(Object.entries(f.writes[0].items),[[f.key,true]]);
  assert.doesNotMatch(f.html(),/pcPreferenceSaved/);
  f.writes[0].resolve();await tick();
  assert.match(f.html(),/role="status">pcPreferenceSaved/);
  assert.equal(input().props.checked,true);assert.equal(input().props.disabled,false);
  input().props.onChange({target:{checked:false}});f.writes[1].reject(Error('unknown outcome'));await tick();
  assert.match(f.html(),/role="alert">pcPreferenceFailed/);
  assert.doesNotMatch(f.html(),/pcPreferenceSaved/);
  assert.equal(input().props.disabled,true);assert.equal(input().props.checked,true);
  assert.deepEqual(f.forbidden,[]);f.unmount();
});

test('real PcPreferences language selector passes the chosen locale, displays failure and recovers without a status write',async()=>{
  const f=preferenceFixture({component:true}),select=()=>f.find(node=>node.type==='select');
  assert.equal(select().props.value,'auto');assert.equal(select().props['aria-label'],'interfaceLanguage');
  select().props.onChange({target:{value:'en'}});assert.equal(f.languages[0].value,'en');
  f.languages[0].reject(Error('locale storage failed'));await tick();
  assert.match(f.html(),/role="alert">languageSettingFailure/);assert.equal(select().props.value,'auto');
  select().props.onChange({target:{value:'zh-TW'}});f.languages[1].resolve();await tick();
  assert.doesNotMatch(f.html(),/languageSettingFailure/);assert.equal(select().props.value,'zh-TW');
  assert.equal(f.writes.length,0);assert.deepEqual(f.forbidden,[]);f.unmount();
  f.reads[0].resolve({});await tick();assert.equal(f.lateUpdates,0);
});

test('late read resolve/reject and late write resolve/reject do not update an unmounted hook',async()=>{
  for(const kind of ['read','write'])for(const reject of [false,true]){
    const f=preferenceFixture();let pending;
    if(kind==='write'){f.reads[0].resolve({});await tick();pending=f.render().save(false);}
    const callback=[...f.listeners][0];f.unmount();
    callback({[f.key]:{newValue:false}},'local');
    const operation=kind==='read'?f.reads[0]:f.writes[0];
    if(reject)operation.reject(Error('late failure'));else operation.resolve(kind==='read'?{[f.key]:false}:undefined);
    await pending;await tick();
    assert.equal(f.lateUpdates,0,`${kind} ${reject?'reject':'resolve'}`);
    assert.equal(f.listeners.size,0);assert.deepEqual(f.removed,[callback]);assert.deepEqual(f.forbidden,[]);
  }
});

test('onChanged synchronizes only the local preference, treats deletion as default, and never writes it back',async()=>{
  const f=preferenceFixture();f.reads[0].resolve({});await tick();
  f.emit({[f.key]:{newValue:false}},'sync');assert.equal(f.render().show,true);
  f.emit({other:{newValue:false}});assert.equal(f.render().show,true);
  f.emit({[f.key]:{newValue:false}});assert.equal(f.render().show,false);
  f.emit({[f.key]:{oldValue:false}});assert.equal(f.render().show,true);
  assert.equal(f.writes.length,0);assert.deepEqual(f.forbidden,[]);
  f.unmount();f.emit({[f.key]:{newValue:false}});assert.equal(f.lateUpdates,0);
});

test('newer local preference changes take precedence over a late initial storage read',async()=>{
  for(const newValue of [false,true,undefined]){
    const f=preferenceFixture();
    f.emit({[f.key]:newValue===undefined?{oldValue:false}:{newValue}});
    assert.equal(f.render().show,newValue!==false);
    // The read represents the older snapshot, including a deleted preference.
    f.reads[0].resolve({[f.key]:newValue===false?true:false});await tick();
    assert.equal(f.render().show,newValue!==false,'late snapshot cannot undo the newer storage event');
    assert.equal(f.render().ready,true);assert.equal(f.render().error,false);
    assert.equal(f.writes.length,0);assert.deepEqual(f.forbidden,[]);f.unmount();
  }
});

test('unrelated and non-local events do not suppress the initial persisted preference',async()=>{
  const f=preferenceFixture();
  f.emit({other:{newValue:true}});f.emit({[f.key]:{newValue:true}},'sync');
  f.reads[0].resolve({[f.key]:false});await tick();
  assert.equal(f.render().show,false);assert.equal(f.render().ready,true);
  assert.equal(f.writes.length,0);assert.deepEqual(f.forbidden,[]);f.unmount();
});

function quickFixture({show=false,busy=false,error='',runtime={},mode='system'}={}){
  const config={...domain.freshConfig(),selection:{mode}};
  const state={config,runtime:{control:'controllable_by_this_extension',managedIntent:false,
    canStop:false,applied:false,pendingChanges:false,activeSelection:null,browserMode:'system',proxyError:null,...runtime}};
  const calls=[],module={exports:{}};
  const Status=()=>null,empty=()=>null;
  const hooks={...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],
    useRef:initial=>({current:initial}),useEffect(){},useMemo:fn=>fn()};
  runInNewContext(quickCode,{exports:module.exports,module,require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return jsxRuntime;
    if(name==='./ui/PcPreferences')return {useStatusDisplay:()=>({show})};
    if(name==='./ui/useProxy')return {useProxy:()=>({state,busy,error,
      act:message=>calls.push(message),refresh:()=>calls.push('refresh'),setError(){},setErrorKey(){}})};
    if(name==='./domain/config')return domain;
    if(name==='./i18n/LocaleProvider')return {useI18n:()=>({t:key=>key})};
    if(name==='./environment')return {getEnvironment:()=>{throw Error('render must not access browser or proxy');}};
    if(name==='@opendesk/ui')return {Button:empty};
    if(name==='./ui/Status')return {Status};
    if(name==='./ui/ProxyEntry')return {ClearableInput:empty};
    if(name==='./domain/proxy-entry')return {isValidProxyPort:()=>true};
    if(name==='./ui/ProxyEditor')return {ProxyEditor:empty};
    if(name==='./ui/optionsRoute')return {optionsUrl:empty};
    if(name==='./ui/RotationPlan')return {RotationEntry:empty};
    if(name==='./ui/ProxyIcon')return {ProxyIcon:empty};
    throw Error(`Unexpected dependency: ${name}`);
  }});
  const tree=module.exports.default();
  function visit(predicate,node){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node){const match=visit(predicate,child);if(match)return match;}return;}
    return predicate(node)?node:visit(predicate,node.props?.children);
  }
  const find=predicate=>visit(predicate,tree);
  return {container:find(node=>node.props?.['data-r86-section']==='status'),find,Status,state,calls};
}

test('hidden optional status is a closed, user-expandable details containing real status and the primary action',()=>{
  for(const show of [true,false]){
    const f=quickFixture({show});assert.equal(f.container.type,show?'section':'details');
    if(!show){assert.notEqual(f.container.props.open,true);assert.ok(f.find(node=>node.type==='summary'));}
    assert.equal(f.find(node=>node.type===f.Status).props.status,f.state.runtime);
    assert.ok(f.find(node=>node.props?.['data-testid']==='side-proxy-toggle'));
    assert.deepEqual(f.calls,[],'presentation never invokes a proxy command or status refresh');
  }
});

test('mandatory errors, pending changes, busy work and blocked/missing routes cannot be collapsed by the preference',()=>{
  const cases=[{busy:true},{error:'status read failed'},{runtime:{pendingChanges:true}},
    {runtime:{outcomeUnknown:true}},{runtime:{statusErrorCode:'E_TIMEOUT'}},
    {runtime:{proxyError:'proxy failure'}},{runtime:{stopFinalizationPending:true}},
    {runtime:{control:'controlled_by_other_extensions'}},{runtime:{control:'not_controllable'}},
    {mode:'profile'}];
  for(const entry of cases){const f=quickFixture(entry);assert.equal(f.container.type,'section',JSON.stringify(entry));
    assert.equal(f.find(node=>node.type===f.Status).props.status,f.state.runtime);assert.deepEqual(f.calls,[]);}
});

test('unknown or absent control cannot collapse mandatory runtime status',()=>{
  for(const control of ['unknown',undefined]){
    const f=quickFixture({runtime:{control}});
    assert.equal(f.container.type,'section',String(control));
    assert.equal(f.find(node=>node.type===f.Status).props.status,f.state.runtime);
    assert.deepEqual(f.calls,[]);
  }
});

test('denied proxy permission remains visible even with an otherwise normal runtime',()=>{
  for(const control of ['controllable_by_this_extension','controlled_by_this_extension']){
    const f=quickFixture({runtime:{control,permission:false}});
    assert.equal(f.container.type,'section');
    assert.equal(f.find(node=>node.type===f.Status).props.status.permission,false);
    assert.deepEqual(f.calls,[]);
    const permitted=quickFixture({runtime:{control,permission:true,managedIntent:control==='controlled_by_this_extension'}});
    assert.equal(permitted.container.type,'details','normal status remains optionally collapsible');
    assert.deepEqual(permitted.calls,[]);
  }
});

test('missing credentials and stranded control keep mandatory status and recovery actions expanded',()=>{
  for(const runtime of [{credentialRequired:true},
    {control:'controlled_by_this_extension',managedIntent:false,canStop:true}]){
    const f=quickFixture({runtime});assert.equal(f.container.type,'section',JSON.stringify(runtime));
    assert.equal(f.find(node=>node.type===f.Status).props.status,f.state.runtime);
    const action=f.find(node=>node.props?.['data-testid']==='side-proxy-toggle');
    assert.ok(action);assert.equal(action.props.disabled,false);assert.deepEqual(f.calls,[]);
  }
});
