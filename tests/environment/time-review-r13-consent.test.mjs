import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTimeReviewPermissionControls} from '../../src/time-review/host-controls.js';
import {makeTimeReviewDOM} from './time-review-host-controls-fixture.mjs';

function find(root,id){
  if(root.id===id)return root;
  for(const node of root.children){const match=find(node,id);if(match)return match;}
  return null;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('R1.3 minute collection requires genuine host click and is never enabled by sandbox load',async()=>{
  const {root:target,doc}=makeTimeReviewDOM(),operations=[],notifications=[];
  const controls=createTimeReviewPermissionControls({
    api:{permissions:{request:async()=>true,remove:async()=>true}},
    doc,container:target,
    notice:(value,error)=>notifications.push({value,error}),
    runOperation:async(operation,payload)=>{operations.push({operation,payload});return {ok:true};}
  });
  controls.render({id:'time-review',capabilities:['time.review']});
  const enable=find(target,'time-review-minute-enable');
  const disable=find(target,'time-review-minute-disable');
  const review=find(target,'time-review-minute-delete-review');
  const approve=find(target,'time-review-minute-delete-approve');
  const cancel=find(target,'time-review-minute-delete-cancel');
  assert(enable&&disable&&review&&approve&&cancel,'trusted UI exposes explicit consent controls');
  enable.emit('click',false);await flush();
  assert.deepEqual(operations,[],'synthetic click cannot grant minute collection consent');
  enable.emit('click',true);await flush();
  assert.deepEqual(operations,[{operation:'time.minuteConsent',payload:{enabled:true}}]);
  disable.emit('click',true);
  assert.equal(review.hidden,false,'deletion requires an inline confirmation');
  cancel.emit('click',true);
  assert.equal(review.hidden,true);
  assert.equal(operations.length,1);
  disable.emit('click',true);
  approve.emit('click',false);await flush();
  assert.equal(operations.length,1,'synthetic deletion consent rejected');
  approve.emit('click',true);await flush();
  assert.deepEqual(operations[1],{operation:'time.minuteConsent',payload:{enabled:false}});
  controls.render({id:'other-tool',capabilities:['time.review']});
  assert.equal(review.hidden,true,'unrelated tool hides pending consent');
  assert.ok(notifications.some(row=>row.error),'untrusted attempt gives feedback');
});

test('R1.3 shared host intercepts sandbox minute consent without browser JavaScript dialogs',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  const start=source.indexOf('if(TIME_REVIEW_OPERATIONS.includes(operation)){');
  const end=source.indexOf("if(operation==='knowledge.editorState')",start);
  assert(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/operation==='time\.minuteConsent'/);
  assert.match(block,/E_TIME_TRUSTED_CLICK/);
  assert.match(block,/tocSettingsOpen=true/);
  assert.doesNotMatch(block,/\.confirm\s*\(/);
  assert.match(source,/if\(\['time\.start','time\.clear','time\.minuteConsent','time\.siteGrant'\]\.includes\(operation\)&&event\?\.isTrusted!==true\)/);
  assert.match(source,/payload:operation==='time\.clear'\?\{confirm:true\}:operation==='time\.minuteConsent'/);
});
