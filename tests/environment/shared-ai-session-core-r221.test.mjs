import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationSession} from '../../src/ui/conversation/session.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';

const identity=(consumerId,instanceId)=>({
  consumerId,instanceId,hostInstanceId:'trusted-panel',installEpoch:'installation-1'
});

test('R2.2.1 neutral Session owns only isolated display state, never business references',()=>{
  const bookmark=createConversationSession({identity:identity('bookmark','bookmark-1'),rowsLimit:2});
  const prompt=createConversationSession({identity:identity('prompt','prompt-1')});
  const changes=[];
  const unsubscribe=bookmark.subscribe(()=>changes.push(bookmark.getSnapshot().revision));
  const initial=bookmark.getSnapshot();
  bookmark.update({open:true,draft:'search'});
  bookmark.append('你','first');
  bookmark.append('助手','second');
  bookmark.append('系统','third');
  assert.equal(bookmark.getSnapshot().rows.length,2,'transcript is bounded per consumer');
  assert.equal(bookmark.getSnapshot().draft,'search');
  assert.deepEqual(prompt.getSnapshot().rows,[]);
  assert.equal(prompt.getSnapshot().draft,'');
  assert.equal(prompt.getSnapshot().open,false);
  assert.notStrictEqual(bookmark.getSnapshot(),initial);
  assert.equal(changes.length,4);
  assert.throws(()=>bookmark.update({bookmarkId:'unsafe'}),{code:'E_CONVERSATION_STATE'});
  assert.throws(()=>bookmark.update({refs:{matches:['secret']}}),{code:'E_CONVERSATION_STATE'});
  assert.equal(Object.hasOwn(bookmark.getSnapshot(),'refs'),false);
  const previous=bookmark.getSnapshot();
  bookmark.update({draft:'search'});
  assert.strictEqual(bookmark.getSnapshot(),previous,'unchanged state keeps identity');
  unsubscribe();bookmark.dispose();prompt.dispose();
  assert.equal(bookmark.getSnapshot().rows.length,0);
  assert.throws(()=>bookmark.update({draft:'late'}),{code:'E_TOOL_CHANGED'});
});

test('R2.2.1 stop, provider generation and disposal reject stale turns without affecting siblings',()=>{
  const first=createConversationSession({identity:identity('prompt','prompt-1')});
  const second=createConversationSession({identity:identity('prompt','prompt-2')});
  const parent=new AbortController();
  const one=first.begin({signal:parent.signal,providerGeneration:3});
  const two=second.begin({providerGeneration:3});
  assert.equal(first.getSnapshot().busy,true);
  assert.throws(()=>first.begin(),{code:'E_CONVERSATION_BUSY'});
  one.assertCurrent(3);
  assert.throws(()=>one.assertCurrent(4),{code:'E_CONVERSATION_STALE'});
  parent.abort(Object.assign(new Error('changed'),{code:'E_CANCELLED'}));
  assert.throws(()=>one.assertCurrent(3),{code:'E_CANCELLED'});
  one.finish();
  assert.equal(first.getSnapshot().busy,false);
  two.assertCurrent(3);
  first.dispose();
  assert.equal(second.getSnapshot().busy,true,'closing one consumer must not stop another');
  two.finish();second.dispose();
});

test('R2.2.1 business adapters retain Prompt ETag and do not share Bookmark references',()=>{
  const leased=[],settingsListeners=new Set();
  const providers={
    acquire:identity=>{leased.push(identity);return {invalidate(){},dispose(){},cancelInference:async()=>{}};},
    subscribeSettings:listener=>{settingsListeners.add(listener);return ()=>settingsListeners.delete(listener);},
    configuration:()=>({source:'local_codex',generation:1})
  };
  const api={permissions:{onRemoved:{addListener(){},removeListener(){}}}};
  const bookmark=createBusinessConversation({api,providerRuntime:providers,
    ...identity('bookmark','bookmark-2')});
  const prompt=createBusinessConversation({api,providerRuntime:providers,
    ...identity('prompt','prompt-3')});
  const etag='a'.repeat(64);
  bookmark.saveSession({open:true,draft:'folder',rows:[
    {id:'1',speaker:'你',message:'save'}],
    refs:{folderId:'book-folder',bookmarkId:'book-id',matches:['b1']}});
  prompt.saveSession({open:true,draft:'prompt',rows:[
    {id:'2',speaker:'你',message:'edit'}],
    refs:{folderId:'must-not-leak',matches:['p1'],etag}});
  assert.equal(bookmark.readSession().refs.folderId,'book-folder');
  assert.deepEqual(prompt.readSession().refs,{matches:['p1'],etag});
  assert.equal(prompt.readSession().draft,'prompt');
  assert.equal(bookmark.readSession().draft,'folder');
  assert.equal(bookmark.identity().consumerId,'bookmark');
  assert.equal(prompt.identity().consumerId,'prompt');
  assert.equal(leased.length,3,'Prompt Edit keeps its own Provider Lease');
  assert.equal(settingsListeners.size,2);
  bookmark.dispose();
  assert.equal(settingsListeners.size,1,'closing one consumer removes only its settings subscription');
  assert.deepEqual(bookmark.readSession().refs,{folderId:null,bookmarkId:null,matches:[]});
  assert.equal(prompt.readSession().refs.etag,etag,'Bookmark close must not destroy Prompt ETag');
  prompt.dispose();
  assert.equal(settingsListeners.size,0);
  assert.equal(prompt.readSession().draft,'');
});

test('R2.2.1 settings changes retire an unresolved inference without pinning UI busy',async()=>{
  let generation=1,turns=0;
  const subscribers=new Set(),leases=[];
  const providers={
    configuration:()=>({source:'custom_https',generation,
      settings:{endpoint:'https://example.org/v1/chat/completions',model:'test-model',
        apiKey:'session-only-key'}}),
    subscribeSettings(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},
    acquire:()=>{const lease={
      requestStructured:()=>++turns===1?new Promise(()=>{}):
        Promise.resolve({proposal:{question:'new turn'}}),
      cancelInference:async()=>({state:'IDLE'}),invalidate(){},dispose(){}
    };leases.push(lease);return lease;}
  };
  const api={permissions:{
    contains:async()=>true,request:async()=>true,
    onRemoved:{addListener(){},removeListener(){}}
  }};
  const consumer=createBusinessConversation({api,providerRuntime:providers,
    ...identity('bookmark','bookmark-settings')});
  const first=consumer.request({request:'first',event:{isTrusted:true}});
  // Permit the original permission check and model dispatch to start.
  for(let i=0;i<8&&turns===0;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(turns,1,'the first turn has reached the intentionally hanging transport');
  generation=2;
  for(const listener of subscribers)listener();
  await assert.rejects(first,{code:'E_TOOL_CHANGED'});
  const result=await consumer.request({request:'second',event:{isTrusted:true}});
  assert.equal(result.proposal.question,'new turn','a new turn must not inherit stale busy state');
  result.authorization.release();
  consumer.dispose();
  assert.equal(subscribers.size,0,'settings listener is removed on disposal');
});
