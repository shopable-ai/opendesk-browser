import test from 'node:test';
import assert from 'node:assert/strict';
import {composeExtensionEntries,filterExtensionEntries}
  from '../../../../src/ui/extension-center-model.js';
import {SEND_QUEUE_PIN} from '../../../../src/platform/host/send-queue-admission.js';
const tool={id:SEND_QUEUE_PIN.toolId,version:SEND_QUEUE_PIN.toolVersion,uiRuntime:'opendesk.react-ui.v1',title:'AI 消息发送队列',
  description:'管理已安装的网页队列',capabilities:['currentPage.read']};
const page={programId:SEND_QUEUE_PIN.pageProgramId,revision:13,title:'AI 消息发送队列',
  manifestHash:'manifest',sourceHash:SEND_QUEUE_PIN.pageSourceHash,
  enabled:true,nativeState:'registered',authorization:{status:'active'},
  pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],world:'USER_SCRIPT',
    runAt:'document_idle',allFrames:false}};
const rows=({hash=SEND_QUEUE_PIN.toolPackageSha256,pages=[page]}={})=>
 composeExtensionEntries({installed:[tool],pages,queueToolHash:hash});
test('one verified product in default list, Page is still accessible through Page filter',()=>{
  const entries=rows();
  assert.equal(entries.length,2);
  assert.equal(entries.find(x=>x.kind==='app')?.pageCompanion?.state,'registered');
  assert.equal(filterExtensionEntries(entries,{kind:'all'}).length,1);
  assert.equal(filterExtensionEntries(entries,{kind:'page'}).length,1);
});
test('same-ID untrusted Tool cannot hide independent Page management',()=>{
  const entries=rows({hash:'0'.repeat(64)});
  assert.equal(entries.find(x=>x.kind==='app')?.pageCompanion,undefined);
  assert.equal(filterExtensionEntries(entries,{kind:'all'}).length,2);
});
test('missing Page and r11 Page never become ready',()=>{
  assert.equal(rows({pages:[]})[0].pageCompanion.state,'missing');
  assert.equal(rows({pages:[{...page,revision:11}]})[0].pageCompanion.state,'version-mismatch');
});
test('revoked or disabled Page remains non-ready under one product',()=>{
  assert.equal(rows({pages:[{...page,authorization:{status:'suspended'}}]})[0].pageCompanion.state,'restricted');
  assert.equal(rows({pages:[{...page,enabled:false}]})[0].pageCompanion.state,'disabled');
});
