import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';

const model=globalThis.BookmarkR2Model;
const source=await readFile(new URL('../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function isFolder('),source.indexOf('function highlightSearchTitle('));
const body=source.slice(source.indexOf('export default function App(')+'export default '.length,
  source.indexOf(' return <div className="bm-app"'));
assert.ok(body.startsWith('function App(')&&body.includes('async function removeConfirmed('));
// Execute the actual App callbacks with persistent hook slots, without compiling JSX.
const compile=new Function('hooks','model','setTimeout','clearTimeout','document',`
 const {useState,useRef,useMemo,useCallback,useEffect,useLayoutEffect}=hooks;
 ${helpers}
 ${body}
 return {load,save,removeConfirmed,request,setDraft,closeSheet,requestCloseSheet,tree,draft,busy,uncertain,error,notice,previewOpen};
 }
 return App;
`);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
  return {promise,resolve,reject};
}
const denied=()=>Object.assign(Error('Full bookmark grant revoked'),{code:'E_GRANT_REVOKED'});
const unknown=()=>Object.assign(Error('No final write receipt'),{code:'E_OUTCOME_UNKNOWN'});
test('current-page fill retains the selected folder instead of shadowing it with its validity guard',async()=>{
  const context=deferred(),app=harness({}, {page:{getContext:()=>context.promise}});
  await app.mount();app.ui.request({type:'select',id:'old'});app.render();
  app.ui.request({type:'currentPage'});
  context.resolve({status:'available',title:'Current page',url:'https://example.com/',tabRef:'tab',documentRef:'document'});
  await settle();app.render();assert.equal(app.ui.draft.parentId,'old');
});
function snapshot({created=false,removed=false,title='Existing'}={}){
  return model.bookmarkTree([{id:'0',title:'root',children:[{id:'1',title:'bar',children:[
    ...(!removed?[{id:'old',title,children:[]}]:[]),
    ...(created?[{id:'new',title:'Created',children:[]}]:[])
  ]}]}]);
}
function harness(overrides={},sdk=null){
  const slots=[],effects=[],timers=new Map();let cursor=0,timerId=0;
  const memo=(factory,deps)=>{
    const index=cursor++,old=slots[index];
    if(!old||!deps||deps.some((value,i)=>!Object.is(value,old.deps[i])))
      slots[index]={value:factory(),deps};
    return slots[index].value;
  };
  const effect=(run,deps)=>{
    const index=cursor++,old=slots[index];
    if(!old||!deps||deps.some((value,i)=>!Object.is(value,old.deps[i]))){
      const next=slots[index]={deps};
      effects.push(()=>{old?.cleanup?.();next.cleanup=run()});
    }
  };
  const hooks={
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]={value:initial};
      return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}];},
    useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial})},
    useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect:effect,useLayoutEffect:effect
  };
  const service={load:async()=>snapshot(),watchStart:async()=>({sessionRef:'observer-session',cursor:'0',expiresAt:Date.now()+30000}),
    watchRead:async()=>({events:[],nextCursor:'1',expiresAt:Date.now()+30000}),watchStop:async()=>{},
    createFolder:async()=>({id:'new'}),remove:async()=>{},...overrides};
  const App=compile(hooks,model,(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},
    id=>timers.delete(id),{addEventListener(){},removeEventListener(){}});
  const runtime={service,sdk},api={};
  api.render=()=>{cursor=0;api.ui=App({runtime,mode:'trusted'});return api.ui};
  api.mount=async()=>{api.render();while(effects.length)effects.shift()();await settle();return api.render()};
  api.unmount=()=>{for(const slot of slots)slot?.cleanup?.()};
  api.poll=async()=>{const entry=[...timers].find(([,timer])=>timer.delay===2500);
    assert.ok(entry,'observer must have scheduled its next read');timers.delete(entry[0]);entry[1].fn();await settle();return api.render()};
  api.create=()=>{api.ui.request({type:'create',kind:'folder'});api.render();
    api.ui.setDraft(draft=>({...draft,title:'Created'}));return api.render()};
  api.render();
  return api;
}

