import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../../projects/bookmark-manager/src/model.js';

const model=globalThis.BookmarkR2Model;
const source=await readFile(new URL('../../projects/bookmark-manager/src/react/App.jsx',import.meta.url),'utf8');
const start=source.indexOf(' async function save(e)'),end=source.indexOf(' async function removeConfirmed(',start);
assert.ok(start>=0&&end>start,'execute the actual App Save callback without compiling its JSX');
const saveSource=source.slice(start,end).trim();

function saveFixture(mode='trusted'){
  const calls=[],created={id:'new-folder',title:'New folder',parentId:'1',index:0};
  const state={mode,draft:{mode:'create',kind:'folder',title:created.title,parentId:'1'},
    tree:model.bookmarkTree([{id:'0',title:'root',children:[{id:'1',title:'bar',children:[]}]}]),
    busy:false,uncertain:false,error:'',notice:'',
    busyRef:{current:false},authorityEpoch:{current:0},activeRef:{current:true},
    fillEpoch:{current:0},writeEpoch:{current:0},readEpoch:{current:0},
    humanError:error=>error.message,authorityDenied:()=>false,
    revoke:()=>assert.fail('valid fixture must not revoke authority'),
    service:{
      async createFolder(args){calls.push(['createFolder',args]);return created;},
      async load(){calls.push(['load']);return {byId:new Map([[created.id,created]])};}
    }
  };
  for(const name of ['Busy','Error','Tree','SelectedId','ActiveId','Draft','PreviewOpen',
    'PickerOpen','Uncertain','Notice','Loading']){
    const key=name[0].toLowerCase()+name.slice(1);
    state['set'+name]=value=>{state[key]=value;};
  }
  const names=Object.keys(state);
  const save=new Function('model',...names,'return ('+saveSource+');')(model,...names.map(name=>state[name]));
  return {state,calls,save};
}

for(const isTrusted of [false,undefined])test(`R3.4 trusted Save rejects isTrusted=${isTrusted} before any work`,async()=>{
  const f=saveFixture(),draft=f.state.draft;
  let prevented=0;
  await f.save({...(isTrusted===undefined?{}:{isTrusted}),preventDefault(){prevented++;}});
  assert.deepEqual(f.calls,[],'synthetic submission cannot validate, mint an intent or write');
  assert.equal(prevented,0,'the callback stops at the event trust guard');
  assert.equal(f.state.draft,draft,'the rejected event preserves the draft');
  assert.equal(f.state.busyRef.current,false);
  for(const name of ['fillEpoch','writeEpoch','readEpoch'])assert.equal(f.state[name].current,0);
  assert.equal(f.state.error,'');assert.equal(f.state.notice,'');
});

for(const [mode,isTrusted] of [['trusted',true],['preview',false]]){
  test(`R3.4 ${mode} Save accepts its supported input and completes the write`,async t=>{
    const oldStage=Object.getOwnPropertyDescriptor(globalThis,'__bmReactSaveStage');
    t.after(()=>{if(oldStage)Object.defineProperty(globalThis,'__bmReactSaveStage',oldStage);
      else delete globalThis.__bmReactSaveStage;});
    const f=saveFixture(mode);let prevented=0;
    await f.save({isTrusted,preventDefault(){prevented++;}});
    assert.equal(prevented,1);
    assert.deepEqual(f.calls,[['createFolder',{title:'New folder',parentId:'1'}],['load']]);
    assert.equal(f.state.draft,null,'a verified successful Save closes the draft');
    assert.equal(f.state.notice,'已保存');assert.equal(f.state.error,'');
    assert.equal(f.state.busy,false);assert.equal(f.state.busyRef.current,false);
  });
}
