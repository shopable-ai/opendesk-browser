import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {BUILTIN_TASK_RELEASES,assertPackagedTask,REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';

const path=new URL('../../../task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.v1.opendesk-task.json',import.meta.url);
const sourcePath=new URL('../../../task-packs/chatgpt.conversation.create/src/chatgpt-conversation-create.js',import.meta.url);
const pkg=JSON.parse(await readFile(path,'utf8'));
const source=await readFile(sourcePath,'utf8');
const runSource=new Function('page','params',source+'\nreturn main();');

function harness({url='https://chatgpt.com/',draft='',attachments=0,users=0,stop=0,
  inputCount=1,visible=true,readback}={}){
  const state={url,content:draft,fillCalls:0,selectors:[],params:null};
  const editor={
    count:async()=>inputCount,isVisible:async()=>visible,
    innerText:async()=>readback===undefined||state.fillCalls===0?state.content:readback,
    fill:async value=>{state.fillCalls++;state.content=value;}
  };
  const page={url:async()=>state.url,locator(selector){
    state.selectors.push(selector);
    if(selector==='#prompt-textarea')return editor;
    if(selector.startsWith('form [data-attachment-id]'))return {count:async()=>attachments};
    if(selector==='[data-message-author-role="user"]')return {count:async()=>users};
    if(selector.startsWith('form [data-testid="stop-button"]'))return {count:async()=>stop};
    throw Error('Unexpected page read: '+selector);
  }};
  return {state,page,run:params=>runSource(page,params)};
}

test('ChatGPT reviewed task package and human-readable source share an exact immutable hash',async()=>{
  assert.equal(await digestUtf8(source),pkg.manifest.program.sourceHash);
  assert.deepEqual(await verifyTaskPackage(pkg),pkg);
  assert.equal(pkg.manifest.targetDisposition,'retain-on-success');
  // Version 0.1.0 is still an immutable, verifiable historical release.
  // The 0.2.0 package is still restorable, but new users must explicitly install ChatGPT.
  await assertPackagedTask(pkg);
  assert.equal(BUILTIN_TASK_RELEASES.some(row=>row.taskId===pkg.manifest.taskId),false);
  assert.ok(REVIEWED_BUILTIN_TASK_RELEASES.some(row=>row.taskId===pkg.manifest.taskId&&
    row.version==='0.1.0'&&row.manifestHash===pkg.manifestHash&&
    row.sourceHash===pkg.manifest.program.sourceHash));
  assert.deepEqual(validateTaskParams(pkg.manifest.paramsSchema,{prompt:'Hello B'}),
    {prompt:'Hello B',send:false});
  assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{prompt:'Hello B',send:true}),{code:'E_PARAMS'});
});

test('first slice prepares an exact unsent native draft with no manufactured conversation URL',async()=>{
  const h=harness(),out=await h.run({prompt:'Hello B',send:false});
  assert.equal(h.state.fillCalls,1);
  assert.equal(h.state.content,'Hello B');
  assert.equal(out.kind,'chatgpt.conversation.create.result');
  assert.equal(out.status,'draft-prepared');
  assert.equal(out.messageConfirmed,false);
  assert.equal(out.readbackConfirmed,true);
  assert.equal(out.conversationUrl,null);
  assert.equal(out.conversationId,null);
  assert.equal(out.send,false);
});

test('send, unverified model, nonempty drafts, attachments and nonblank chat fail before editing',async()=>{
  for(const [params,options] of [
    [{prompt:'secret',send:true},{}],
    [{prompt:'secret',send:false,model:'GPT-6'},{}],
    [{prompt:'secret',send:false,effort:'High'},{}],
    [{prompt:'secret',send:false,thinking:true},{}],
    [{prompt:'secret',send:false},{draft:'existing user draft'}],
    [{prompt:'secret',send:false},{attachments:1}],
    [{prompt:'secret',send:false},{users:1}],
    [{prompt:'secret',send:false},{stop:1}],
    [{prompt:'secret',send:false},{url:'https://chatgpt.com/c/old-chat'}]
  ]){
    const h=harness(options);
    await assert.rejects(h.run(params),{code:/E_CHAT_.+/});
    assert.equal(h.state.fillCalls,0,JSON.stringify(params));
  }
});

test('readback mismatch never retries fill or claims a created conversation',async()=>{
  const h=harness({readback:'unexpected'});
  await assert.rejects(h.run({prompt:'real prompt',send:false}),{code:'E_CHAT_CREATE_READBACK'});
  assert.equal(h.state.fillCalls,1);
});
