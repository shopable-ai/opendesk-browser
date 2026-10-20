import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the driver's CDP identity boundary without launching its native main().
const driver=await readFile(new URL('../framework/browser-managed-proxy-installed-c1.mjs',import.meta.url),'utf8');
const frameSource=driver.slice(driver.indexOf('function frameFromTree('),driver.indexOf('async function toolResult('));
function parentFrameHarness(actualId){
  const calls=[];
  const client={async send(method,params,session){
    calls.push({method,params,session});
    assert.equal(session,'current-panel');
    switch(method){
      case 'DOM.getDocument':return {root:{nodeId:1}};
      case 'DOM.querySelector':return {nodeId:2};
      case 'DOM.describeNode':return {node:{frameId:'current-tool'}};
      case 'Page.getFrameTree':return {frameTree:{frame:{id:'panel',url:'chrome-extension://installed/sidepanel.html'},
        childFrames:[{frame:{id:actualId,url:'chrome-extension://installed/sidebar-tools/sandbox.html'}}]}};
      case 'Page.createIsolatedWorld':return {executionContextId:7};
      default:throw Error('Unexpected CDP command '+method);
    }
  }};
  const toolFrame=vm.runInNewContext(frameSource+'\ntoolFrame',{
    assert,client,evalAt:async()=>true
  });
  return {toolFrame,calls};
}

test('C1 refuses a matching sandbox URL belonging to another DOM frame before creating a world',async()=>{
  const {toolFrame,calls}=parentFrameHarness('another-tool');
  await assert.rejects(toolFrame('current-panel'),/frame tree must match the current host iframe/);
  assert.equal(calls.some(call=>call.method==='Page.createIsolatedWorld'),false);
});

test('C1 parent-frame evidence records the frame actually resolved in the same Side Panel',async()=>{
  const {toolFrame,calls}=parentFrameHarness('current-tool');
  const frame=await toolFrame('current-panel');
  assert.equal(frame.frameId,'current-tool');
  assert.equal(frame.expectedFrameId,'current-tool');
  assert.equal(frame.hostSession,'current-panel');
  assert.equal(frame.session,'current-panel');
  assert.equal(frame.contextId,7);
  assert.equal(calls.find(call=>call.method==='Page.createIsolatedWorld').params.frameId,'current-tool');
});
