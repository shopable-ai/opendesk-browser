import test from 'node:test';
import assert from 'node:assert/strict';
import {startWebTaskContent} from '../../src/page-events/content-bridge.js';

const protocol='opendesk.web-task.v1';
const requestId='f2345678-1234-4234-8234-123456789abc';
const profile={id:'example',version:'1.0.0',origin:'https://example.test',adapter:'generic',
  adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true};
const candidate={protocol:'webflow.task.intent.v1',candidateId:'candidate-123',taskId:'search',
  targetUrl:'https://example.test/',args:{query:'OpenDesk'}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}}
function setup({selected=profile,top=true,send}={}){
  const win=new EventTarget(),messages=[],listeners=new Set(),receipts=[],results=[];
  win.top=top?win:{};win.location=new URL('https://example.test/page');win.CustomEvent=CustomEvent;
  win.addEventListener('opendesk:task-receipt',e=>receipts.push(JSON.parse(e.detail)));
  win.addEventListener('opendesk:task-result',e=>results.push(JSON.parse(e.detail)));
  const api={runtime:{id:'extension-id',sendMessage(message){
    messages.push(message);
    return send?send(message):Promise.resolve(message.kind==='site-profile'?{ok:true,data:{profile:selected}}:{ok:true,data:{requestId}});
  },onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const emit=(type,detail)=>win.dispatchEvent(new CustomEvent(type,{detail}));
  const intent=()=>emit('opendesk:task-intent',JSON.stringify(candidate));
  const deliver=(message,sender={id:'extension-id'})=>{
    const acks=[];for(const listener of listeners)listener(message,sender,reply=>acks.push(reply));return acks;
  };
  return {win,api,messages,listeners,receipts,results,emit,intent,deliver};
}

test('no profile, foreign exact origin, disabled and unsupported adapters never observe candidates',async()=>{
  for(const selected of [null,{...profile,origin:'https://example.test.evil'},
    {...profile,origin:'https://example.test:444'},{...profile,enabled:false},
    {...profile,adapter:'chatgpt'},{...profile,adapterVersion:'2.0.0'}]){
    const h=setup({selected});const session=startWebTaskContent(h);await flush();h.intent();await flush();
    assert.deepEqual(h.messages,[{protocol,kind:'site-profile'}]);session.dispose();
  }
});

test('iframe rejects startup and registers no listeners or messages',async()=>{
  const h=setup({top:false});startWebTaskContent(h);await flush();h.intent();
  assert.equal(h.messages.length,0);assert.equal(h.listeners.size,0);
});

test('one candidate sends once and its ACK is data only, with no resubmission',async()=>{
  const h=setup();const session=startWebTaskContent(h);await flush();h.intent();await flush();await flush();
  assert.deepEqual(h.messages,[{protocol,kind:'site-profile'},{protocol,kind:'candidate',candidateText:JSON.stringify(candidate)}]);
  assert.deepEqual(h.receipts,[{ok:true,data:{requestId}}]);session.dispose();
});

test('transport rejection emits a data failure without retrying',async()=>{
  const h=setup({send:message=>message.kind==='site-profile'?Promise.resolve({ok:true,data:{profile}}):Promise.reject(new Error('private failure'))});
  const session=startWebTaskContent(h);await flush();h.intent();await flush();await flush();
  assert.equal(h.messages.length,2);assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].ok,false);
  assert.ok(!JSON.stringify(h.receipts).includes('private failure'));session.dispose();
});

test('strict UUID query forwards only query, never candidate or task execution',async()=>{
  const h=setup();const session=startWebTaskContent(h);await flush();
  for(const detail of [{requestId},'{}','null',JSON.stringify({requestId,taskId:'search'}),
    '{"requestId":"'+requestId+'","requestId":"'+requestId+'"}',JSON.stringify({requestId:'bad'})])h.emit('opendesk:task-query',detail);
  h.emit('opendesk:task-query',JSON.stringify({requestId}));await flush();
  assert.deepEqual(h.messages,[{protocol,kind:'site-profile'},{protocol,kind:'query',requestId}]);
  assert.equal(h.receipts.length,1);session.dispose();
});

test('pagehide cancels pending startup; persisted pageshow re-fetches permissions',async()=>{
  const pending=[];const h=setup({send:()=>new Promise(resolve=>pending.push(resolve))});
  const session=startWebTaskContent(h);h.emit('pagehide');
  pending.shift()({ok:true,data:{profile}});await flush();h.intent();assert.equal(h.messages.length,1);
  const show=new Event('pageshow');show.persisted=true;h.win.dispatchEvent(show);
  assert.equal(h.messages.length,2);pending.shift()({ok:true,data:{profile:null}});await flush();
  h.intent();assert.equal(h.messages.length,2);session.dispose();
});

