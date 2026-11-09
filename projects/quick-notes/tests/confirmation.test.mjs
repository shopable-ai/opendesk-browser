import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const script=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const etag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
class Element {
  constructor(){this.listeners=new Map();this.children=[];this.dataset={};this.hidden=false;this.value='';this.disabled=false;this.checked=false;this.textContent='';}
  addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
  emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  setAttribute(name,value){(this.attributes??=new Map()).set(name,value);}
  replaceChildren(){this.children=[];}
  append(item){this.children.push(item);}
  focus(){this.focused=true;}
}
function launch({stored={},shared,page={status:'unavailable',message:'受限网页'},writeError=false,
  failLegacyCleanup=false,getGate,setGate,pageGate,legacyGate,uiConfirm,setNavigation,writeResult,confirm=()=>false}={}) {
  const data=shared||structuredClone(stored);
  const ids=['page-summary','page-url','refresh-page','note-count','note-list','note-text','add-note','delete-note','save-note',
    'attach-page','note-attachment','note-status','task-name','open-task','note-confirm','note-confirm-message','note-confirm-cancel','note-confirm-accept','notes-list-view','notes-edit-view','editor-title','editor-unsaved','note-empty','back-to-notes'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  nodes['note-confirm'].hidden=true;
  nodes['notes-edit-view'].hidden=true;
  nodes['note-empty'].hidden=true;
  const window=new Element();
  const document={createElement:()=>new Element(),defaultView:window};
  const root=new Element();root.ownerDocument=document;
  root.querySelector=selector=>nodes[selector.slice(1)];
  const calls=[];let pageReads=0;
  const request=async (op,payload={})=>{
    calls.push([op,payload]);
    if(op==='storage.get'){
      if(getGate&&payload.key==='notes')await getGate.promise;
      const value=data[payload.key]??null;
      return payload.withEtag?{value,etag:etag(value)}:{value};
    }
    if(op==='storage.set'){
      if(setGate&&payload.key==='notes')await setGate.promise;
      if(legacyGate&&payload.key==='note')await legacyGate.promise;
      if(writeError||(failLegacyCleanup&&payload.key==='note'))throw new Error('磁盘不可用');
      if(payload.ifMatch!==undefined&&payload.ifMatch!==etag(data[payload.key]??null))
        throw new Error('工具数据已在其他窗口修改，请重新打开确认');
      data[payload.key]=structuredClone(payload.value);
      return writeResult??{saved:true,etag:etag(payload.value)};
    }
    if(op==='currentPage.info'){
      if(pageGate&&++pageReads>1)await pageGate.promise;
      return page;
    }
    if(op==='tasks.open')return {opened:true};
    throw new Error('invalid operation');
  };
  const states=[];
  const sandbox={OpenDeskTool:{root,request,setState:state=>states.push({...state}),ui:{confirm:uiConfirm},setNavigation},TextEncoder,AbortController,Date,Math,confirm(){throw Error('Native confirm is forbidden by the production sandbox');}};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(script,sandbox,{filename:'quick-notes/src/main.js'});
  return {root,window,nodes,data,calls,states,request,async flush(){
    if(!nodes['note-confirm'].hidden)nodes[confirm()?'note-confirm-accept':'note-confirm-cancel'].emit('click');
    await tick();await tick();await tick();await tick();}};
}

const stored={notes:[{id:'a',text:'甲',updatedAt:1},{id:'b',text:'乙',updatedAt:2}]};
const writes=app=>app.calls.filter(([op,p])=>op==='storage.set'&&p.key==='notes');
const draft=app=>{app.nodes['note-text'].value='未保存🙂';app.nodes['note-text'].emit('input');};
const enter=app=>app.nodes['note-list'].children[1].emit('click');

for(const operation of ['switch','new','back','navigation','delete']){
  for(const answer of [{action:'confirm'},{action:'cancel',reason:'user'}]){
    test(`${operation}: shared ${answer.action} preserves cancellation and applies only the original intent`,async()=>{
      const gate=deferred(),calls=[];
      const app=launch({stored,uiConfirm:(...args)=>{calls.push(args);return gate.promise;}});
      await app.flush();
      if(operation==='back'||operation==='navigation')enter(app);
      draft(app);
      const before=app.nodes['note-text'].value;
      if(operation==='switch')enter(app);
      if(operation==='new')app.nodes['add-note'].emit('click');
      if(operation==='back')app.nodes['back-to-notes'].emit('click');
      if(operation==='navigation')app.root.emit('opendesk-tool-navigation',{detail:{action:'back'}});
      if(operation==='delete')app.nodes['delete-note'].emit('click');
      assert.equal(calls.length,1,'confirmation called synchronously');
      assert.equal(app.nodes['note-confirm'].hidden,true);
      assert.ok(calls[0][1].signal instanceof AbortSignal);
      // A second action must neither replace the original destination nor confirm again.
      app.nodes['add-note'].emit('click');app.nodes['delete-note'].emit('click');
      gate.resolve(answer);await app.flush();
      assert.equal(calls.length,1);
      if(answer.action==='cancel'){
        assert.equal(app.nodes['note-text'].value,before);
        assert.equal(writes(app).length,0);
        assert.equal(app.states.at(-1).dirty,true);
      }else if(operation==='delete'){
        assert.equal(writes(app).length,1);
        assert.equal(writes(app)[0][1].ifMatch,etag(stored.notes));
        assert.equal(app.data.notes.some(n=>n.id==='a'),false);
        assert.equal(app.data.notes[0].id,'b');
      }else{
        assert.equal(writes(app).length,0);
        assert.equal(app.states.at(-1).dirty,false);
        assert.equal(app.nodes['note-text'].value,operation==='switch'?'乙':operation==='new'?'':'乙');
        assert.equal(app.nodes['notes-list-view'].hidden,!['back','navigation'].includes(operation));
      }
    });
  }
}
for(const code of ['E_UI_CONFIRM_BUSY','E_UI_CONFIRM_INPUT','E_UI_CONFIRM_GESTURE','E_TIMEOUT','E_REVOKED']){
  test(`${code}: consumes rejection without fallback or write`,async()=>{
    const app=launch({stored,uiConfirm:()=>Promise.reject(Object.assign(new Error(code),{code}))});
    await app.flush();draft(app);app.nodes['delete-note'].emit('click');await app.flush();
    assert.equal(app.nodes['note-confirm'].hidden,true);
    assert.equal(app.nodes['note-text'].value,'未保存🙂');
    assert.equal(app.states.at(-1).dirty,true);
    assert.equal(writes(app).length,0);
    assert.match(app.nodes['note-status'].textContent,/未执行/);
  });
}
for(const reason of ['user','escape','aborted','invalidated','expired']){
  test(`${reason}: cancel result is never treated as a truthy approval`,async()=>{
    const app=launch({stored,uiConfirm:()=>Promise.resolve({action:'cancel',reason})});
    await app.flush();draft(app);app.nodes['delete-note'].emit('click');await app.flush();
    assert.equal(writes(app).length,0);assert.equal(app.nodes['note-confirm'].hidden,true);
    assert.equal(app.states.at(-1).dirty,true);
  });
}
for(const mode of ['missing','unavailable','sync-unavailable']){
  test(`${mode}: uses original local confirmation and keeps cancellation safe`,async()=>{
    const unavailable=()=>Object.assign(new Error('old Host'),{code:'E_UI_CONFIRM_UNAVAILABLE'});
    const app=launch({stored,uiConfirm:mode==='missing'?undefined:mode==='unavailable'
      ?()=>Promise.reject(unavailable()):()=>{throw unavailable();}});
    await app.flush();draft(app);app.nodes['delete-note'].emit('click');await tick();
    assert.equal(app.nodes['note-confirm'].hidden,false);
    app.root.emit('keydown',{key:'Escape',preventDefault(){}});
    assert.equal(app.nodes['note-confirm'].hidden,true);assert.equal(writes(app).length,0);
    app.nodes['delete-note'].emit('click');await tick();app.nodes['note-confirm-accept'].emit('click');
    app.nodes['note-confirm-accept'].emit('click');await app.flush();
    assert.equal(writes(app).length,1);assert.equal(app.data.notes[0].id,'b');
  });
}
test('navigation guard calls confirm within the dispatch stack and only updates changed navigation',async()=>{
  let dispatching=false;const navigation=[],gate=deferred();
  const app=launch({stored,setNavigation:value=>{navigation.push(value);return true;},uiConfirm:()=>{
    assert.equal(dispatching,true);return gate.promise;
  }});
  await app.flush();enter(app);draft(app);
  assert.equal(navigation.at(-1).canBack,true);
  assert.equal(app.nodes['back-to-notes'].hidden,true);
  const count=navigation.length;
  dispatching=true;app.root.emit('opendesk-tool-navigation',{detail:{action:'back'}});dispatching=false;
  assert.equal(navigation.length,count,'confirmation does not replace the navigation snapshot');
  gate.resolve({action:'confirm'});await app.flush();
  assert.equal(navigation.at(-1).canBack,false);assert.equal(navigation.at(-1).page,'home');
});
for(const change of ['input','attachment','text-without-event']){
  test(`${change}: changed draft invalidates prior confirmation`,async()=>{
    const gate=deferred(),app=launch({stored,uiConfirm:()=>gate.promise});
    await app.flush();draft(app);app.nodes['delete-note'].emit('click');
    if(change==='attachment'){app.nodes['attach-page'].checked=true;app.nodes['attach-page'].emit('change');}
    else{app.nodes['note-text'].value='新草稿';if(change==='input')app.nodes['note-text'].emit('input');}
    gate.resolve({action:'confirm'});await app.flush();
    assert.equal(writes(app).length,0);assert.equal(app.states.at(-1).dirty,true);
  });
}
test('another panel updates the fixed ETag: deletion cannot remove the newer version',async()=>{
  const shared=structuredClone(stored),gate=deferred(),app=launch({shared,uiConfirm:()=>gate.promise});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');
  shared.notes[0].text='另一个窗口的新版本';gate.resolve({action:'confirm'});await app.flush();
  assert.equal(shared.notes[0].text,'另一个窗口的新版本');
  assert.equal(writes(app)[0][1].ifMatch,etag(stored.notes));
  assert.equal(app.states.at(-1).dirty,true);assert.match(app.nodes['note-status'].textContent,/其他窗口/);
});
test('delete waits for receipt, blocks duplicate intents, and clears dirty only after success',async()=>{
  const gate=deferred(),decision=deferred(),app=launch({stored,setGate:gate,uiConfirm:()=>decision.promise});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');decision.resolve({action:'confirm'});await tick();
  assert.equal(writes(app).length,1);assert.equal(app.data.notes.length,2);
  assert.equal(app.states.at(-1).dirty,true);assert.equal(app.states.at(-1).busy,true);
  assert.doesNotMatch(app.nodes['note-status'].textContent,/已删除/);
  app.nodes['delete-note'].emit('click');app.nodes['save-note'].emit('click');
  gate.resolve();await app.flush();assert.equal(writes(app).length,1);
  assert.equal(app.states.at(-1).dirty,false);assert.match(app.nodes['note-status'].textContent,/已删除/);
});
for(const failure of ['rejection','invalid-receipt']){
  test(`${failure}: preserves draft and forbids replay of unknown delete`,async()=>{
    let decisions=0;
    const app=launch({stored,writeError:failure==='rejection',writeResult:failure==='invalid-receipt'?{saved:false}:undefined,
      uiConfirm:()=>{decisions++;return Promise.resolve({action:'confirm'});}});
    await app.flush();draft(app);app.nodes['delete-note'].emit('click');await app.flush();
    assert.equal(app.states.at(-1).dirty,true);assert.equal(app.nodes['note-text'].value,'未保存🙂');
    assert.match(app.nodes['note-status'].textContent,/结果未知/);
    app.nodes['delete-note'].emit('click');app.nodes['save-note'].emit('click');await app.flush();
    assert.equal(writes(app).length,1);assert.equal(decisions,1);
  });
}
test('page disposal aborts only the pending confirmation; late confirm cannot write',async()=>{
  const gate=deferred();let signal;
  const app=launch({stored,uiConfirm:(_,client)=>{signal=client.signal;return gate.promise;}});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');app.window.emit('pagehide');
  assert.equal(signal.aborted,true);gate.resolve({action:'confirm'});await app.flush();
  assert.equal(writes(app).length,0);assert.equal(app.nodes['note-text'].value,'未保存🙂');
});

test('the initially selected first note can open from the list and return through the guard',async()=>{
  const app=launch({stored});await app.flush();
  app.nodes['note-list'].children[0].emit('click');
  assert.equal(app.nodes['notes-edit-view'].hidden,false);
  assert.equal(app.nodes['note-text'].value,'甲');draft(app);
  app.nodes['back-to-notes'].emit('click');assert.equal(app.nodes['note-confirm'].hidden,false);
  app.nodes['note-confirm-cancel'].emit('click');assert.equal(app.nodes['note-text'].value,'未保存🙂');
});
test('first terminal result wins and does not clear a later confirmation',async()=>{
  const first=deferred(),second=deferred();let count=0;
  const app=launch({stored,uiConfirm:()=>++count===1?first.promise:second.promise});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');
  first.resolve({action:'cancel',reason:'aborted'});await app.flush();
  app.nodes['add-note'].emit('click');first.resolve({action:'confirm'});await tick();
  assert.equal(app.nodes['note-text'].disabled,true);assert.equal(writes(app).length,0);
  second.resolve({action:'cancel',reason:'user'});await app.flush();
  assert.equal(app.nodes['note-text'].value,'未保存🙂');assert.equal(writes(app).length,0);
});
test('disposal before unavailable rejection never opens a local fallback',async()=>{
  const gate=deferred(),app=launch({stored,uiConfirm:()=>gate.promise});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');app.window.emit('pagehide');
  gate.reject(Object.assign(new Error('unavailable'),{code:'E_UI_CONFIRM_UNAVAILABLE'}));await app.flush();
  assert.equal(app.nodes['note-confirm'].hidden,true);assert.equal(writes(app).length,0);
});
test('plain synchronous confirm error is consumed without fallback',async()=>{
  const app=launch({stored,uiConfirm:()=>{throw new Error('transport failed');}});
  await app.flush();draft(app);app.nodes['delete-note'].emit('click');await app.flush();
  assert.equal(app.nodes['note-confirm'].hidden,true);assert.equal(writes(app).length,0);
  assert.equal(app.states.at(-1).dirty,true);
});

test('disposal during save page validation prevents a later storage write',async()=>{
  const gate=deferred(),app=launch({stored,pageGate:gate,
    page:{status:'available',title:'当前网页',url:'https://example.com/'}});
  await app.flush();enter(app);draft(app);app.nodes['attach-page'].checked=true;
  app.nodes['save-note'].emit('click');await tick();
  assert.equal(writes(app).length,0);
  app.window.emit('pagehide');const count=app.states.length;
  gate.resolve();await app.flush();
  assert.equal(writes(app).length,0,'retired document must not begin a write');
  assert.equal(app.states.length,count,'late validation must not publish state');
});
for(const operation of ['save','delete']){
  for(const terminal of ['success','rejection']){
    test(`${operation}: ${terminal} after disposal cannot update the retired editor`,async()=>{
      const gate=deferred(),app=launch({stored,setGate:gate,
        uiConfirm:()=>Promise.resolve({action:'confirm'})});
      await app.flush();enter(app);draft(app);
      app.nodes[operation==='save'?'save-note':'delete-note'].emit('click');await tick();
      assert.equal(writes(app).length,1,'the original write is already in flight');
      app.window.emit('pagehide');
      const count=app.states.length,status=app.nodes['note-status'].textContent;
      if(terminal==='success')gate.resolve();else gate.reject(new Error('late transport failure'));
      await app.flush();
      assert.equal(writes(app).length,1,'disposal does not replay the original write');
      assert.equal(app.states.length,count,'retired editor must not publish state');
      assert.equal(app.nodes['note-status'].textContent,status,'late result must not replace feedback');
    });
  }
}
for(const operation of ['save','delete']){
  test(`${operation}: disposal during legacy cleanup suppresses late success feedback`,async()=>{
    const gate=deferred(),app=launch({stored:{...stored,note:'旧备份'},legacyGate:gate,
      uiConfirm:()=>Promise.resolve({action:'confirm'})});
    await app.flush();enter(app);draft(app);
    app.nodes[operation==='save'?'save-note':'delete-note'].emit('click');await tick();
    assert.equal(writes(app).length,1);
    assert.ok(app.calls.some(([op,p])=>op==='storage.set'&&p.key==='note'));
    app.window.emit('pagehide');
    const count=app.states.length,status=app.nodes['note-status'].textContent;
    gate.resolve();await app.flush();
    assert.equal(app.states.length,count);
    assert.equal(app.nodes['note-status'].textContent,status);
  });
}
