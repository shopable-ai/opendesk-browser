import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView,patchDeveloperField,developerOptions,appendDeveloperOptions,
  developerAttribute,developerAction,focusDeveloperField} from '../../src/ui/develop-view.js';
import {createScriptEditor} from '../../src/ui/script-editor.js';
import {createControllerResultsView} from '../../src/ui/controller-results-view.js';
import {createControllerRevisionView} from '../../src/ui/controller-revision-view.js';

test('native form edits publish before controlled restoration while results remain batched', async () => {
  const view=createDeveloperView(),snapshots=[];
  view.subscribe(()=>snapshots.push(view.getSnapshot()));
  try{
    view.patch('script-source',{value:'edited at the caret'},{immediate:true});
    assert.equal(snapshots.length,1,'React receives the edited value within the native input event');
    assert.equal(snapshots[0].fields['script-source'].value,'edited at the caret');
    view.patch('script-status',{textContent:'running'});
    view.patch('script-result',{textContent:'result'});
    assert.equal(snapshots.length,1,'background status updates retain their batch');
    await Promise.resolve();
    assert.equal(snapshots.length,2);
    assert.equal(snapshots[1].fields['script-result'].textContent,'result');
  }finally{view.dispose();}
});

test('developer controllers publish state, options and attributes without DOM fields', async () => {
  const view=createDeveloperView(),field=view.fields['script-list'],snapshots=[];
  const unsubscribe=view.subscribe(()=>snapshots.push(view.getSnapshot()));
  try {
    const original=view.getSnapshot();
    patchDeveloperField(view,field,{value:'saved',textContent:'固定版本',data:{state:'ready'}});
    developerOptions(view,field,[{label:'新草稿',value:''},{label:'已保存',value:'saved'}]);
    appendDeveloperOptions(view,field,[{label:'另一版本',value:'other'}]);
    developerAttribute(view,field,'aria-label','选择版本');
    developerAttribute(view,field,'aria-live','polite');
    developerAttribute(view,field,'title',null);
    await Promise.resolve();
    const state=view.getSnapshot().fields['script-list'];
    assert.equal(original.fields['script-list'].value,'');
    assert.equal(state.value,'saved');
    assert.equal(state.textContent,'固定版本');
    assert.equal(state.textSet,true);
    assert.deepEqual(state.data,{state:'ready'});
    assert.deepEqual(state.options.map(row=>row.value),['','saved','other']);
    assert.equal(state.ariaLabel,'选择版本');
    assert.equal(state.ariaLive,'polite');
    assert.equal(state.title,'');
    assert.equal(snapshots.length,1,'state changes publish one queued notification');
    developerOptions(view,field,[{label:'新草稿',value:''}]);
    assert.equal(field.value,'','removed selection returns to the first option');
    developerOptions(view,field,[]);
    assert.deepEqual(field.options,[]);
    assert.equal(field.value,'');
    assert.equal('dataset' in field,false);
    assert.equal('addEventListener' in field,false);
  } finally {unsubscribe();view.dispose();}
});

test('developer helpers require a view and never substitute DOM fields or listeners', () => {
  const field={key:'script-source',value:'',options:[],
    focus(){assert.fail('DOM focus');},
    addEventListener(){assert.fail('DOM listener');},
    replaceChildren(){assert.fail('DOM options');},
    append(){assert.fail('DOM append');},
    setAttribute(){assert.fail('DOM attribute');}};
  for(const action of [
    ()=>patchDeveloperField(null,field,{value:'draft'}),
    ()=>developerOptions(null,field,[]),
    ()=>appendDeveloperOptions(null,field,[]),
    ()=>developerAttribute(null,field,'title','title'),
    ()=>developerAction(null,field,'input',()=>{}),
    ()=>focusDeveloperField(null,field)
  ])assert.throws(action,TypeError);
  assert.equal(field.value,'');
  assert.throws(()=>createScriptEditor({document:{getElementById(){assert.fail('DOM lookup');}},
    hostFactory(){assert.fail('no Host should be created before the view is connected');}}),
  {code:'E_DEVELOPER_VIEW'});
});

