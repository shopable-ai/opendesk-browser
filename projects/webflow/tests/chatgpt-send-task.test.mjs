import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {BUILTIN_TASK_RELEASES,assertPackagedTask} from '../../../src/platform/tasks/builtin-releases.js';

const path=new URL('../tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json',import.meta.url);
const sourcePath=new URL('../src/tasks/chatgpt-conversation-create-v0.2.js',import.meta.url);
const pkg=JSON.parse(await readFile(path,'utf8')),source=await readFile(sourcePath,'utf8');
const execute=new Function('page','params',source+'\nreturn main()');
const uuid='10101010-2020-4030-8040-505050505050';
function harness({draft='',attachments=0,users=0,send=true,model,
  readbackMismatch=false,reply='{"sum":80}',completion=true,userId=true,clickError=false}={}){
  const state={url:'https://chatgpt.com/',draft,attachments,users,sendCalls:0,fillCalls:0,submitted:false,waits:0};
  const row=key=>({
    count:async()=>{
      if(key==='#prompt-textarea')return 1;
      if(key.startsWith('form [data-attachment-id]'))return state.attachments;
      if(key.startsWith('[data-message-author-role="user"],'))return state.submitted?1:state.users;
      if(key.startsWith('[data-testid="stop-button"],'))return 0;
      if(key.startsWith('button[data-testid="send-button"]'))return 1;
      if(key==='[data-message-author-role="user"]')return state.submitted?1:state.users;
      if(key==='[data-message-author-role="assistant"]')return state.submitted?1:0;
      if(key.startsWith('[data-message-author-role="assistant"] [data-testid="message-content"]'))return state.submitted?1:0;
      if(key.startsWith('[data-testid="copy-turn-action-button"]'))return state.submitted&&completion?1:0;
      if(key.startsWith('[data-chatgpt-search-unit-key$=')||
        key.startsWith('[data-content-search-unit-key$='))return 0;
      throw Error('Unexpected native selector '+key);
    },
    isVisible:async()=>true,isEnabled:async()=>true,
    innerText:async()=>key==='#prompt-textarea'?
      (readbackMismatch&&state.fillCalls?'unexpected':state.draft):
      key==='[data-message-author-role="user"]'?state.draft:key.includes('assistant')?reply:'',
    fill:async value=>{state.fillCalls++;state.draft=value;},
    click:async()=>{state.sendCalls++;state.submitted=true;
      state.url='https://chatgpt.com/c/'+uuid;if(clickError)throw Error('ACK lost');},
    getAttribute:async name=>key==='[data-message-author-role="user"]'?
      (name==='data-message-id'&&userId?'user-msg-0001':null):
      key==='[data-message-author-role="assistant"]'&&name==='data-message-id'?'assistant-msg-0001':null
  });
  const page={url:async()=>state.url,locator:row,waitForTimeout:async()=>{state.waits++;}};
  const args={prompt:'Task 01 compute 17 28 35',send,...(model?{model}:{})};
  return {state,run:()=>execute(page,args)};
}

test('new task is exact immutable 0.2.0, historical draft remains separate',async()=>{
  assert.equal(pkg.manifest.version,'0.2.0');
  assert.equal(await digestUtf8(source),pkg.manifest.program.sourceHash);
  assert.deepEqual(await verifyTaskPackage(pkg),pkg);
  await assertPackagedTask(pkg);
  const pin=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create');
  assert.equal(pin?.version,'0.2.0');
  assert.equal(pin?.manifestHash,pkg.manifestHash);
  assert.equal(pin?.sourceHash,pkg.manifest.program.sourceHash);
  assert.deepEqual(validateTaskParams(pkg.manifest.paramsSchema,{prompt:'Hello B'}),
    {prompt:'Hello B',send:false});
  assert.equal(validateTaskParams(pkg.manifest.paramsSchema,{prompt:'Hello B',send:true}).send,true);
  assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{prompt:'Hello B',send:'true'}),{code:'E_PARAMS'});
});
test('draft remains unsent, without fabricated conversation identity',async()=>{
  const h=harness({send:false}),r=await h.run();
  assert.equal(r.status,'draft-prepared');assert.equal(r.conversationId,null);
  assert.equal(h.state.sendCalls,0);assert.equal(h.state.fillCalls,1);
});
test('exactly one native click yields observed reply and real URL/message references',async()=>{
  const h=harness(),r=await h.run();
  assert.equal(r.status,'reply-complete');
  assert.equal(r.conversationId,uuid);
  assert.equal(r.conversationUrl,'https://chatgpt.com/c/'+uuid);
  assert.equal(r.userMessageRef,'user-msg-0001');
  assert.equal(r.assistantMessageRef,'assistant-msg-0001');
  assert.equal(r.replyText,'{"sum":80}');
  assert.equal(h.state.sendCalls,1);
});
test('existing draft, attachments, changed readback and model request never click',async()=>{
  for(const input of [{draft:'existing user draft'},{attachments:1},{readbackMismatch:true},{model:'GPT-6'}]){
    const h=harness(input);await assert.rejects(h.run(),{code:/E_CHAT_/});
    assert.equal(h.state.sendCalls,0,JSON.stringify(input));
  }
});
test('missing message ID and unconfirmed reply never report success or retry click',async()=>{
  for(const input of [{userId:false},{completion:false}]){
    const h=harness(input);
    await assert.rejects(h.run(),{code:/E_CHAT_/});
    assert.equal(h.state.sendCalls,1);
  }
});
test('lost native click acknowledgement is never retried',async()=>{
  const h=harness({clickError:true});
  await assert.rejects(h.run(),/ACK lost/);
  assert.equal(h.state.sendCalls,1);
});
