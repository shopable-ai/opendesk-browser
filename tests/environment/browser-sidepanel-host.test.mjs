import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidePanelOpenCoordinator} from '../../src/platform/chrome/browser-side-panel.js';
const ref='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const host='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tool={toolId:'tool-a',hostInstanceId:host,windowId:15};
const clicked={type:'click',isTrusted:true}; // simulated only within this Node fixture
const code=x=>e=>e?.code===x;
function setup(){
 const called=[];let now=1000;let valid=true,current=true;
 const ui=createSidePanelOpenCoordinator({
  api:{sidePanel:{open:opts=>{called.push(opts);return Promise.resolve()}}},
  clock:{now:()=>now},createRef:()=>ref,isTrustedClick:evt=>evt===clicked,
  authorize:async()=>valid,isCurrent:()=>current
 });
 return {ui,called,expire:()=>now=20000,revoke:()=>valid=false,stale:()=>current=false};
}
test('trusted user click opens only the first-party extension Side Panel',async()=>{
 const a=setup(),queued=await a.ui.prepare(tool);
 assert.equal(queued.requestRef,ref);
 assert.deepEqual(await a.ui.confirm(ref,clicked),{opened:true});
 assert.deepEqual(a.called,[{windowId:15}]);
});
test('JSON event spoof cannot forge a native Chrome user activation',async()=>{
 const a=setup();await a.ui.prepare(tool);
 assert.throws(()=>a.ui.confirm(ref,{type:'click',isTrusted:true}),code('E_USER_GESTURE_REQUIRED'));
 assert.equal(a.called.length,0);
});
test('tokens are consumed once and expire in 15 seconds',async()=>{
 const a=setup();await a.ui.prepare(tool);
 await a.ui.confirm(ref,clicked);
 assert.throws(()=>a.ui.confirm(ref,clicked),code('E_LAUNCH_EXPIRED'));
 const b=setup();await b.ui.prepare(tool);b.expire();
 assert.throws(()=>b.ui.confirm(ref,clicked),code('E_LAUNCH_EXPIRED'));
});
test('disable and invalid install identity revoke pending actions',async()=>{
 const a=setup();await a.ui.prepare(tool);
 a.ui.revokeTool('tool-a');
 assert.throws(()=>a.ui.confirm(ref,clicked),code('E_LAUNCH_EXPIRED'));
 const b=setup();b.revoke();
 await assert.rejects(b.ui.prepare(tool),code('E_TOOL_CHANGED'));
 await assert.rejects(b.ui.prepare({...tool,windowId:-1}),code('E_SCHEMA'));
});

test('a tool disabled after preparation cannot spend a pending native click',async()=>{
 const a=setup();await a.ui.prepare(tool);a.stale();
 assert.throws(()=>a.ui.confirm(ref,clicked),code('E_TOOL_CHANGED'));
 assert.equal(a.called.length,0);
 assert.throws(()=>a.ui.confirm(ref,clicked),code('E_LAUNCH_EXPIRED'));
});
test('the coordinator refuses missing synchronous identity fencing',()=>{
 assert.throws(()=>createSidePanelOpenCoordinator({authorize:async()=>true}),code('E_CONTEXT'));
});
