import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createDevelopScriptPicker} from '../../src/ui/develop-script-picker.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};};
function setup(t,load){
  const view=createDeveloperView(),calls=[];
  const row={kind:'controller',value:'saved',scriptId:'saved',revision:3};
  view.patch('script-list',{options:[row],value:'previous'});
  view.patch('script-source',{value:'my draft'});
  const picker=createDevelopScriptPicker({view,isBlocked:()=>false,
    loadController:async options=>{calls.push(options);return load?.(options)??row;},
    loadPage:()=>assert.fail('Controller selection must not route to Page')});
  t.after(()=>{picker.dispose();view.dispose();});
  view.setScriptPickerOpen(true);
  return {view,calls,row,open:()=>view.actions['developer-script-open'](row)};
}
test('open adapter delegates a pinned item without selecting or executing and focuses only after success',async t=>{
  const gate=deferred(),f=setup(t,()=>gate.promise);
  const pending=f.open();
  assert.equal(f.view.fields['script-list'].value,'previous');
  assert.equal(f.view.fields['script-source'].value,'my draft');
  assert.equal(f.calls[0].scriptId,'saved');assert.equal(f.calls[0].revision,3);
  assert.equal(f.calls[0].stillCurrent(),true);
  gate.resolve(f.row);assert.equal(await pending,true);
  assert.equal(f.view.getSnapshot().scriptPicker.open,false);
  assert.equal(f.view.getSnapshot().focus.key,'script-source');
});
for(const result of ['cancel','error'])test(`open ${result} preserves source, selection and open menu`,async t=>{
  const f=setup(t,async()=>{if(result==='error')throw {code:'E_READ',message:'failed read'};return false;});
  assert.equal(await f.open(),false);
  assert.equal(f.view.fields['script-source'].value,'my draft');assert.equal(f.view.fields['script-list'].value,'previous');
  assert.equal(f.view.getSnapshot().scriptPicker.open,true);assert.equal(f.view.getSnapshot().scriptPicker.pending,'');
  assert.equal(Boolean(f.view.getSnapshot().scriptPicker.error),result==='error');
  assert.equal(f.view.getSnapshot().focus,undefined);
});
for(const change of ['close','refresh','hide','navigate','dispose'])test(`${change} invalidates pending open without stale focus or selection`,async t=>{
  const gate=deferred(),f=setup(t,async options=>{await gate.promise;if(!options.stillCurrent())throw {code:'E_REVISION',message:'stale'};return f.row;});
  const pending=f.open();
  if(change==='close')f.view.setScriptPickerOpen(false);
  if(change==='refresh')f.view.patch('script-list',{options:[{...f.row}]});
  if(change==='hide')f.view.setPresentationActive(false);
  if(change==='navigate')f.view.navigate('library');
  if(change==='dispose')f.view.dispose();
  assert.equal(f.calls[0].stillCurrent(),false);
  gate.resolve();assert.equal(await pending,false);
  assert.equal(f.view.fields['script-source'].value,'my draft');assert.equal(f.view.fields['script-list'].value,'previous');
  assert.equal(f.view.getSnapshot().focus,undefined);
  if(change==='refresh')assert.equal(f.view.getSnapshot().scriptPicker.pending,'','refresh cannot leave all items permanently disabled');
});
test('save-list refresh is presentation data and never loads a new source',async()=>{
  const view=createDeveloperView();
  try{
    view.patch('script-source',{value:'newer unsaved content',loadedScript:{kind:'controller',id:'saved',revision:2}});
    view.patch('script-list',{options:[{kind:'controller',value:'saved',scriptId:'saved',revision:3}]});
    assert.equal(view.fields['script-source'].value,'newer unsaved content');
    assert.equal(view.fields['script-source'].loadedScript.revision,2);
  }finally{view.dispose();}
});
