import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createControllerRevisionView} from '../../src/ui/controller-revision-view.js';
import {createControllerESMSavedSource,createControllerClassicSavedSource} from '../../src/ui/controller-esm-source.js';
import {digestUtf8} from '../../src/platform/protocol.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(t,{confirm=async()=>({action:'confirm'}),projectSnapshot=snapshot=>snapshot}={}){
  const model=createDeveloperView(),confirmations=[],writes=[],loads=[],statuses=[],requests=[];
  let source='',generation=0,rows=[{scriptId:'saved-a',revision:3,sourceUtf8:'saved A',contentHash:'a'.repeat(64)},
    {scriptId:'saved-b',revision:7,sourceUtf8:'saved B',contentHash:'b'.repeat(64)}];
  let get=async({scriptId})=>rows.find(row=>row.scriptId===scriptId);
  const view={...model,getSnapshot:()=>projectSnapshot(model.getSnapshot()),
    requestConfirmation(options){confirmations.push(options);return confirm(options);}};
  const owner=createControllerRevisionView({view,
    host:{controller:{listControllerScripts:async()=>rows,
      getControllerScript:args=>get(args),
      tombstoneControllerScript:async args=>{writes.push(args);rows=rows.filter(row=>row.scriptId!==args.scriptId);},
      commitControllerScript:async()=>{assert.fail('management must not save');}}},
    client:{request(...args){requests.push(args);assert.fail('management must not run or request permissions');}},
    programSource:{source:()=>source},getGeneration:()=>generation,
    prepareESM(){assert.fail('management must not compile or run');},
    onLoad(value){source=value;loads.push(value);},onUpdate(){},onStatus(...args){statuses.push(args);}});
  t.after(()=>{owner.dispose();model.dispose();});
  model.patch('script-id',{value:'edited-id'});
  model.patch('script-revision',{value:'2'});
  return {model,owner,confirmations,writes,loads,statuses,requests,
    source:()=>source,setSource(value){source=value;},bump(){generation++;},
    setRows(value){rows=value;},rows:()=>rows,setGet(value){get=value;},
    select(value){model.patch('script-list',{value});}};
}
async function catalog(f){await f.owner.refresh({silent:true});f.select('saved-a');}
const noReplacement=f=>{assert.deepEqual(f.loads,[]);assert.equal(f.statuses.some(([kind])=>kind==='loaded'),false);assert.deepEqual(f.writes,[]);};

test('delete targets catalog selection, keeps CAS and describes irreversible history removal',async t=>{
  const f=setup(t);await catalog(f);
  f.owner.update({busy:false,local:false,page:false});
  assert.equal(f.model.fields['script-delete'].disabled,false);
  assert.equal(f.model.fields['script-list'].options[1].label,'saved-a · r3');
  await f.owner.remove();
  assert.deepEqual(f.writes,[{scriptId:'saved-a',expectedRevision:3}]);
  assert.equal(f.model.fields['script-id'].value,'edited-id');
  assert.match(f.confirmations[0].message,/saved-a · r3/);
  assert.match(f.confirmations[0].message,/所有已保存版本/);
  assert.match(f.confirmations[0].message,/ID 不能再次使用/);
  assert.equal(f.confirmations[0].tone,'danger');
  assert.deepEqual(f.requests,[]);
});

test('delete requires selected existing head even when editor ID exists',async t=>{
  const f=setup(t);await catalog(f);f.model.patch('script-id',{value:'saved-a'});
  for(const selection of ['', 'missing']){
    f.select(selection);f.owner.update({busy:false,local:false,page:false});
    assert.equal(f.model.fields['script-delete'].disabled,true);
    await assert.rejects(f.owner.remove(),{code:'E_REVISION'});
  }
  assert.deepEqual(f.confirmations,[]);assert.deepEqual(f.writes,[]);
});

test('cancel deletion performs zero Host writes',async t=>{
  const f=setup(t,{confirm:async()=>({action:'cancel'})});await catalog(f);f.setSource('draft');
  await f.owner.remove();assert.deepEqual(f.writes,[]);assert.equal(f.source(),'draft');
  assert.equal(f.statuses.some(([kind])=>kind==='deleted'),false);
});

