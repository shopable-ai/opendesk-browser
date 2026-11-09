import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tool,pagePackage} from './fixtures/legacy-installation.mjs';
import {SEND_QUEUE_PIN,admitsPinnedQueueTool,admitsPinnedQueuePage}
  from '../../../src/platform/host/send-queue-admission.js';
const app={id:'ai-send-queue',version:SEND_QUEUE_PIN.toolVersion,uiRuntime:'opendesk.react-ui.v1',capabilities:['currentPage.read']};
const page={programId:'opendesk.ai-send-queue',revision:SEND_QUEUE_PIN.pageRevision,sourceHash:SEND_QUEUE_PIN.pageSourceHash,
  pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],world:'USER_SCRIPT',
    runAt:'document_idle',allFrames:false}};
test('only the exact built React package may request queue control',()=>{
  assert.equal(admitsPinnedQueueTool(app,SEND_QUEUE_PIN.toolPackageSha256),true);
  for(const [name,tool,sha] of [
    ['spurious code same ID',app,'0'.repeat(64)],
    ['different version',{...app,version:'999.0.0'},SEND_QUEUE_PIN.toolPackageSha256],
    ['extra capability',{...app,capabilities:['currentPage.read','storage.local']},SEND_QUEUE_PIN.toolPackageSha256],
    ['wrong framework',{...app,uiRuntime:undefined},SEND_QUEUE_PIN.toolPackageSha256],
    ['wrong ID',{...app,id:'other'},SEND_QUEUE_PIN.toolPackageSha256]
  ])assert.equal(admitsPinnedQueueTool(tool,sha),false,name);
});
test('Page source and site grant remain exact and never trust an expanded same-ID script',()=>{
  assert.equal(admitsPinnedQueuePage(page),true);
  for(const bad of [
    {...page,revision:11},
    {...page,revision:12},
    {...page,sourceHash:'0'.repeat(64)},
    {...page,pageRules:{...page.pageRules,matches:['https://chatgpt.com/*','https://example.com/*']}},
    {...page,pageRules:{...page.pageRules,world:'MAIN'}},
    {...page,pageRules:{...page.pageRules,allFrames:true}}
  ])assert.equal(admitsPinnedQueuePage(bad),false);
});

test('historical fixtures retain the original exact admission without repinning the composite release',()=>{
  const bytes=Buffer.from(JSON.stringify(tool,null,2)+'\n');
  assert.equal(admitsPinnedQueueTool(tool,createHash('sha256').update(bytes).digest('hex')),true);
  assert.equal(admitsPinnedQueuePage(pagePackage),true);
});
