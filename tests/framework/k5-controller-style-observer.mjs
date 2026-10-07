import assert from 'node:assert/strict';
import {decodeValue} from '../../src/framework/control/value.js';
export const ORIGINAL_STYLE_CSS='#marker { color: rgb(1, 2, 3); }';
const viewFunction=`function(){return {tag:this.tagName,text:this.textContent,connected:this.isConnected,documentURL:this.ownerDocument.URL,color:getComputedStyle(this.ownerDocument.querySelector('#marker')).color};}`;
export async function captureStyleNode(client,selected) {
  const {root}=await client.send('DOM.getDocument',{depth:0});
  const {nodeIds}=await client.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'head style'});
  assert.equal(nodeIds.length,1,'Owned style fixture must contain exactly one inserted style');
  const {node}=await client.send('DOM.describeNode',{nodeId:nodeIds[0],depth:1});
  assert.equal(node.nodeName,'STYLE');assert(Number.isSafeInteger(node.backendNodeId));
  const {object}=await client.send('DOM.resolveNode',{backendNodeId:node.backendNodeId});
  assert(object.objectId,'Actual style node has no remote object identity');
  const handle={backendNodeId:node.backendNodeId,objectId:object.objectId,selected:structuredClone(selected)};
  try {return {...handle,view:await readStyleNode(client,handle)};}
  catch(error){await client.send('Runtime.releaseObject',{objectId:handle.objectId}).catch(()=>{});throw error;}
}
export async function readStyleNode(client,handle) {
  const result=await client.send('Runtime.callFunctionOn',{objectId:handle.objectId,functionDeclaration:viewFunction,returnByValue:true});
  assert.equal(result.exceptionDetails,undefined,'Read-only node observation failed');
  assert(result.result?.value,'Actual node observation returned no value');return result.result.value;
}
export function validateStyleDisposal(plan,observation) {
  const {style,aBefore,a,run,result,selected}=observation;
  assert(style?.held&&style?.after,'Actual held and post-retirement style observations are required');
  assert.deepEqual(aBefore.styles,{color:'rgb(0, 0, 0)',head:[]},'Original A style fixture changed');
  assert.deepEqual(a.styles,aBefore.styles,'Actual A styles did not return to their baseline');
  assert.deepEqual(style.held.selected,selected);
  assert(Number.isSafeInteger(style.held.backendNodeId)&&style.held.backendNodeId>0,'Actual backend node identity missing');
  assert.equal(typeof style.held.objectId,'string');assert(style.held.objectId);
  assert.equal(style.after.backendNodeId,style.held.backendNodeId);assert.equal(style.after.objectId,style.held.objectId);
  assert.deepEqual(style.held.view,{tag:'STYLE',text:ORIGINAL_STYLE_CSS,connected:true,documentURL:plan.aURL,color:'rgb(1, 2, 3)'});
  assert.deepEqual(style.after.view,{tag:'STYLE',text:ORIGINAL_STYLE_CSS,connected:false,documentURL:plan.aURL,color:aBefore.styles.color});
  assert.equal(style.objectReleased,true,'Observer must release its retained native node handle');
  const {barrier}=style,pending=barrier?.pendingOperation;
  assert.equal(pending?.tag,'controller-operation');assert.equal(pending.runId,run.runId);assert.equal(pending.state,'dispatched');
  assert.equal(pending.envelope.operation.kind,'service');assert.equal(pending.envelope.operation.method,'AXIOS_GET');
  assert.deepEqual(pending.envelope.revision,result.revision);assert.deepEqual(pending.envelope.identity,run.identity);
  assert.equal(decodeValue(pending.envelope.operation.args)[0].url,plan.params.nativeStyleBarrierURL);
  assert.equal(barrier.request.method,'GET');
  const url=new URL(plan.params.nativeStyleBarrierURL);assert.equal(barrier.request.url,url.pathname+url.search);
  assert(barrier.release.at>=barrier.request.at);
  assert(style.heldAt>=barrier.request.at&&style.heldAt<=barrier.release.at,'Style was not observed while the actual Worker was held');
  assert(style.afterAt>=barrier.release.at);assert.equal(run.retirementState,'released');
  return {sameNodeRemoved:true,stylesRestored:true,observerHandleReleased:true};
}
