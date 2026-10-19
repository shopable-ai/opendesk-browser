import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView,patchDeveloperField,developerOptions,appendDeveloperOptions,
  developerAttribute,developerAction,focusDeveloperField} from '../../src/ui/develop-view.js';
import {createScriptEditor} from '../../src/ui/script-editor.js';

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
