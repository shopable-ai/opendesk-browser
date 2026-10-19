import test from 'node:test';
import assert from 'node:assert/strict';
import {isToolSender,resolveToolSender} from '../../src/environment.js';
import {requireCloudRunnerSender} from '../../src/platform/host/cloud-observer.js';

const url='chrome-extension://trusted/cloud-control/runner.html';
function fixture(){
  const context={contextType:'OFFSCREEN_DOCUMENT',documentUrl:url,documentId:'original-doc',frameId:0,incognito:false};
  const api={runtime:{id:'trusted',getURL:path=>'chrome-extension://trusted/'+path,
    getContexts:async()=>[context]}};
  return {context,api,sender:{id:'trusted',url,documentId:'original-doc',frameId:0}};
}

test('Runner sender must be a live Chrome OFFSCREEN_DOCUMENT, never a tab',async()=>{
  const {api,sender,context}=fixture();
  assert.equal(isToolSender(api,sender),true);
  await requireCloudRunnerSender(api,sender);
  await requireCloudRunnerSender(api,{...sender,frameId:undefined});
  await assert.rejects(requireCloudRunnerSender(api,{...sender,tab:{id:3}}),{code:'E_OWNER'});
  await assert.rejects(requireCloudRunnerSender(api,{...sender,documentId:'forged'}),{code:'E_OWNER'});
  assert.equal(isToolSender(api,{...sender,url:url+'?fake=1'}),false);
});

test('missing offscreen documentId is recovered from one actual native context',async()=>{
  const {api,sender}=fixture();
  const recovered=await resolveToolSender(api,{...sender,documentId:undefined});
  assert.equal(recovered.documentId,'original-doc');
  const apiMissing={runtime:{...api.runtime,getContexts:async()=>[]}};
  await assert.rejects(resolveToolSender(apiMissing,{...sender,documentId:undefined}),{code:'E_OWNER'});
});
