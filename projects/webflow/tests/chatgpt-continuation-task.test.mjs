import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourcePath=new URL('../src/tasks/chatgpt-conversation-create-v0.3.js',import.meta.url);
const source=await readFile(sourcePath,'utf8');
const execute=new Function('page','params',source+'\nreturn main()');
const uuid='10101010-2020-4030-8040-505050505050';
function harness({draft=undefined,attachments=0,users=0,send=true,model,
  readbackMismatch=false,reply='{"sum":80}',completion=true,userId=true,clickError=false}={}){
  const state={url:'https://chatgpt.com/',draft:draft??(send?'Task 01 compute 17 28 35':''),attachments,users,sendCalls:0,fillCalls:0,submitted:false,waits:0};
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
  const args={prompt:'Task 01 compute 17 28 35',phase:send?'submit':'prepare',
    ...(send?{prepareRunId:'run-original-0001',prepareRequestId:'request-original-0001'}:{}),...(model?{model}:{})};
  return {state,run:()=>execute(page,args)};
}

test('0.3 PREPARE remains unsent without a fake B URL',async()=>{
  const h=harness({send:false}),r=await h.run();
  assert.equal(r.status,'draft-prepared');assert.equal(r.conversationId,null);
  assert.equal(h.state.sendCalls,0);assert.equal(h.state.fillCalls,1);
});
test('0.3 SUBMIT never refills the original B draft',async()=>{
  const h=harness(),r=await h.run();
  assert.equal(r.status,'reply-complete');
  assert.equal(r.conversationId,uuid);
  assert.equal(r.conversationUrl,'https://chatgpt.com/c/'+uuid);
  assert.equal(r.userMessageRef,'user-msg-0001');
  assert.equal(r.assistantMessageRef,'assistant-msg-0001');
  assert.equal(r.replyText,'{"sum":80}');
  assert.equal(h.state.sendCalls,1);
  assert.equal(h.state.fillCalls,0);
});
test('existing draft, attachments, changed readback and model request never click',async()=>{
  for(const input of [{draft:'existing user draft'},{attachments:1},{draft:''},{model:'GPT-6'}]){
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

test('0.3 PREPARE never overwrites an existing draft',async()=>{
  const h=harness({send:false,draft:'someone else draft'});
  await assert.rejects(h.run(),{code:'E_CHAT_CREATE_DRAFT'});
  assert.equal(h.state.fillCalls,0);assert.equal(h.state.sendCalls,0);
});