test('developer actions keep the native event and release only their own registration', () => {
  const view=createDeveloperView(),field=view.fields['script-run'],events=[];
  try {
    const releaseOld=developerAction(view,field,'click',()=>assert.fail('stale action'));
    const release=developerAction(view,field,'click',event=>events.push(event));
    releaseOld();
    const event={isTrusted:true};
    view.actions['script-run'](event);
    assert.deepEqual(events,[event]);
    assert.equal(events[0],event);
    release();
    assert.equal(view.actions['script-run'],undefined);
    focusDeveloperField(view,view.fields['script-source']);
    const first=view.getSnapshot().focus;
    focusDeveloperField(view,view.fields['script-source']);
    assert.equal(view.getSnapshot().focus.key,'script-source');
    assert.equal(view.getSnapshot().focus.sequence,first.sequence+1);
    view.dispose();
    const snapshot=view.getSnapshot();
    focusDeveloperField(view,view.fields['script-source']);
    assert.equal(view.getSnapshot(),snapshot);
    assert.deepEqual(view.resourceSnapshot(),{subscriptions:0,actions:0});
  } finally {view.dispose();}
});

test('Controller history options publish once and preserve exact run selection',async()=>{
  const view=createDeveloperView(),patches=[];
  const projected={...view,patch(key,value){if(key==='script-history-run')patches.push(value);view.patch(key,value);}};
  let runs=Array.from({length:32},(_,i)=>({runId:'run-'+i,sourceKind:'draft',state:'completed'}));
  const owner=createControllerResultsView({
    host:{currentRun:null,controller:{snapshotControllerRun:async()=>({
      runs,results:[],downloads:[],resultDeliveryDenied:[]})}},
    view:projected,resultDownloads:{showResults(){}},isDisposed:()=>false,isRunning:()=>false,
    getOwnedRunId:()=>'',isLocalPageResultCurrent:()=>false,onUpdate(){},onStatus(){},
    setResultText(){},setResultKind(){},displayCopyResult(){},showRecovery(){},hideRecovery(){}
  });
  try{
    view.patch('script-history-run',{value:'run-17'});
    await owner.read('');
    assert.equal(patches.length,1,'history is projected in one snapshot, not per option');
    assert.equal(view.fields['script-history-run'].value,'run-17');
    assert.equal(view.fields['script-history-run'].options.length,33);
    patches.length=0;
    runs=runs.filter(row=>row.runId!=='run-17');
    await owner.read('');
    assert.equal(patches.length,1);
    assert.equal(view.fields['script-history-run'].value,'','removed run selection must not survive refresh');
  }finally{view.dispose();}
});

test('Controller revision catalog does not publish a snapshot for every saved script',async()=>{
  const view=createDeveloperView(),patches=[],rows=Array.from({length:24},(_,i)=>({
    scriptId:i===7?'my-script':'saved-'+i,revision:i+1,contentHash:'a'.repeat(64)}));
  const projected={...view,patch(key,value){if(key==='script-list')patches.push(value);view.patch(key,value);}};
  const owner=createControllerRevisionView({
    host:{controller:{listControllerScripts:async()=>rows}},client:{},view:projected,
    programSource:{source:()=>''},prepareESM(){},getGeneration:()=>0,onLoad(){},onUpdate(){},onStatus(){}
  });
  try{
    await owner.refresh({silent:true});
    assert.equal(view.fields['script-list'].value,'my-script','existing script ID is selected');
    assert.equal(view.fields['script-list'].options.length,25);
    assert.equal(patches.length,2,'initial catalog and ID selection require at most two projections');
    patches.length=0;
    await owner.refresh({silent:true});
    assert.equal(patches.length,1,'subsequent refresh publishes options once');
    assert.equal(view.fields['script-list'].value,'my-script');
  }finally{owner.dispose();view.dispose();}
});
