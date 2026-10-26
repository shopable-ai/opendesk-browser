import test from 'node:test';
import assert from 'node:assert/strict';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {prepareChatGPTBridgeDraft,isChatGPTBridgeContinuation,initChatGPTFixedBridgePage}
  from '../../src/native-agent/chatgpt-fixed-bridge-page.js';

const adapter='src/native-agent/chatgpt-bridge-site.js';
const target='agents/chatgpt-fixed-bridge.js';
const bundle=(fileName,path)=>({fileName,modules:{[path]:{renderedLength:1,originalLength:1}}});

// Component semantics only: no website, human gesture or native-run claim.
test('Host denial precedes result bytes; later denial keeps the marked draft without clicks or retries',async()=>{
  for(const [afterFill,permissionReply,forgedMarker=false,takeover=false] of [[false,{ok:false,error:{code:'E_BRIDGE_REVOKED',message:'revoked'}}],
    [false,{ok:true,data:{allowed:false}}],
    [false,{ok:true,data:{allowed:false}},true],[true,{ok:true,data:{allowed:false}}],
    [true,{ok:true,data:{allowed:true}},false,true]]){
    const elements=[];
    const element=tag=>{
      const node={tag,style:{},classList:{toggle(){}},listeners:{},
        setAttribute(){},append(){},remove(){},
        attachShadow(){return element('shadow');},
        addEventListener(type,listener){this.listeners[type]=listener;}};
      elements.push(node);return node;
    };
    const listeners=new Map();
    const doc={getElementById:()=>null,createElement:element,body:element('body'),
      addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
    const url='https://chatgpt.com/c/test-12345678';
    const win={location:{href:url,origin:'https://chatgpt.com'},setInterval:()=>1,
      clearInterval(){},addEventListener(){},removeEventListener(){}};win.top=win;
    const requestId='11111111-1111-4111-8111-111111111111';
    const request={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
      version:1,requestId,taskId:'page.read.fixed',args:{}};
    const editor={ownerDocument:doc,focus(){doc.activeElement=editor;}};
    const attrs=new Map(forgedMarker?[['data-opendesk-composer-owner','chatgpt-fixed-bridge']]:[]);
    const form={hasAttribute:key=>attrs.has(key),getAttribute:key=>attrs.get(key),
      setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
    const snapshot={ok:true,route:'c/test-12345678',form,editor,idle:true,busy:false,
      rich:false,draft:'',answerComplete:true,users:[{textContent:requestId}],assistants:[{}]};
    let writes=0,clicks=0,checks=0,onMessage,deliveryReply;
    const site={inspect:()=>({...snapshot}),prepare(text){writes++;snapshot.draft=text;return {ok:true,token:{before:{}}};},
      commit(){clicks++;return {ok:true};}};
    const done=Promise.withResolvers();
    const sender={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=test-host'};
    const deliver={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'deliver',requestId,
      sourceUrl:url,mode:'manual',turnKey:'turn-1',answerKey:'answer-1',
      runId:'run-1',resultId:'result-1',text:'private result bytes'};
    const receive=()=>new Promise(resolve=>assert.equal(onMessage(deliver,sender,resolve),true));
    const api={runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',onMessage:{
      addListener(listener){onMessage=listener;},removeListener(){}},async sendMessage(message){
      if(message.kind==='prepare')return {ok:true,data:{requestId,source:{url}}};
      if(message.kind==='authorize')return {ok:true,data:{}};
      if(message.kind==='check-delivery'){
        checks++;
        if(afterFill && checks===1)return {ok:true,data:{allowed:true}};
        if(afterFill)assert.equal(attrs.get('data-opendesk-composer-owner'),'chatgpt-fixed-bridge');
        if(takeover){
          listeners.get('compositionstart')({isTrusted:true,target:editor});
          snapshot.draft='用户接管';
          listeners.get('input')({isTrusted:true,target:editor,inputType:'insertCompositionText',isComposing:true,data:'用户接管'});
          listeners.get('compositionend')({isTrusted:true,target:editor,data:'用户接管'});
          snapshot.draft=deliver.text; // restoring identical bytes must not restore the old delivery
        }
        return permissionReply;
      }
      if(message.kind==='execute'){
        deliveryReply=await receive();done.resolve();return deliveryReply;
      }
      throw Error('Unexpected bridge operation');
    }}};
    const bridge=initChatGPTFixedBridgePage({api,doc,win,site,
      readPage:()=>({ok:true,turnKey:'turn-1',answerKey:'answer-1',blocks:[JSON.stringify(request)]})});
    const buttons=elements.filter(node=>node.tag==='button');
    await buttons[0].listeners.click({isTrusted:true});
    assert.equal(writes,1);snapshot.draft=''; // user sent the prepared request
    buttons[2].listeners.click({isTrusted:true});await done.promise;
    assert.equal(deliveryReply.ok,false);assert.equal(writes,afterFill?2:1);assert.equal(clicks,0);assert.equal(checks,afterFill?2:1);
    assert.equal(attrs.get('data-opendesk-composer-owner'),!takeover&&(afterFill||forgedMarker)?'chatgpt-fixed-bridge':undefined);
    if(afterFill)assert.equal(snapshot.draft,deliver.text);
    assert.equal((await receive()).ok,false);
    assert.equal(writes,afterFill?2:1);assert.equal(clicks,0);assert.equal(checks,afterFill?2:1);
    bridge.dispose();
  }
});
test('R1.3 fixed bridge uses trusted src and rejects every independent queue source',()=>{
  const root='/repo';
  const inspect=path=>describeBundle({root,lock:{packages:{}},chunk:bundle(target,root+'/'+path)});
  assert.equal(inspect(adapter).modules[0].path,adapter);
  assert.equal(inspect(adapter).modules[0].reviewedFirstPartyBlob,undefined);
  for(const path of ['examples/programs/chatgpt-send-queue/src/site.js',
    'examples/programs/chatgpt-send-queue/src/engine.js','examples/programs/other.js'])
    assert.throws(()=>inspect(path),/cannot enter a privileged fixed bundle/);
});

test('bridge focuses before insertion and preserves a draft or attachment restored on focus',()=>{
  for(const restored of [{draft:'unsent website draft'},{rich:true},{idle:false}]){
    let writes=0;
    const doc={},editor={ownerDocument:doc,focus(){doc.activeElement=editor;Object.assign(current,restored);}};
    const initial={ok:true,editor,form:{},route:'c/12345678',idle:true,rich:false,draft:''};
    const current={...initial};
    const site={inspect:()=>current,prepare:()=>{writes++;return {ok:true};}};
    assert.equal(prepareChatGPTBridgeDraft(site,'result',initial).ok,false);
    assert.equal(writes,0);assert.equal(current.draft,restored.draft??'');
  }
  const doc={},editor={ownerDocument:doc,focus(){doc.activeElement=editor;}};
  const current={ok:true,editor,form:{},route:'c/12345678',idle:true,rich:false,draft:''};
  let writes=0;
  const site={inspect:()=>current,prepare:(text,snapshot)=>{
    assert.equal(text,'result');assert.equal(snapshot,current);writes++;return {ok:true};}};
  assert.equal(prepareChatGPTBridgeDraft(site,'result',current).ok,true);
  assert.equal(writes,1);
});

test('AI continuation belongs to exactly the confirmed result user turn and one later assistant',()=>{
  const doc={},editor={ownerDocument:doc},route='c/test-12345678';
  const node=()=>({ownerDocument:doc,isConnected:true});
  const priorUser=node(),priorAnswer=node(),answer=node();
  const user={...node(),compareDocumentPosition:node=>node===answer?4:1};
  const before={editor,route,users:[priorUser],assistants:[priorAnswer]};
  const current={...before,ok:true,busy:false,answerComplete:true,users:[priorUser,user],assistants:[priorAnswer,answer]};
  assert.equal(isChatGPTBridgeContinuation(before,current,user),true);
  for(const changed of [
    {...current,users:[priorUser,user,{}]},
    {...current,users:[{},user]},
    {...current,assistants:[{},answer]},
    {...current,assistants:[priorAnswer]},
    {...current,assistants:[priorAnswer,answer,{}]},
    {...current,busy:true},{...current,answerComplete:false},
    {...current,assistants:[priorAnswer,{}]}
  ])assert.equal(isChatGPTBridgeContinuation(before,changed,user),false);
  assert.equal(isChatGPTBridgeContinuation(before,current,{}),false);
});

function continuationHistory(){
  const doc={},editor={ownerDocument:doc},route='c/test-12345678';
  const node=textContent=>({ownerDocument:doc,isConnected:true,textContent});
  const users=[node('old user'),node('recent user'),node('current request')];
  const assistants=[node('old reply'),node('recent reply'),node('current candidate')];
  const answer=node('根据本次真实网页结果，页面主标题为《白鲸》。');
  const resultUser={...node('current durable result'),compareDocumentPosition:other=>other===answer?4:1};
  const before={editor,route,users,assistants};
  const current={...before,ok:true,busy:false,answerComplete:true,
    users:[...users,resultUser],assistants:[...assistants,answer]};
  return {before,current,resultUser,answer,node};
}

test('AI continuation permits only old history prefix eviction with retained request and candidate anchors',()=>{
  const {before,current,resultUser}=continuationHistory();
  // User and assistant lists need not evict the same number of old nodes.
  for(let usersOffset=0;usersOffset<before.users.length;usersOffset++){
    for(let assistantsOffset=0;assistantsOffset<before.assistants.length;assistantsOffset++){
      assert.equal(isChatGPTBridgeContinuation(before,{...current,
        users:current.users.slice(usersOffset),assistants:current.assistants.slice(assistantsOffset)},resultUser),true,
      `completed Chinese reply after prefix eviction: users=${usersOffset}, assistants=${assistantsOffset}`);
    }
  }
});

test('AI continuation after history eviction rejects gaps, remounts, old replies and identity changes',()=>{
  const {before,current,resultUser,answer,node}=continuationHistory();
  const kept={...current,users:current.users.slice(1),assistants:current.assistants.slice(1)};
  for(const changed of [
    {...kept,ok:false},{...kept,busy:true},{...kept,answerComplete:false},
    {...kept,route:'c/other-12345678'},
    {...kept,editor:{ownerDocument:{}}},
    {...kept,users:[resultUser]},
    {...kept,users:[before.users[0],before.users[2],resultUser]},
    {...kept,users:[before.users[1],node('current request'),resultUser]},
    {...kept,users:[...kept.users,node('extra user turn')]},
    {...kept,users:[before.users[1],before.users[2],node('current durable result')]},
    {...kept,assistants:[answer]},
    {...kept,assistants:[before.assistants[0],before.assistants[2],answer]},
    {...kept,assistants:[before.assistants[1],node('current candidate'),answer]},
    {...kept,assistants:before.assistants.slice(1)},
    {...kept,assistants:[...kept.assistants,node('extra answer')]}
  ])assert.equal(isChatGPTBridgeContinuation(before,changed,resultUser),false);
  for(const anchor of [resultUser,answer,before.users.at(-1),before.assistants.at(-1)]){
    anchor.isConnected=false;
    assert.equal(isChatGPTBridgeContinuation(before,kept,resultUser),false,'detached anchor');
    anchor.isConnected=true;anchor.ownerDocument={};
    assert.equal(isChatGPTBridgeContinuation(before,kept,resultUser),false,'different document');
    anchor.ownerDocument=before.editor.ownerDocument;
  }
  // Even if an old assistant node is moved after the result, it is not new.
  resultUser.compareDocumentPosition=()=>4;
  assert.equal(isChatGPTBridgeContinuation(before,{...kept,
    assistants:[...before.assistants.slice(1),before.assistants[0]]},resultUser),false);
  resultUser.compareDocumentPosition=()=>2; // new assistant precedes the result
  assert.equal(isChatGPTBridgeContinuation(before,kept,resultUser),false);
});
