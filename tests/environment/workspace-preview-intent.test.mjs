import test from 'node:test';
import assert from 'node:assert/strict';
import {openToolPreviewWorkspace,consumeToolPreviewIntent} from '../../src/ui/sidebar-tools/workspace-preview-intent.js';
const sourceId='source-'+('a'.repeat(24)),id='00000000-0000-4000-8000-000000000001';
function fixture(){
  const values={},opened=[];let tail=Promise.resolve();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{session:{
    get:async key=>({[key]:structuredClone(values[key])}),set:async rows=>Object.assign(values,rows),remove:async key=>{delete values[key];}}},
    tabs:{create:async row=>{opened.push(row);return {id:91};}}};
  const lockManager={request(_name,action){const next=tail.then(action);tail=next.catch(()=>{});return next;}};
  return {api,values,opened,lockManager};
}
test('trusted preview handoff is source-bound, expires, and is consumed once across racing pages',async()=>{
  const f=fixture(),args={...f,id,sourceId,now:1000};
  await openToolPreviewWorkspace({...args,toolId:'prompt-shortcuts'});
  assert.match(f.opened[0].url,/sourceId=source-a+&previewIntent=/);
  await assert.rejects(consumeToolPreviewIntent({...args,sourceId:'source-'+('b'.repeat(24))}),/失效/);
  const results=await Promise.allSettled([consumeToolPreviewIntent(args),consumeToolPreviewIntent(args)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(results.find(row=>row.status==='fulfilled').value.toolId,'prompt-shortcuts');
  await openToolPreviewWorkspace(args);
  await assert.rejects(consumeToolPreviewIntent({...args,now:61000}),/失效/);
  await assert.rejects(consumeToolPreviewIntent({...args,lockManager:null}),/失效/);
});
test('opening failure removes the handoff and invalid source/tool values never publish',async()=>{
  const f=fixture();f.api.tabs.create=async()=>{throw Error('tab unavailable');};
  await assert.rejects(openToolPreviewWorkspace({...f,id,sourceId}),/tab unavailable/);
  assert.equal(Object.keys(f.values).length,0);
  await assert.rejects(openToolPreviewWorkspace({...f,id,sourceId,toolId:'../wrong'}),/失效/);
  assert.equal(Object.keys(f.values).length,0);
});