for(const action of ['revoke','unmount','cancel','close','create','edit','draft'])for(const outcome of ['resolve','reject']){
  test(`R3.4 late current-page ${outcome} preserves state after ${action}`,async()=>{
    const context=deferred();let revoked=false;
    const app=harness({load:async()=>{if(revoked)throw denied();return snapshot()}},
      {page:{getContext:()=>context.promise}});
    await app.mount();
    if(action==='draft'){app.ui.request({type:'edit',id:'old'});app.render()}
    app.ui.request({type:'currentPage'});
    if(action==='revoke'){revoked=true;await app.ui.load()}
    else if(action==='unmount')app.unmount();
    else if(action==='cancel')app.ui.closeSheet();
    else if(action==='close')app.ui.requestCloseSheet();
    else if(action==='create')app.create();
    else if(action==='edit')app.ui.request({type:'edit',id:'old'});
    else app.ui.setDraft(draft=>({...draft,title:'Newer draft'}));
    app.render();
    const state=()=>({tree:app.ui.tree,draft:app.ui.draft,error:app.ui.error,notice:app.ui.notice,uncertain:app.ui.uncertain});
    const expected=state();
    if(outcome==='resolve')context.resolve({status:'available',title:'Late page',url:'https://example.com/late',tabRef:'tab',documentRef:'document'});
    else context.reject(Error('Late context error'));
    await settle();app.render();
    assert.deepEqual(state(),expected,'a superseded context callback must not change draft, notice or error');
  });
}

test('R3.4 newest current-page request wins over an older delayed context',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const app=harness({}, {page:{getContext:()=>++calls===1?first.promise:second.promise}});
  await app.mount();app.ui.request({type:'currentPage'});app.ui.request({type:'currentPage'});
  const context=title=>({status:'available',title,url:'https://example.com/',tabRef:'tab',documentRef:'document'});
  second.resolve(context('Newest'));await settle();app.render();
  assert.equal(app.ui.draft.title,'Newest');assert.match(app.ui.notice,/已填写/);
  first.resolve(context('Older'));await settle();app.render();
  assert.equal(app.ui.draft.title,'Newest');
});

for(const outcome of ['failed','discarded']){
  test(`R3.4 ${outcome} event snapshot retries before the next empty poll without unlocking writes`,async()=>{
    const eventSnapshot=deferred(),retry=deferred(),cursors=[];let reads=0;
    const app=harness({
      load:()=>++reads===1?Promise.resolve(snapshot()):reads===2?eventSnapshot.promise:retry.promise,
      createFolder:async()=>{throw unknown()},
      watchRead:async session=>{
        cursors.push(session.cursor);
        return {events:cursors.length===2?[{kind:'moved',id:'old'}]:[],
          nextCursor:cursors.length===1?'0':'1',expiresAt:Date.now()+30000};
      }
    });
    const lockWrites=async()=>{app.create();await app.ui.save({preventDefault(){}});app.render();assert.equal(app.ui.uncertain,true)};
    await app.mount();
    if(outcome==='failed')await lockWrites();
    await app.poll();assert.equal(reads,2);
    if(outcome==='discarded')await lockWrites(); // Starting the write invalidates the event snapshot.
    if(outcome==='failed')eventSnapshot.reject(Error('Temporary snapshot failure'));
    else eventSnapshot.resolve(snapshot({title:'Discarded'}));
    await settle();app.render();
    assert.equal(app.ui.tree.byId.get('old').title,'Existing');
    await app.poll();
    assert.equal(reads,3,'retry the pending snapshot even when no new events arrive');
    assert.deepEqual(cursors,['0','0'],'do not consume more events while recovery is pending');
    retry.resolve(snapshot({title:'External move'}));await settle();app.render();
    assert.equal(app.ui.tree.byId.get('old').title,'External move');
    assert.equal(app.ui.uncertain,true,'observer recovery cannot reconcile an unknown write');
    assert.deepEqual(cursors,['0','0','1']);
    await app.poll();assert.equal(reads,3,'successful recovery ends snapshot retries');
  });
}