test('late candidate/query ACK cannot cross pagehide, BFCache or URL change',async()=>{
  const pending=[];const h=setup({send:message=>message.kind==='site-profile'?
    Promise.resolve({ok:true,data:{profile}}):new Promise(resolve=>pending.push(resolve))});
  const session=startWebTaskContent(h);await flush();h.intent();h.emit('opendesk:task-query',JSON.stringify({requestId}));
  h.emit('pagehide');const show=new Event('pageshow');show.persisted=true;h.win.dispatchEvent(show);await flush();
  pending.splice(0).forEach(resolve=>resolve({ok:true}));await flush();assert.equal(h.receipts.length,0);
  h.intent();h.win.location=new URL('https://example.test/other');pending.shift()({ok:true});await flush();
  assert.equal(h.receipts.length,0);session.dispose();
});

test('delivery requires real extension sender, exact URL, UUID and bounded JSON data',async()=>{
  const h=setup();const session=startWebTaskContent(h);await flush();
  const message={protocol,kind:'deliver',sourceUrl:h.win.location.href,requestId,data:{text:'<script>not executed</script>'}};
  for(const sender of [{},{id:'other'},{id:'extension-id',tab:{id:1}},{id:'extension-id',tab:null}])assert.deepEqual(h.deliver(message,sender),[]);
  for(const bad of [{...message,protocol:'other'},{...message,kind:'candidate'},
    {...message,sourceUrl:'https://example.test/else'},{...message,requestId:'bad'},
    {...message,data:{text:'x'.repeat(100000)}},{...message,data:{run(){}}}])assert.deepEqual(h.deliver(bad),[]);
  assert.equal(h.results.length,0);assert.deepEqual(h.deliver(message),[{ok:true}]);
  assert.deepEqual(h.results,[message]);h.emit('pagehide');assert.deepEqual(h.deliver(message),[]);session.dispose();
});

test('duplicate starts are idempotent and dispose removes all owned listeners',async()=>{
  const h=setup();const first=startWebTaskContent(h),second=startWebTaskContent(h);assert.equal(first,second);
  await flush();first.dispose();first.dispose();h.intent();h.emit('opendesk:task-query',JSON.stringify({requestId}));
  const show=new Event('pageshow');show.persisted=true;h.win.dispatchEvent(show);await flush();
  assert.equal(h.messages.length,1);assert.equal(h.listeners.size,0);
  const next=startWebTaskContent(h);await flush();h.intent();await flush();
  assert.equal(h.messages.length,3);next.dispose();
});

test('BFCache stops the old observer and permits a fresh approved profile only',async()=>{
  const h=setup();const session=startWebTaskContent(h);await flush();
  h.emit('pagehide');h.intent();h.emit('opendesk:task-query',JSON.stringify({requestId}));await flush();
  assert.equal(h.messages.length,1);
  const show=new Event('pageshow');show.persisted=true;h.win.dispatchEvent(show);await flush();h.intent();await flush();
  assert.deepEqual(h.messages.map(message=>message.kind),['site-profile','site-profile','candidate']);
  assert.equal(h.receipts.length,1);session.dispose();
});

test('dispose or URL change during profile lookup prevents a late observer',async()=>{
  for(const action of ['dispose','navigate']){
    let resolve;const h=setup({send:()=>new Promise(done=>{resolve=done;})});
    const session=startWebTaskContent(h);
    if(action==='dispose')session.dispose();else h.win.location=new URL('https://example.test/new');
    resolve({ok:true,data:{profile}});await flush();h.intent();await flush();
    assert.equal(h.messages.length,1);session.dispose();
  }
});

test('JSON queries accept escapes but reject duplicate escaped keys and invalid whitespace',async()=>{
  const h=setup();const session=startWebTaskContent(h);await flush();
  h.emit('opendesk:task-query','\u00a0'+JSON.stringify({requestId}));
  h.emit('opendesk:task-query','{"requestId":"'+requestId+'","\\u0072equestId":"'+requestId+'"}');
  h.emit('opendesk:task-query','{"\\u0072equestId":"'+requestId+'"}');await flush();
  assert.deepEqual(h.messages.map(message=>message.kind),['site-profile','query']);session.dispose();
});

test('backend failures are receipts and invalid JSON replies never reach the page',async()=>{
  for(const reply of [{ok:false,error:{code:'DENIED'}},{ok:true,data:{run(){}}},
    {ok:true,data:'x'.repeat(100000)}]){
    const h=setup({send:message=>Promise.resolve(message.kind==='site-profile'?{ok:true,data:{profile}}:reply)});
    const session=startWebTaskContent(h);await flush();h.intent();await flush();await flush();
    assert.equal(h.messages.length,2);assert.deepEqual(h.receipts,reply.ok?[]:[reply]);session.dispose();
  }
});