const mutations={
  selection:f=>f.select('saved-b'),
  head:async f=>{f.setRows(f.rows().map(row=>row.scriptId==='saved-a'?{...row,revision:4}:row));await f.owner.refresh({silent:true});},
  source:f=>f.setSource('new draft'),
  id:f=>f.model.patch('script-id',{value:'changed-id'}),
  revision:f=>f.model.patch('script-revision',{value:'9'}),
  world:f=>f.model.patch('script-javascript-world',{value:'PAGE'}),
  mode:f=>f.model.patch('page-component-react',{checked:!f.model.fields['page-component-react'].checked}),
  generation:f=>f.bump(),
  dispose:f=>f.owner.dispose()
};
for(const [name,mutate] of Object.entries(mutations)){
  test(`delete rejects late ${name} mutation`,async t=>{
    const choice=deferred(),f=setup(t,{confirm:()=>choice.promise});await catalog(f);
    const pending=f.owner.remove();await mutate(f);choice.resolve({action:'confirm'});
    await assert.rejects(pending,{code:'E_REVISION'});assert.deepEqual(f.writes,[]);
  });
  test(`load rejects late ${name} mutation after confirmation`,async t=>{
    const choice=deferred(),shown=deferred(),f=setup(t,{confirm:()=>{shown.resolve();return choice.promise;}});
    await catalog(f);f.setSource('unsaved draft');
    const pending=f.owner.loadLatest();await shown.promise;await mutate(f);choice.resolve({action:'confirm'});
    await assert.rejects(pending,{code:'E_REVISION'});noReplacement(f);
  });
  test(`load rejects late ${name} mutation during Host read`,async t=>{
    const read=deferred(),f=setup(t);await catalog(f);f.setSource('unsaved draft');f.setGet(()=>read.promise);
    const pending=f.owner.loadLatest();await mutate(f);read.resolve({scriptId:'saved-a',revision:3,sourceUtf8:'saved A'});
    if(name==='dispose')await pending;
    else await assert.rejects(pending,{code:'E_REVISION'});
    noReplacement(f);assert.deepEqual(f.confirmations,[]);
  });
}

test('cancel replacement retains draft identity and revision without success or onLoad',async t=>{
  const f=setup(t,{confirm:async()=>({action:'cancel'})});await catalog(f);f.setSource('draft');
  await f.owner.loadLatest();
  assert.equal(f.source(),'draft');assert.equal(f.model.fields['script-id'].value,'edited-id');
  assert.equal(f.model.fields['script-revision'].value,'2');noReplacement(f);
  assert.match(f.confirmations[0].message,/saved-a · r3/);
  assert.equal(f.confirmations[0].cancelLabel,'继续编辑');
});

test('confirmed replacement loads author source and revision without running or saving',async t=>{
  const f=setup(t);await catalog(f);f.setSource('draft');await f.owner.loadLatest();
  assert.deepEqual(f.loads,['saved A']);assert.equal(f.model.fields['script-id'].value,'saved-a');
  assert.equal(f.model.fields['script-revision'].value,'3');
  assert.equal(f.statuses.at(-1)[0],'loaded');assert.deepEqual(f.requests,[]);assert.deepEqual(f.writes,[]);
});

test('empty, incoming-identical and clean current saved source need no replacement prompt',async t=>{
  const f=setup(t);await catalog(f);await f.owner.loadLatest();
  assert.deepEqual(f.confirmations,[]);
  await f.owner.loadLatest();assert.deepEqual(f.confirmations,[]);
  f.select('saved-b');await f.owner.loadLatest();
  assert.equal(f.source(),'saved B');assert.deepEqual(f.confirmations,[]);
});

for(const [name,change] of Object.entries({
  id:f=>f.model.patch('script-id',{value:'unsaved-id'}),
  revision:f=>f.model.patch('script-revision',{value:'99'}),
  world:f=>f.model.patch('script-javascript-world',{value:'page'}),
  react:f=>{f.model.patch('page-component-javascript',{checked:false});f.model.patch('page-component-react',{checked:true});},
  vue:f=>{f.model.patch('page-component-javascript',{checked:false});f.model.patch('page-component-vue',{checked:true});}
}))test(`unchanged saved source with changed ${name} requires replacement confirmation`,async t=>{
  const f=setup(t,{confirm:async()=>({action:'cancel'})});await catalog(f);await f.owner.loadLatest();
  change(f);f.select('saved-b');
  const before=Object.fromEntries(['script-id','script-revision','script-javascript-world',
    'page-component-javascript','page-component-react','page-component-vue'].map(key=>[key,{...f.model.fields[key]}]));
  f.loads.length=0;f.statuses.length=0;
  await f.owner.loadLatest();
  assert.equal(f.confirmations.length,1);
  assert.match(f.confirmations[0].message,/saved-b · r7/);
  assert.equal(f.confirmations[0].cancelLabel,'继续编辑');
  assert.equal(f.source(),'saved A');
  for(const [key,value] of Object.entries(before))assert.deepEqual(f.model.fields[key],value);
  noReplacement(f);assert.deepEqual(f.requests,[]);
});

