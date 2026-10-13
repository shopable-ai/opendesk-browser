import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTimeReviewPermissionControls} from '../../src/time-review/host-controls.js';
import {makeTimeReviewDOM} from './time-review-host-controls-fixture.mjs';

const find=(root,id)=>{
  if(root.id===id)return root;
  for(const child of root.children){const match=find(child,id);if(match)return match;}
  return null;
};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('R5.1 Time Review requires a trusted host click, not a sandbox modal',async()=>{
  const {root,doc}=makeTimeReviewDOM(),notices=[],actions=[],permissions=[];
  const api={permissions:{
    request:({permissions:items})=>{permissions.push(items);return Promise.resolve(true);},
    remove:({permissions:items})=>{permissions.push(['remove',...items]);return Promise.resolve(true);}
  }};
  const controls=createTimeReviewPermissionControls({api,doc,
    container:root,notice:(message,error)=>notices.push({message,error}),
    runOperation:async(operation,payload)=>{actions.push({operation,payload});return {ok:true};}});
  controls.render({id:'time-review',capabilities:['time.review']});
  const start=find(root,'time-review-trusted-start'),clear=find(root,'time-review-clear-open');
  const confirm=find(root,'time-review-clear-approve'),cancel=find(root,'time-review-clear-cancel');
  assert(start&&clear&&confirm&&cancel);
  start.emit('click',false);await settle();
  assert.equal(actions.length,0,'programmatically forged input cannot authorize background monitoring');
  start.emit('click',true);await settle();
  assert.deepEqual(actions,[{operation:'time.start',payload:{}}]);
  assert.equal(permissions.length,0,'starting must not silently request Chrome permissions');
  clear.emit('click',true);
  assert.equal(find(root,'time-review-inline-clear-review').hidden,false);
  assert.equal(actions.length,1,'opening an inline review does not clear data');
  cancel.emit('click',true);
  assert.equal(find(root,'time-review-inline-clear-review').hidden,true);
  assert.equal(actions.length,1,'cancel retains data');
  clear.emit('click',true);confirm.emit('click',false);await settle();
  assert.equal(actions.length,1,'synthetic clear confirmation is ignored');
  confirm.emit('click',true);await settle();
  assert.deepEqual(actions[1],{operation:'time.clear',payload:{confirm:true}});
  controls.render({id:'another-tool',capabilities:['time.review']});
  assert.equal(root.children[0].hidden,true,'controls are hidden outside the correct tool identity');
  assert.equal(notices.filter(row=>row.error).length,1,'only the forbidden synthetic start is reported');
});

test('R5.1 idle permission requests originate only from a real trusted host click',async()=>{
  const {root,doc}=makeTimeReviewDOM(),calls=[];
  const controls=createTimeReviewPermissionControls({api:{permissions:{
    request:()=>{calls.push('request');return Promise.resolve(true);},
    remove:()=>{calls.push('remove');return Promise.resolve(true);}
  }},doc,container:root,
    notice:()=>{},runOperation:async()=>{}});
  controls.render({id:'time-review',capabilities:['time.review']});
  const grant=find(root,'time-review-grant-idle');
  grant.emit('click',false);await settle();
  assert.deepEqual(calls,[]);
  grant.emit('click',true);await settle();
  assert.deepEqual(calls,['request']);
});

test('R5.1 sandbox cannot directly start background tracking or delete history',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  const from=source.indexOf('if(TIME_REVIEW_OPERATIONS.includes(operation)){');
  const to=source.indexOf("if(operation==='knowledge.editorState')",from);
  assert(from>0&&to>from);
  const block=source.slice(from,to);
  assert.doesNotMatch(block,/\b(?:window|globalThis|self)\.confirm\s*\(/);
  assert.match(block,/E_TIME_TRUSTED_CLICK/);
  assert.match(block,/tocSettingsOpen=true/);
  assert.match(source,/runTrustedTimeReviewOperation/);
});

test('R1.5.1 sandbox start stays inline until genuine trusted Host confirmation',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  const start=source.indexOf('if(TIME_REVIEW_OPERATIONS.includes(operation)){');
  const end=source.indexOf("if(operation==='knowledge.editorState')",start);
  const block=source.slice(start,end);
  assert.match(block,/if\(operation==='time\.start'\)\{/);
  assert.match(block,/requestBrowserClick\(\{/);
  assert.match(block,/runTrustedTimeReviewOperation\('time\.start',\{\},event\)/);
  assert.match(block,/assertSession\(source,token\)/);
  const index=await readFile('examples/sidebar-tools/time-review/src/index.html','utf8');
  const header=index.slice(index.indexOf('<header class="review-top">'),index.indexOf('</header>'));
  assert.match(header,/id="start"/);
  assert.match(header,/id="pause"/);
  assert.match(header,/aria-label="暂停记录"/);
  assert.equal((index.match(/id="start"/g)||[]).length,1);
  assert.equal((index.match(/id="pause"/g)||[]).length,1);
  assert.doesNotMatch(index,/<span class="eyebrow">时间回顾<\/span>/);
});
