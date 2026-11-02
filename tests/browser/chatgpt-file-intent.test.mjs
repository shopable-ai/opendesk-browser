import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChatGPTFileHint,assertLockedChatGPTFileRequest,
  installChatGPTFileIntentGate,CHATGPT_FILE_INTENT_PROTOCOL} from '../../src/native-agent/chatgpt-file-intent-gate.js';

const sourceUrl='https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456';
const workspaceUrl='chrome-extension://test-extension/native-agent/workspace.html';
const pageSender={id:'test-extension',frameId:0,documentId:'document-a',
  url:sourceUrl,tab:{id:7,windowId:3,incognito:false}};
const workspaceSender={id:'test-extension',frameId:0,documentId:'document-w',
  url:workspaceUrl,tab:{id:51,windowId:3,incognito:false}};
function emitter(){
  const callbacks=new Set();
  return {addListener:fn=>callbacks.add(fn),removeListener:fn=>callbacks.delete(fn),
    emit(...args){for(const callback of callbacks)callback(...args);},
    get first(){return [...callbacks][0];}};
}
function setup(){
  const messages=emitter(),history=emitter(),committed=emitter(),removed=emitter();
  let created=0,now=1000,frameUrl=sourceUrl,frameDocument='document-a';
  const api={
    runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
      onMessage:messages},
    tabs:{onRemoved:removed,
      async get(id){assert.equal(id,7);return {id,windowId:3,url:frameUrl,incognito:false};},
      async create(options){created++;assert.equal(options.url,workspaceUrl);
        assert.equal(options.windowId,3);assert.equal(options.openerTabId,7);
        return {id:51,windowId:3};}},
    webNavigation:{onCommitted:committed,onHistoryStateUpdated:history,
      async getFrame({tabId,frameId}){assert.equal(tabId,7);assert.equal(frameId,0);
        return {url:frameUrl,documentId:frameDocument,documentLifecycle:'active'};}}
  };
  const gate=installChatGPTFileIntentGate({api,clock:()=>now});
  async function call(kind,sender,extras={}){
    return new Promise(resolve=>{
      const handled=messages.first({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind,...extras},sender,resolve);
      assert.equal(handled,true);
    });
  }
  return {call,gate,history,committed,removed,
    created:()=>created,tick:ms=>{now+=ms;},navigate:url=>{frameUrl=url;},
    replaceDocument:id=>{frameDocument=id;}};
}

test('only relative .txt hints; the model cannot expand the reviewed file scope',()=>{
  assert.equal(normalizeChatGPTFileHint(''),'');
  assert.equal(normalizeChatGPTFileHint('folder/demo.txt'),'folder/demo.txt');
  for(const path of ['../secret.txt','/etc/passwd.txt','other.md','demo.txt/',' hidden.txt','demo.TXT',12]){
    assert.throws(()=>normalizeChatGPTFileHint(path),{code:'E_FILE_HINT'});
  }
  const reviewed={requestId:'req',bindingId:'binding',workspaceId:'workspace',operation:'read',path:'demo.txt'};
  assert.equal(assertLockedChatGPTFileRequest({...reviewed},reviewed).path,'demo.txt');
  for(const changes of [{path:'other.txt'},{operation:'list'},{workspaceId:'other'},{requestId:'replay'}]){
    assert.throws(()=>assertLockedChatGPTFileRequest({...reviewed,...changes},reviewed),{code:'E_FILE_SCOPE'});
  }
});

test('official main-document click opens Workspace but never creates Native authority',async()=>{
  const h=setup();
  try{
    const open=await h.call('open',pageSender,{pathHint:'demo.txt'});
    assert.deepEqual(open,{ok:true,data:{opened:true}});
    assert.equal(h.created(),1);
    const claimed=await h.call('claim',workspaceSender);
    assert.equal(claimed.ok,true);
    assert.equal(claimed.data.pathHint,'demo.txt');
    assert.equal(claimed.data.source.tabId,7);
    assert.equal(claimed.data.source.documentId,'document-a');
    assert.equal(claimed.data.source.url,sourceUrl);
    assert.equal(claimed.data.source.conversationId,'abc12345-1234-1234-1234-abcdef123456');
    assert.equal(claimed.data.requiresDisclosureConsent,true);
    assert.equal('workspaceId' in claimed.data,false);
    assert.equal('sessionId' in claimed.data,false);
    assert.equal('requestId' in claimed.data,false);
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
  }finally{h.gate.dispose();}
});

test('page spoofing and page-provided grants are rejected before opening',async()=>{
  const h=setup();
  try{
    const spoof=await h.call('open',{...pageSender,id:'foreign'}, {pathHint:'demo.txt'});
    assert.equal(spoof.error.code,'E_FILE_SENDER');
    const grant=await h.call('open',pageSender,{pathHint:'demo.txt',workspaceId:'workspace-forged'});
    assert.equal(grant.error.code,'E_FILE_SCHEMA');
    assert.equal(h.created(),0);
    const wrongOwner=await h.call('claim',{...workspaceSender,url:sourceUrl});
    assert.equal(wrongOwner.error.code,'E_FILE_OWNER');
  }finally{h.gate.dispose();}
});

test('navigation and document replacement invalidate pending handoffs',async()=>{
  const h=setup();
  try{
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.history.emit({tabId:7,frameId:0});
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.replaceDocument('document-new');
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_SOURCE');
  }finally{h.gate.dispose();}
});

test('expired handoffs fail closed and cannot be claimed twice',async()=>{
  const h=setup();
  try{
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.tick(120_001);
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_EXPIRED');
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
  }finally{h.gate.dispose();}
});
