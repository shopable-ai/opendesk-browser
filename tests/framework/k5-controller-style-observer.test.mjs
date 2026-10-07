import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../src/framework/control/value.js';
import {ORIGINAL_STYLE_CSS,captureStyleNode,readStyleNode,validateStyleDisposal} from './k5-controller-style-observer.mjs';
const selected={tabId:1,frameId:0,documentId:'unit-document',url:'http://127.0.0.1/style'},identity={runId:'unit-run',ownerEpoch:1},revision={sourceHash:'unit-source'};
const plan={aURL:selected.url,params:{nativeStyleBarrierURL:'http://127.0.0.1/barrier?token=unit-only'}};
function fixture(){
  const view={tag:'STYLE',text:ORIGINAL_STYLE_CSS,connected:true,documentURL:plan.aURL,color:'rgb(1, 2, 3)'},held={backendNodeId:12,objectId:'unit-remote-node',selected,view};
  return {selected,run:{runId:identity.runId,identity,retirementState:'released'},result:{revision},
    aBefore:{styles:{color:'rgb(0, 0, 0)',head:[]}},a:{styles:{color:'rgb(0, 0, 0)',head:[]}},
    style:{held,after:{backendNodeId:12,objectId:held.objectId,view:{...view,connected:false,color:'rgb(0, 0, 0)'}},heldAt:2,afterAt:4,objectReleased:true,
      barrier:{request:{at:1,method:'GET',url:'/barrier?token=unit-only'},release:{at:3},pendingOperation:{tag:'controller-operation',runId:identity.runId,state:'dispatched',
        envelope:{identity,revision,operation:{kind:'service',method:'AXIOS_GET',args:encodeValue([{url:plan.params.nativeStyleBarrierURL}])}}}}}};
}
test('disposal oracle requires the same actual node to disconnect and its document style to return to baseline',()=>{
  assert.deepEqual(validateStyleDisposal(plan,fixture()),{sameNodeRemoved:true,stylesRestored:true,observerHandleReleased:true});
  const changes=[o=>delete o.style,o=>o.style.held.backendNodeId=0,o=>o.style.after.backendNodeId=13,o=>o.style.after.objectId='foreign',
    o=>o.style.held.view.connected=false,o=>o.style.after.view.connected=true,o=>o.style.after.view.documentURL='http://foreign',
    o=>o.style.after.view.text='other style',o=>o.style.held.selected={...selected,documentId:'stale'},o=>o.style.objectReleased=false,
    o=>o.a.styles.head=[ORIGINAL_STYLE_CSS],o=>o.a.styles.color='rgb(1, 2, 3)',o=>o.aBefore.styles.head=['preexisting style'],
    o=>o.style.heldAt=4,o=>o.style.afterAt=2,o=>o.style.barrier.pendingOperation.runId='foreign',
    o=>o.style.barrier.pendingOperation.envelope.identity={...identity,ownerEpoch:2},o=>o.style.barrier.request.url='/foreign',
    o=>o.style.barrier.pendingOperation.envelope.operation.args=encodeValue([{url:'http://foreign'}]),o=>o.run.retirementState='pending'];
  for(const [index,change] of changes.entries()){const o=structuredClone(fixture());change(o);assert.throws(()=>validateStyleDisposal(plan,o),`invalid style evidence ${index}`);}
});
test('native node capture retains a CDP object identity and only reads node properties',async()=>{
  const calls=[],view=fixture().style.held.view,client={async send(method,args){calls.push([method,args]);
    return ({'DOM.getDocument':{root:{nodeId:1}},'DOM.querySelectorAll':{nodeIds:[2]},'DOM.describeNode':{node:{nodeName:'STYLE',backendNodeId:12}},
      'DOM.resolveNode':{object:{objectId:'unit-remote-node'}},'Runtime.callFunctionOn':{result:{value:view}}})[method];}};
  const handle=await captureStyleNode(client,selected);assert.deepEqual(handle,fixture().style.held);
  assert.deepEqual(await readStyleNode(client,handle),view);
  assert.deepEqual(calls.map(c=>c[0]),['DOM.getDocument','DOM.querySelectorAll','DOM.describeNode','DOM.resolveNode','Runtime.callFunctionOn','Runtime.callFunctionOn']);
  assert(calls.at(-1)[1].functionDeclaration.includes('this.isConnected'));assert.equal(calls.at(-1)[1].objectId,handle.objectId);
});
test('capture releases its retained node on observation failure and rejects ambiguous style identity',async()=>{
  for(const count of [0,2]){const client={async send(method){return method==='DOM.getDocument'?{root:{nodeId:1}}:{nodeIds:Array(count).fill(2)};}};
    await assert.rejects(captureStyleNode(client,selected),/exactly one/);}
  const released=[],client={async send(method,args){
    if(method==='Runtime.releaseObject'){released.push(args.objectId);return {};}
    return ({'DOM.getDocument':{root:{nodeId:1}},'DOM.querySelectorAll':{nodeIds:[2]},'DOM.describeNode':{node:{nodeName:'STYLE',backendNodeId:12}},
      'DOM.resolveNode':{object:{objectId:'unit-remote-node'}},'Runtime.callFunctionOn':{exceptionDetails:{text:'Document unavailable'}}})[method];}};
  await assert.rejects(captureStyleNode(client,selected),/observation failed/);assert.deepEqual(released,['unit-remote-node']);
});