test('R3.4 mutation invalidates an earlier snapshot instead of overwriting verified data',async()=>{
  const earlier=deferred();let reads=0;
  const app=harness({load:()=>++reads===2?earlier.promise:Promise.resolve(snapshot({created:reads>2}))});
  await app.ui.load();app.render();
  const refresh=app.ui.load();app.create();
  await app.ui.save({preventDefault(){}});app.render();
  assert.equal(app.ui.tree.byId.has('new'),true);
  earlier.resolve(snapshot());await refresh;app.render();
  assert.equal(app.ui.tree.byId.has('new'),true,'pre-write snapshot must not replace successful readback');
});

for(const operation of ['save','delete'])for(const phase of ['write','readback']){
  test(`R3.4 observer denial keeps data cleared after delayed ${operation} ${phase}`,async()=>{
    const pending=deferred();let reads=0,polls=0;
    const app=harness({
      load:()=>++reads===1?Promise.resolve(snapshot()):pending.promise,
      watchRead:async()=>{if(++polls>1)throw denied();return {events:[],nextCursor:'1',expiresAt:Date.now()+30000}},
      createFolder:()=>phase==='write'?pending.promise:Promise.resolve({id:'new'}),
      remove:()=>phase==='write'?pending.promise:Promise.resolve()
    });
    await app.mount();
    let writing;
    if(operation==='save'){app.create();writing=app.ui.save({preventDefault(){}})}
    else writing=app.ui.removeConfirmed({id:'old',expected:app.ui.tree.byId.get('old'),descendantSignatures:[]});
    await settle();await app.poll();
    assert.equal(app.ui.tree,null);assert.equal(app.ui.draft,null);
    pending.resolve(phase==='write'?{id:'new'}:snapshot({created:operation==='save',removed:operation==='delete'}));
    await writing;app.render();
    assert.equal(app.ui.tree,null,'late write completion must not repopulate a revoked view');
    assert.equal(app.ui.draft,null);assert.equal(app.ui.previewOpen,false);
    assert.equal(app.ui.uncertain,true,'revoked writes stay locked');
    assert.ok(!['已保存','已删除'].includes(app.ui.notice));
    if(phase==='write')assert.equal(reads,1,'do not start another read after authority closes');
    assert.equal(app.ui.busy,false);
  });
}

test('R3.4 even an invalidated snapshot denial revokes the pending mutation',async()=>{
  const reading=deferred(),writing=deferred();let reads=0;
  const app=harness({load:()=>++reads===1?Promise.resolve(snapshot()):reading.promise,
    createFolder:()=>writing.promise});
  await app.ui.load();app.render();
  const refresh=app.ui.load();app.create();const save=app.ui.save({preventDefault(){}});
  reading.reject(denied());await refresh;app.render();
  assert.equal(app.ui.tree,null);assert.equal(app.ui.draft,null);
  writing.resolve({id:'new'});await save;app.render();
  assert.equal(app.ui.tree,null);assert.equal(app.ui.uncertain,true);
  assert.equal(reads,2,'revocation must prevent post-write readback');
});

for(const phase of ['before','during']){
  test(`R3.4 reconciliation snapshot started ${phase} mutation cannot clear its later unknown outcome`,async()=>{
    const reading=deferred(),writing=deferred();let reads=0;
    const app=harness({load:()=>++reads===1?Promise.resolve(snapshot()):reading.promise,
      createFolder:()=>writing.promise});
    await app.ui.load();app.render();
    let refresh;
    if(phase==='before')refresh=app.ui.load({reconcileUnknown:true});
    app.create();const save=app.ui.save({preventDefault(){}});
    if(phase==='during')refresh=app.ui.load({reconcileUnknown:true});
    writing.reject(unknown());await save;app.render();assert.equal(app.ui.uncertain,true);
    reading.resolve(snapshot());await refresh;app.render();
    assert.equal(app.ui.uncertain,true,'pre-outcome snapshots cannot authorize a retry');
    assert.equal(app.ui.draft.mode,'create');
  });
}

