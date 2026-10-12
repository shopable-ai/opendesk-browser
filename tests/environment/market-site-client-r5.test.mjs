// Public-client COMPONENT evidence. These fake callbacks are never native sender/install evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
const script=await readFile('src/market-site/client.js','utf8');
const protocol='opendesk.market.intent.v1',origin='http://127.0.0.1:43132';
const config={schema:'opendesk.market.channel.v1',protocol,enabled:true,extensionId:'a'.repeat(32),origin};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function client({receiver=true,configuration=config,fetchError=null}={}){
  const nodes=new Map(),sent=[],timers=new Map(),storage=new Map();let sequence=0;
  function node(selector){const value={textContent:'',disabled:false,hidden:false,dataset:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};nodes.set(selector,value);return value;}
  for(const name of ['#connection-state','#connect-button','#open-review','#handoff-state','#handoff-details','#handoff-code'])node(name);
  nodes.get('#open-review').dataset.subject=JSON.stringify({kind:'app',marketId:'opendesk/markdown-workbench',version:'1.0.1'});
  const chrome={runtime:{...(receiver?{sendMessage(id,message,callback){sent.push({id,message,callback});}}:{})}};
  const context={document:{querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[]},chrome,
    fetch:async()=>{if(fetchError)throw fetchError;return {ok:true,json:async()=>configuration};},location:{origin},crypto:{randomUUID},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),URL,JSON};
  runInNewContext(script,context,{filename:'src/market-site/client.js'});
  const answer=(request,response,error=null)=>{if(error)chrome.runtime.lastError={message:error};request.callback(response);delete chrome.runtime.lastError;};
  return {nodes,sent,timers,answer,act:()=>nodes.get('#open-review').listeners.click()};
}
test('R5 client never lets a late probe overwrite a successful handoff or claim installed',async()=>{
  const h=client();await tick();const auto=h.sent[0];assert.equal(auto.message.action,'PROBE');
  const action=h.act();await tick();const open=h.sent.find(row=>row.message.action==='OPEN_INSTALL_REVIEW');
  h.answer(open,{ok:true,protocol,status:'REVIEW_OPENED',intentId:open.message.intentId});await action;
  h.answer(auto,undefined,'late receiver failure');await tick();
  assert.equal(h.nodes.get('#handoff-state').dataset.state,'success');
  assert.match(h.nodes.get('#handoff-state').textContent,/不表示已安装/);
  assert.equal(h.nodes.get('#connect-button').disabled,false);
  const again=h.act();await tick();const second=h.sent.at(-1);assert.equal(second.message.intentId,open.message.intentId);
  h.answer(second,{ok:true,protocol,status:'REVIEW_OPENED',intentId:second.message.intentId});await again;
  assert.equal(Object.keys(second.message).sort().join(','),'action,intentId,protocol,subject');
});
test('R5 client timeout and missing receiver say unable to connect, without guessing installation state',async()=>{
  const h=client();await tick();const action=h.act();await tick();
  for(const callback of [...h.timers.values()])callback();await action;
  assert.match(h.nodes.get('#handoff-state').textContent,/无法连接 OpenDesk/);assert.match(h.nodes.get('#handoff-code').textContent,/E_CONNECT_TIMEOUT/);
  assert(!h.nodes.get('#handoff-state').textContent.includes('未安装'));
  const absent=client({receiver:false});await tick();await absent.act();
  assert.match(absent.nodes.get('#handoff-state').textContent,/无法连接 OpenDesk/);
  assert.equal(absent.nodes.get('#handoff-code').textContent,'E_NO_RECEIVER');
});
test('R5 client rejects incompatible and malformed replies instead of showing false success',async()=>{
  for(const response of [{ok:true,protocol:'unknown.v0',status:'REVIEW_OPENED'},
    {ok:true,protocol,status:'INSTALLED'}, {ok:false,protocol,error:{code:'E_INTENT_CONFLICT',message:'同一请求不能变更候选。'}}]){
    const h=client();await tick();const action=h.act();await tick();h.answer(h.sent.at(-1),response);await action;
    assert.equal(h.nodes.get('#handoff-state').dataset.state,'error');assert.notEqual(h.nodes.get('#handoff-code').textContent,'');
  }
});
test('R5 channel network/JSON errors and wrong origin are understandable and never send an install request',async()=>{
  for(const options of [{fetchError:new TypeError('Failed to fetch')},{configuration:null},
    {configuration:{...config,origin:'http://127.0.0.1:43133'}},{configuration:{...config,enabled:false}}]){
    const h=client(options);await tick();await h.act();assert.equal(h.sent.length,0);
    assert.equal(h.nodes.get('#handoff-state').dataset.state,'error');
    assert(!/TypeError|SyntaxError/.test(h.nodes.get('#handoff-state').textContent));
  }
});
