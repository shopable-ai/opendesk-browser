import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureClipPageConnection} from '../trusted/page-connection.js';
import {initPageClip} from '../trusted/page.js';
import {CLIP_PROTOCOL,CLIP_READY_OPERATION,CLIP_SITE_STORE,changeClipGrant} from '../trusted/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {officialToolFixture} from '../../../tests/helpers/official-tools.mjs';

const ready={ok:true,data:{ready:true}};
const missing=()=>new Error('Could not establish connection. Receiving end does not exist.');
function fixture({replies=[ready],inject,authorize}={}){
  const calls=[];
  const target={tabId:7,documentId:'exact-document',url:'https://article.example/a'};
  const api={tabs:{async sendMessage(...args){
    calls.push(['probe',...args]);const reply=replies.shift();if(reply instanceof Error)throw reply;return reply;
  }},scripting:{async executeScript(options){
    calls.push(['inject',options]);return inject?inject(options):[{frameId:0,documentId:target.documentId}];
  }}};
  return {calls,api,target,connect:()=>ensureClipPageConnection({api,target,
    toolId:'web-markdown-clipper',installEpoch:'installed-epoch',
    authorize:async()=>{calls.push(['authorize']);await authorize?.();}})};
}
test('live receiver needs no injection and readiness never extracts content',async()=>{
  const f=fixture();await f.connect();
  assert.deepEqual(f.calls.map(x=>x[0]),['authorize','probe','authorize']);
  assert.deepEqual(f.calls[1].slice(1),[7,{protocol:CLIP_PROTOCOL,operation:CLIP_READY_OPERATION,
    toolId:'web-markdown-clipper',expectedUrl:f.target.url,installEpoch:'installed-epoch'},
  {frameId:0,documentId:'exact-document'}]);
});
for(const absent of [missing(),undefined])test(`missing receiver (${absent?'rejected':'no handler'}) loads only fixed isolated relay`,async()=>{
  const f=fixture({replies:[absent,ready]});await f.connect();
  assert.deepEqual(f.calls.filter(x=>x[0]==='inject'),[['inject',{
    target:{tabId:7,documentIds:['exact-document']},world:'ISOLATED',files:['agents/page-relay.js']}]]);
  assert.equal(f.calls.filter(x=>x[0]==='probe').length,2);
});
for(const error of [new Error('The message port closed before a response was received.'),new Error('permission denied')])
test(`unknown/error probe is not retried: ${error.message}`,async()=>{
  const f=fixture({replies:[error]});await assert.rejects(f.connect(),{message:error.message});
  assert.equal(f.calls.filter(x=>x[0]==='probe').length,1);
  assert.equal(f.calls.some(x=>x[0]==='inject'),false);
});
test('receiver authorization refusal never injects',async()=>{
  const f=fixture({replies:[{ok:false,error:'剪藏工具或网站未授权'}]});
  await assert.rejects(f.connect(),/未授权/);assert.equal(f.calls.some(x=>x[0]==='inject'),false);
});
for(const stage of [1,2,3,4])test(`document/permission invalidation at authorization fence ${stage} stops preparation`,async()=>{
  let n=0;const f=fixture({replies:[missing(),ready],authorize(){if(++n===stage)throw Error('document or grant changed');}});
  await assert.rejects(f.connect(),/document or grant changed/);
  assert.equal(f.calls.filter(x=>x[0]==='inject').length,stage<=2?0:1);
  assert.equal(f.calls.filter(x=>x[0]==='probe').length,stage===1?0:stage===4?2:1);
});
test('wrong injection document and unavailable scripting fail without another send',async()=>{
  for(const inject of [()=>[],()=>[{frameId:0,documentId:'replacement'}]]){
    const f=fixture({replies:[missing()],inject});await assert.rejects(f.connect(),/刷新目标网页/);
    assert.equal(f.calls.filter(x=>x[0]==='probe').length,1);
  }
  const f=fixture({replies:[missing()]});delete f.api.scripting;
  await assert.rejects(f.connect(),/刷新目标网页/);
});
test('failed fixed initialization returns a recovery hint, without looping',async()=>{
  const f=fixture({replies:[missing(),missing()]});await assert.rejects(f.connect(),/刷新目标网页/);
  assert.equal(f.calls.filter(x=>x[0]==='probe').length,2);
  assert.equal(f.calls.filter(x=>x[0]==='inject').length,1);
});
test('page readiness checks sender, exact URL, install epoch, enabled state and site grant',async()=>{
  const tool=await officialToolFixture('web-markdown-clipper'),url='https://article.example/a';
  const store={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:'epoch'}};
  let listener;
  const api={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,
    onMessage:{addListener:fn=>{listener=fn;},removeListener(){}}},
  storage:{local:{async get(keys){return Object.fromEntries(keys.map(k=>[k,store[k]]));}}}};
  const win={location:{href:url},addEventListener(){}};win.top=win;
  // Any DOM extraction would fail: this intentionally supplies no document APIs.
  const page=initPageClip({api,doc:{},win});
  const sender={id:'test',url:'chrome-extension://test/sidepanel.html?hostInstanceId=12345678-1234-4234-8234-123456789abc'};
  const message={protocol:CLIP_PROTOCOL,operation:CLIP_READY_OPERATION,toolId:tool.id,expectedUrl:url,installEpoch:'epoch'};
  const ask=(m=message,s=sender)=>new Promise(resolve=>listener(m,s,resolve));
  try{
    assert.deepEqual(await ask(),ready);
    assert.equal((await ask({...message,expectedUrl:url+'/other'})).ok,false);
    assert.equal((await ask({...message,installEpoch:'old'})).ok,false);
    assert.equal((await ask(message,{...sender,id:'other-extension'})).ok,false);
    store[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};assert.equal((await ask()).ok,false);
    store[SIDEBAR_TOOL_ENABLE_STORE]={};
    store[CLIP_SITE_STORE]=changeClipGrant({},tool.id,url,false);assert.equal((await ask()).ok,false);
  }finally{page.dispose();}
});