test('R3.4 only explicit reconciliation after unknown outcome unlocks subsequent writes',async()=>{
  let writes=0;
  const app=harness({createFolder:async()=>{writes++;throw unknown()}});
  await app.ui.load();app.render();app.create();await app.ui.save({preventDefault(){}});app.render();
  assert.equal(app.ui.uncertain,true);
  await app.ui.load();app.render();assert.equal(app.ui.uncertain,true,'background refresh preserves the lock');
  await app.ui.save({preventDefault(){}});assert.equal(writes,1,'unknown outcome blocks repeat submission');
  await app.ui.load({reconcileUnknown:true});app.render();
  assert.equal(app.ui.uncertain,false);
  await app.ui.save({preventDefault(){}});assert.equal(writes,2);
});

test('R3.4 revocation between move and update prevents the second mutation',async()=>{
  const moving=deferred();let polls=0,updates=0;
  const tree=model.bookmarkTree([{id:'0',title:'root',children:[{id:'1',title:'bar',children:[
    {id:'old',title:'Existing',children:[]},{id:'dest',title:'Destination',children:[]}
  ]}]}]);
  const app=harness({load:async()=>tree,move:()=>moving.promise,update:async()=>{updates++},
    watchRead:async()=>{if(++polls>1)throw denied();return {events:[],nextCursor:'1',expiresAt:Date.now()+30000}}});
  await app.mount();app.ui.request({type:'edit',id:'old'});app.render();
  app.ui.setDraft(draft=>({...draft,parentId:'dest',title:'Changed'}));app.render();
  const save=app.ui.save({preventDefault(){}});await settle();await app.poll();
  moving.resolve({...tree.byId.get('old'),parentId:'dest'});await save;app.render();
  assert.equal(updates,0,'a late move receipt cannot authorize an update after revocation');
  assert.equal(app.ui.tree,null);assert.equal(app.ui.uncertain,true);
});

for(const code of ['E_USER_CANCEL','E_OUTCOME_UNKNOWN','E_NATIVE_WRITE']){
 test(`R3.4 completed move followed by ${code} warns partial write and blocks retries`,async()=>{
  const tree=model.bookmarkTree([{id:'0',title:'root',children:[{id:'1',title:'bar',children:[
   {id:'old',title:'old',children:[]},{id:'target',title:'target',children:[]}]}]}]);
  let moves=0,updates=0;
  const app=harness({load:async()=>tree,move:async({expected,parentId})=>{
   moves++;return{...expected,parentId};
  },update:async()=>{updates++;throw Object.assign(Error('Update did not complete'),{code})}});
  await app.mount();app.ui.request({type:'edit',id:'old'});app.render();
  app.ui.setDraft(d=>({...d,title:'Edited',parentId:'target'}));app.render();
  await app.ui.save({preventDefault(){}});app.render();
  assert.match(app.ui.error,/部分写入风险/);assert.equal(app.ui.uncertain,true);
  assert.equal(app.ui.draft.title,'Edited');assert.equal(app.ui.draft.parentId,'target');
  await app.ui.save({preventDefault(){}});assert.equal(moves,1);assert.equal(updates,1);
  assert.notEqual(app.ui.notice,'已保存');app.unmount();
 });
}
test('R3.4 an update denied before any completed write retains the draft without a partial warning',async()=>{
 const app=harness({load:async()=>snapshot(),update:async()=>{
  throw Object.assign(Error('Native update denied'),{code:'E_NATIVE_WRITE'});
 }});
 await app.mount();app.ui.request({type:'edit',id:'old'});app.render();
 app.ui.setDraft(d=>({...d,title:'Edited'}));app.render();
 await app.ui.save({preventDefault(){}});app.render();
 assert.equal(app.ui.error,'Native update denied');assert.equal(app.ui.uncertain,false);
 assert.equal(app.ui.draft.title,'Edited');app.unmount();
});
