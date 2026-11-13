import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {BUILTIN_TASK_RELEASES,REVIEWED_BUILTIN_TASK_RELEASES,assertPackagedTask} from '../../../src/platform/tasks/builtin-releases.js';

const path=new URL('../../../task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.0.opendesk-task.json',import.meta.url);
const sourcePath=new URL('../../../task-packs/chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.js',import.meta.url);
const pkg=JSON.parse(await readFile(path,'utf8')),source=await readFile(sourcePath,'utf8');
const execute=new Function('page','params',source+'\nreturn main()');
const uuid='10101010-2020-4030-8040-505050505050';
function harness({draft='',attachments=0,users=0,send=true,model,
  executeScript=execute,editorCount=1,modern=false,readbackMismatch=false,reply='{"sum":80}',completion=true,userId=true,clickError=false}={}){
  const state={url:'https://chatgpt.com/',draft,attachments,users,sendCalls:0,fillCalls:0,submitted:false,waits:0};
  const row=key=>({
    count:async()=>{
      if(key.startsWith('#prompt-textarea')){
        if(modern)assert.ok(key.includes('form[data-chatgpt-composer] [data-composer-markdown]'));
        return editorCount;
      }
      if(key.startsWith('form [data-attachment-id]'))return state.attachments;
      if(key.startsWith('[data-message-author-role="user"],'))return state.submitted?1:state.users;
      if(key.startsWith('[data-testid="stop-button"],'))return 0;
      if(key.startsWith('button[data-testid="send-button"]')){
        if(modern)assert.ok(key.includes('form[data-chatgpt-composer] button[type="submit"]'));
        return 1;
      }
      if(key==='[data-message-author-role="user"]')return state.submitted?1:state.users;
      if(key==='[data-message-author-role="assistant"]')return state.submitted?1:0;
      if(key.startsWith('[data-message-author-role="assistant"] [data-testid="message-content"]'))return state.submitted?1:0;
      if(key.startsWith('[data-testid="copy-turn-action-button"]'))return state.submitted&&completion?1:0;
      if(key.startsWith('[data-chatgpt-search-unit-key$=')||
        key.startsWith('[data-content-search-unit-key$='))return 0;
      throw Error('Unexpected native selector '+key);
    },
    isVisible:async()=>true,isEnabled:async()=>true,
    innerText:async()=>key.startsWith('#prompt-textarea')?
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
  return {state,run:()=>executeScript(page,args)};
}

test('new task is exact immutable 0.2.0, historical draft remains separate',async()=>{
  assert.equal(pkg.manifest.version,'0.2.0');
  assert.equal(await digestUtf8(source),pkg.manifest.program.sourceHash);
  assert.deepEqual(await verifyTaskPackage(pkg),pkg);
  await assertPackagedTask(pkg);
  const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.0');
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

const patchSource=await readFile(new URL('../../../task-packs/chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.1.js',import.meta.url),'utf8');
const patch=JSON.parse(await readFile(new URL('../../../task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.1.opendesk-task.json',import.meta.url),'utf8'));
const executePatch=new Function('page','params',patchSource+'\nreturn main()');
test('R11 modern composer patch is an explicit immutable 0.2.1, with the old 0.2.0 release preserved',async()=>{
  assert.equal(patch.manifest.version,'0.2.1');
  assert.equal(await digestUtf8(patchSource),patch.manifest.program.sourceHash);
  await assertPackagedTask(patch);assert.deepEqual(await verifyTaskPackage(patch),patch);
  assert.notEqual(patch.manifestHash,pkg.manifestHash);
  assert.equal(pkg.manifest.program.sourceHash,'90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c');
  assert.equal(BUILTIN_TASK_RELEASES.some(row=>row.taskId==='chatgpt.conversation.create'),false);
});
test('R11 current native composer empty paragraph prepares a draft or sends once with full readback',async()=>{
  for(const send of [false,true]){
    const h=harness({executeScript:executePatch,modern:true,draft:'\n',send});
    const result=await h.run();
    assert.equal(h.state.fillCalls,1);assert.equal(h.state.sendCalls,send?1:0);
    assert.equal(result.status,send?'reply-complete':'draft-prepared');
  }
});
test('R11 current composer rejects missing, ambiguous or existing draft before any native effect',async()=>{
  for(const input of [{editorCount:0},{editorCount:2},{draft:'existing draft'},{attachments:1},{readbackMismatch:true}]){
    const h=harness({executeScript:executePatch,modern:true,...input});
    await assert.rejects(h.run(),{code:/E_CHAT_/});assert.equal(h.state.sendCalls,0);
    if(input.editorCount!==undefined)assert.equal(h.state.fillCalls,0);
  }
  const h=harness({executeScript:executePatch,modern:true,clickError:true});
  await assert.rejects(h.run(),/ACK lost/);assert.equal(h.state.sendCalls,1);
});

const modernSource=await readFile(new URL('../../../task-packs/chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.2.js',import.meta.url),'utf8');
const executeModern=new Function('page','params',modernSource+'\nreturn main()');
const modernUserId='11111111-2222-4333-8444-555555555555';
const modernAssistantId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const modernReply='完整回答第一段。\n{"sum":80}\n最后一行，不应截断。';
function modernMessageHarness({completion=true,disappear=false,changingReply=false,multipleIds,clickError=false}={}){
  const {document}=parseHTML(`<html><body>
    <form data-chatgpt-composer><div data-composer-markdown contenteditable="true" role="textbox"></div>
      <button type="submit">Send</button></form>
    <main></main></body></html>`);
  const state={url:'https://chatgpt.com/',sendCalls:0,fillCalls:0,stableReads:0};
  const one=selector=>{
    const nodes=document.querySelectorAll(selector);
    assert.equal(nodes.length,1,'Locator requires exactly one match: '+selector);
    return nodes[0];
  };
  // Only existing public Locator methods; CSS matching uses the DOM rather
  // than selector-prefix stubs. There are no legacy message/action attributes.
  const page={
    url:async()=>state.url,
    locator:selector=>({
      count:async()=>document.querySelectorAll(selector).length,
      isVisible:async()=>Boolean(one(selector)),
      isEnabled:async()=>!one(selector).hasAttribute('disabled'),
      innerText:async()=>one(selector).innerText,
      getAttribute:async name=>one(selector).getAttribute(name),
      fill:async value=>{one(selector).textContent=value;state.fillCalls++;},
      click:async()=>{
        assert.equal(one(selector).tagName,'BUTTON');
        state.sendCalls++;
        const main=document.querySelector('main');
        main.innerHTML=`<article data-talvt-turn-state="${completion?'complete':'streaming'}">
          <div data-chatgpt-search-unit-key="turn:user" data-chatgpt-search-message-ids="${modernUserId}"></div>
          <div data-content-search-unit-key="turn:assistant" data-chatgpt-search-message-ids="${modernAssistantId} ${modernAssistantId}">
            <div data-markdown-text-style="assistant-message"></div><aside>Not reply text</aside>
          </div></article>`;
        main.querySelector('[data-chatgpt-search-unit-key]').textContent=document.querySelector('[data-composer-markdown]').textContent;
        const body=main.querySelector('[data-markdown-text-style]');
        for(const text of modernReply.split('\n')){
          const paragraph=document.createElement('p');
          paragraph.textContent=text;body.append(paragraph);
        }
        if(multipleIds){
          const message=main.querySelector(multipleIds==='user'?'[data-chatgpt-search-unit-key]':'[data-content-search-unit-key]');
          message.setAttribute('data-chatgpt-search-message-ids',modernUserId+' '+modernAssistantId);
        }
        state.url='https://chatgpt.com/c/'+uuid;
        if(clickError)throw Error('ACK lost');
      }
    }),
    waitForTimeout:async ms=>{
      if(ms!==1100)return;
      state.stableReads++;
      if(disappear)document.querySelector('article').removeAttribute('data-talvt-turn-state');
      if(changingReply)document.querySelector('[data-markdown-text-style]').textContent=modernReply+' '+state.stableReads;
    }
  };
  return {state,document,run:()=>executeModern(page,{prompt:'Task 01 compute 17 28 35',send:true})};
}
test('R11 modern message DOM returns full body and actual UUIDs after stable completion with one send',async()=>{
  const h=modernMessageHarness(),result=await h.run();
  assert.equal(result.status,'reply-complete');
  assert.equal(result.messageConfirmed,true);
  assert.equal(result.conversationId,uuid);
  assert.equal(result.conversationUrl,'https://chatgpt.com/c/'+uuid);
  assert.equal(result.userMessageRef,modernUserId);
  assert.equal(result.assistantMessageRef,modernAssistantId);
  assert.equal(result.replyText,modernReply);
  assert.equal(h.state.fillCalls,1);assert.equal(h.state.sendCalls,1);
  assert.equal(h.state.stableReads,1);
  assert.equal(h.document.querySelectorAll('[data-message-author-role],[data-message-id],[data-testid="copy-turn-action-button"],[data-assistant-message-actions]').length,0);
});
test('R11 modern message DOM never succeeds without completion or if completion disappears before stable reread',async()=>{
  for(const options of [{completion:false},{disappear:true}]){
    const h=modernMessageHarness(options);
    await assert.rejects(h.run(),{code:'E_CHAT_REPLY_UNKNOWN'});
    assert.equal(h.state.sendCalls,1);
    assert.equal(h.state.stableReads,options.disappear?1:0);
  }
});
test('R11 modern message DOM rejects a reply that keeps changing during stable reread',async()=>{
  const h=modernMessageHarness({changingReply:true});
  await assert.rejects(h.run(),{code:'E_CHAT_REPLY_UNKNOWN'});
  assert.equal(h.state.sendCalls,1);assert.ok(h.state.stableReads>1);
});
test('R11 modern message DOM rejects multiple distinct official IDs for either role',async()=>{
  for(const multipleIds of ['user','assistant']){
    const h=modernMessageHarness({multipleIds});
    await assert.rejects(h.run(),{code:'E_CHAT_MESSAGE_ID'});
    assert.equal(h.state.sendCalls,1);assert.equal(h.state.stableReads,0);
  }
});
test('R11 modern message DOM never retries send after a lost ACK',async()=>{
  const h=modernMessageHarness({clickError:true});
  await assert.rejects(h.run(),/ACK lost/);
  assert.equal(h.state.sendCalls,1);assert.equal(h.state.stableReads,0);
});