test('explicit revision load also protects draft and list selection while awaiting choice',async t=>{
  const shown=deferred(),choice=deferred(),f=setup(t,{confirm:()=>{shown.resolve();return choice.promise;}});
  await catalog(f);f.model.patch('script-id',{value:'saved-a'});f.setSource('draft');
  const pending=f.owner.load();await shown.promise;f.select('saved-b');choice.resolve({action:'confirm'});
  await assert.rejects(pending,{code:'E_REVISION'});noReplacement(f);
});

for(const source of ['', 'unsaved draft', 'saved A'])test(`navigation invalidates delayed load with source ${JSON.stringify(source)}`,async t=>{
  // Project the navigation-generation contract while the view owner implements it.
  let navigationGeneration=0;
  const read=deferred(),f=setup(t,{projectSnapshot:snapshot=>({...snapshot,navigationGeneration})});
  await catalog(f);f.model.navigate('library');f.setSource(source);f.setGet(()=>read.promise);
  const pending=f.owner.loadLatest();
  f.model.navigate('diagnostics');navigationGeneration++;
  f.model.navigate('library');navigationGeneration++;
  read.resolve({scriptId:'saved-a',revision:3,sourceUtf8:'saved A'});
  await assert.rejects(pending,{code:'E_REVISION'});
  assert.deepEqual(f.confirmations,[]);noReplacement(f);
  assert.equal(f.source(),source);assert.equal(f.model.fields['script-id'].value,'edited-id');
  assert.equal(f.model.fields['script-revision'].value,'2');
  assert.equal(f.model.getSnapshot().section,'library');
});

test('navigation generation invalidates a late replacement confirmation',async t=>{
  let navigationGeneration=0;
  const choice=deferred(),shown=deferred(),f=setup(t,{
    projectSnapshot:snapshot=>({...snapshot,navigationGeneration}),
    confirm:()=>{shown.resolve();return choice.promise;}});
  await catalog(f);f.setSource('unsaved draft');
  const pending=f.owner.loadLatest();await shown.promise;navigationGeneration++;
  choice.resolve({action:'confirm'});
  await assert.rejects(pending,{code:'E_REVISION'});noReplacement(f);
  assert.equal(f.source(),'unsaved draft');
});

for(const format of ['ESM','Classic'])test(`${format} verified author restoration remains clean when switching saved scripts`,async t=>{
  const f=setup(t);const author='async function main() { return 42; }';let saved;
  if(format==='ESM'){
    const executable='async function main() { return 42; }\n';
    saved=await createControllerESMSavedSource({authorSourceUtf8:author,programId:'saved-a',built:{
      sourceUtf8:executable,framework:'controller',compilerVersion:'7.29.9',
      authoringSourceHash:await digestUtf8(author),sourceHash:await digestUtf8(executable)}});
  }else{
    const authorSourceHash=await digestUtf8(author),lockId='controller-classic-'+'a'.repeat(64);
    saved=await createControllerClassicSavedSource({authorSourceUtf8:author,programId:'saved-a',prepared:{
      world:'CONTROLLER',programId:'saved-a',authorSourceHash,
      sourceUtf8:`/* opendesk.controller-classic-runtime.v1 lock=${lockId} author=${authorSourceHash} */\nasync function main() {}`,
      lockId,
      entries:[{url:'https://example.com/lib.js',sha256:'b'.repeat(64),world:'CONTROLLER',byteLength:12}]}});
  }
  f.setRows(f.rows().map(row=>row.scriptId==='saved-a'?{...row,sourceUtf8:saved}:row));
  await catalog(f);await f.owner.loadLatest();assert.equal(f.source(),author);
  f.select('saved-b');await f.owner.loadLatest();
  assert.deepEqual(f.confirmations,[]);assert.equal(f.source(),'saved B');assert.deepEqual(f.requests,[]);
});
