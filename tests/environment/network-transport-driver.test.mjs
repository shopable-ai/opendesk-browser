import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createIsolatedHttpTransport,NETWORK_TRANSPORT_PROTOCOL,NETWORK_TRANSPORT_PATH}
  from '../../src/platform/chrome/network-transport.js';

// Chrome/Port component doubles: exercise the exported driver, never source text.
const result=(text='ok')=>({kind:'result',status:200,statusText:'OK',headers:{'content-type':'text/plain'},text});
function event(){
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    fire(...args){for(const fn of [...listeners])fn(...args);}};
}
async function until(predicate){
  for(let i=0;i<100;i++){if(predicate())return;await nextTurn();}
  assert.fail('Chrome stub did not reach expected state');
}
function fixture(){
  const tabs=new Map(),rules=new Map(),calls=[],ports=[];
  const faults={};let serial=10;
  const api={runtime:{id:'own-extension',getURL:path=>'chrome-extension://own-extension/'+path,onConnect:event()},
    tabs:{
      async create(options){
        const tab={id:++serial,...options};tabs.set(tab.id,tab);calls.push({kind:'create',tab:structuredClone(tab)});return structuredClone(tab);
      },
      async query(){calls.push({kind:'query'});if(faults.query)throw Error('tab readback failed');return [...tabs.values()].map(t=>({...t}));},
      async remove(id){calls.push({kind:'removeTab',id});if(faults.removeTab)throw Error('tab close failed');if(!faults.retainTab)tabs.delete(id);}
    },
    declarativeNetRequest:{
      async getSessionRules(){
        calls.push({kind:'readRules'});if(faults.readRules)throw Error('rule readback failed');
        return [...rules.values()].map(rule=>structuredClone(rule));
      },
      async updateSessionRules(change){
        calls.push({kind:'updateRules',change:structuredClone(change)});
        if(faults.removeRule&&change.removeRuleIds?.length&&!change.addRules?.length)throw Error('rule removal failed');
        if(!faults.retainRule)for(const id of change.removeRuleIds??[])rules.delete(id);
        for(const rule of change.addRules??[])rules.set(rule.id,structuredClone(rule));
      }
    }};
  const transport=createIsolatedHttpTransport({api,enabled:true});
  const page=api.runtime.getURL(NETWORK_TRANSPORT_PATH);
  function connect(tab,override={}){
    const port={name:NETWORK_TRANSPORT_PROTOCOL+':'+tab.url.split('#')[1],
      sender:{id:api.runtime.id,frameId:0,documentId:'document-'+tab.id,documentLifecycle:'active',url:tab.url,tab:{id:tab.id},...override},
      sent:[],disconnected:false,onMessage:event(),onDisconnect:event(),
      postMessage(message){this.sent.push(structuredClone(message));},
      disconnect(){if(!this.disconnected){this.disconnected=true;this.onDisconnect.fire();}}};
    ports.push(port);api.runtime.onConnect.fire(port);return port;
  }
  function start({url='http://127.0.0.1:43121/a.*?q=One%2A',method='GET',userAgent='Bounded-UA/1.0',
    deadlineAt=Date.now()+3000,beforeDispatch=async()=>{},signal=new AbortController().signal}={}){
    const promise=transport.request(url,{method,userAgent,headers:{accept:'text/plain'},signal},
      {runId:'run-one',requestId:'request-one',deadlineAt},beforeDispatch);
    promise.catch(()=>{});return promise;
  }
  async function ready(options){
    const previous=serial,promise=start(options);
    await until(()=>serial>previous);
    const tab=[...tabs.values()].find(t=>t.id>previous),port=connect(tab);
    await until(()=>port.sent.length||port.disconnected);
    return {promise,tab,port};
  }
  function clean(){assert.equal(tabs.size,0);assert.equal(rules.size,0);}
  return {api,transport,page,tabs,rules,calls,ports,faults,connect,start,ready,clean};
}

test('UA rule isolates exact URL, private tab and extension initiator before one authorized request',async()=>{
  const f=fixture();let authorized=0;
  const {promise,tab,port}=await f.ready({beforeDispatch:async()=>{
    authorized++;assert.equal(f.rules.size,1);assert.equal(f.ports.at(-1).sent.length,0);
  }});
  assert.equal(tab.active,false);assert.ok(tab.url.startsWith(f.page+'#'));
  const [rule]=f.rules.values();
  assert.deepEqual(rule.action,{type:'modifyHeaders',requestHeaders:[{header:'user-agent',operation:'set',value:'Bounded-UA/1.0'}]});
  assert.deepEqual(rule.condition.tabIds,[tab.id]);
  assert.deepEqual(rule.condition.initiatorDomains,[f.api.runtime.id]);
  assert.deepEqual(rule.condition.resourceTypes,['xmlhttprequest']);
  assert.equal(rule.condition.isUrlFilterCaseSensitive,true);
  const url=port.sent[0].url,regex=new RegExp(rule.condition.regexFilter);
  assert.equal(regex.test(url),true);
  for(const other of [url+'/tail',url+'&extra=1',url.replace('One','one'),url.replace('a.*','axx'),url.replace('43121','43112')])
    assert.equal(regex.test(other),false,other);
  assert.equal(authorized,1);assert.equal(port.sent.length,1);
  assert.equal(port.sent[0].headers['x-opendesk-run-id'],'run-one');
  assert.equal(port.sent[0].headers['x-opendesk-request-id'],'request-one');
  port.onMessage.fire(result());
  const response=await promise;assert.equal(response.status,200);assert.equal(await response.text(),'ok');
  f.clean();assert.equal(port.disconnected,true);
  assert.ok(f.calls.some(c=>c.kind==='removeTab'&&c.id===tab.id));
  assert.ok(f.calls.some(c=>c.kind==='updateRules'&&c.change.removeRuleIds?.includes(rule.id)&&!c.change.addRules));
});

test('two simultaneous requests use disjoint private tabs, tokens and UA rules',async()=>{
  const f=fixture(),a=await f.ready(),b=await f.ready({userAgent:'Other-UA/2'});
  assert.notEqual(a.tab.id,b.tab.id);assert.notEqual(a.tab.url,b.tab.url);
  assert.equal(f.rules.size,2);
  assert.deepEqual([...f.rules.values()].map(r=>r.condition.tabIds[0]),[a.tab.id,b.tab.id]);
  a.port.onMessage.fire(result('a'));assert.equal(await (await a.promise).text(),'a');
  assert.equal(f.rules.size,1);assert.equal(f.tabs.size,1);
  b.port.onMessage.fire(result('b'));assert.equal(await (await b.promise).text(),'b');f.clean();
});

test('foreign extension, wrong URL/frame/document and wrong tab cannot bind the transport Port',async()=>{
  const f=fixture(),promise=f.start();await until(()=>f.tabs.size===1);
  const [tab]=f.tabs.values();
  for(const override of [{id:'foreign-extension'},{url:tab.url+'-other'},{frameId:1},{documentId:''},{tab:{id:tab.id+1}}]){
    const port=f.connect(tab,override);await until(()=>port.disconnected);
    assert.equal(port.sent.length,0);
  }
  // A wrong-tab connection fails the pending operation closed; none may dispatch.
  await assert.rejects(promise,{code:'E_OWNER'});f.clean();
});

test('inactive or missing document lifecycle rejects the Port without consuming the active request',async()=>{
  const f=fixture(),promise=f.start();await until(()=>f.tabs.size===1);
  const [tab]=f.tabs.values();
  for(const documentLifecycle of ['cached','prerender','pending_deletion',undefined]){
    const port=f.connect(tab,{documentLifecycle});await until(()=>port.disconnected);
    assert.equal(port.sent.length,0);assert.equal(f.rules.size,0);
  }
  const active=f.connect(tab);await until(()=>active.sent.length===1);
  active.onMessage.fire(result('active'));
  assert.equal(await (await promise).text(),'active');f.clean();
});

test('a second ready connection and late responses never dispatch or retry a request twice',async()=>{
  const f=fixture(),{promise,tab,port}=await f.ready();
  const second=f.connect(tab);await until(()=>second.disconnected);
  assert.equal(second.sent.length,0);assert.equal(port.sent.length,1);
  await assert.rejects(promise,{code:'E_OWNER'});
  port.onMessage.fire(result('late'));port.onMessage.fire(result('duplicate'));
  const late=f.connect(tab);await until(()=>late.disconnected);
  assert.equal(late.sent.length,0);assert.equal(port.sent.length,1);f.clean();
});

test('a successful response is single-use; late result/ready cannot affect the next request',async()=>{
  const f=fixture(),a=await f.ready();a.port.onMessage.fire(result('first'));
  assert.equal(await (await a.promise).text(),'first');
  const b=await f.ready();a.port.onMessage.fire(result('late'));
  const late=f.connect(a.tab);await until(()=>late.disconnected);
  assert.equal(late.sent.length,0);assert.equal(a.port.sent.length,1);assert.equal(b.port.sent.length,1);
  b.port.onMessage.fire(result('second'));assert.equal(await (await b.promise).text(),'second');f.clean();
});

test('AbortSignal cancels before connection and after dispatch, retiring resources without retry',async()=>{
  for(const dispatched of [false,true]){
    const f=fixture(),controller=new AbortController(),promise=f.start({signal:controller.signal});
    await until(()=>f.tabs.size===1);const [tab]=f.tabs.values();
    const port=dispatched?f.connect(tab):null;
    if(port)await until(()=>port.sent.length===1);
    controller.abort(Object.assign(Error('cancelled'),{code:'E_CANCELLED'}));
    await assert.rejects(promise,{code:'E_CANCELLED'});f.clean();
    if(port){port.onMessage.fire(result('late'));assert.equal(port.sent.length,1);assert.equal(port.disconnected,true);}
    assert.equal(f.calls.filter(c=>c.kind==='create').length,1);
  }
});

test('deadline times out both unconnected and dispatched requests without replay',async()=>{
  for(const dispatched of [false,true]){
    const f=fixture(),promise=f.start({deadlineAt:Date.now()+100});
    await until(()=>f.tabs.size===1);const [tab]=f.tabs.values(),port=dispatched?f.connect(tab):null;
    if(port)await until(()=>port.sent.length===1);
    await assert.rejects(promise,{code:'E_TIMEOUT'});f.clean();
    if(port){port.onMessage.fire(result('late'));assert.equal(port.sent.length,1);}
    assert.equal(f.calls.filter(c=>c.kind==='create').length,1);
  }
});

test('Authority rejection before dispatch leaves no request, rule or private tab',async()=>{
  const f=fixture(),{promise,port}=await f.ready({beforeDispatch:async()=>{throw Object.assign(Error('revoked'),{code:'E_PERMISSION'});}});
  await assert.rejects(promise,{code:'E_PERMISSION'});assert.equal(port.sent.length,0);f.clean();
});

for(const fault of ['removeTab','retainTab','query','removeRule','retainRule','readRules'])
  test('unconfirmed cleanup poisons subsequent requests: '+fault,async()=>{
    const f=fixture(),{promise,port}=await f.ready();f.faults[fault]=true;
    port.onMessage.fire(result());await assert.rejects(promise,{code:'E_EFFECT_UNKNOWN'});
    const created=f.calls.filter(c=>c.kind==='create').length;
    await assert.rejects(f.start(),{code:'E_EFFECT_UNKNOWN'});
    assert.equal(f.calls.filter(c=>c.kind==='create').length,created);
    assert.ok(f.calls.some(c=>c.kind==='removeTab'));
    assert.ok(f.calls.some(c=>c.kind==='updateRules'&&!c.change.addRules&&c.change.removeRuleIds?.length));
  });

test('non-development mode denies transport without installing listeners or touching Chrome resources',async()=>{
  const f=fixture();for(const enabled of [false,undefined]){
    const disabled=createIsolatedHttpTransport({api:f.api,...(enabled===undefined?{}:{enabled})});
    await assert.rejects(disabled.request('http://127.0.0.1:43121/',{method:'GET'},{}),{code:'E_SERVICE_UNSUPPORTED'});
  }
  assert.equal(f.calls.length,0);
});

test('other local addresses, ports, credentials, fragments, remote hosts and non-GET methods fail closed',async()=>{
  const f=fixture();
  for(const url of ['http://localhost:43121/','http://127.0.0.2:43121/','http://127.0.0.1:43112/','http://127.0.0.1:43111/',
    'http://[::1]:43121/','https://127.0.0.1:43121/','https://remote.example/',
    'http://user:pass@127.0.0.1:43121/','http://127.0.0.1:43121/#fragment'])
    await assert.rejects(f.start({url}),{code:'E_PERMISSION'});
  for(const method of ['POST','PUT','DELETE','HEAD','OPTIONS','get'])
    await assert.rejects(f.start({method}),{code:'E_PERMISSION'});
  assert.equal(f.calls.length,0);
});

test('Port disconnect after dispatch fails unknown and cannot replay through a replacement Port',async()=>{
  const f=fixture(),{promise,tab,port}=await f.ready();port.disconnect();
  await assert.rejects(promise,{code:'E_EFFECT_UNKNOWN'});
  const replacement=f.connect(tab);await until(()=>replacement.disconnected);
  assert.equal(port.sent.length,1);assert.equal(replacement.sent.length,0);f.clean();
});

test('cancellation during pending UA rule installation cannot leak a rule or authorize a retired request',async()=>{
  const f=fixture(),controller=new AbortController();let release,installing=false,authorized=0;
  const gate=new Promise(resolve=>{release=resolve;}),update=f.api.declarativeNetRequest.updateSessionRules;
  f.api.declarativeNetRequest.updateSessionRules=async change=>{
    if(change.addRules?.length){installing=true;await gate;}
    return update(change);
  };
  const promise=f.start({signal:controller.signal,beforeDispatch:async()=>{authorized++;}});
  await until(()=>f.tabs.size===1);const [tab]=f.tabs.values(),port=f.connect(tab);
  await until(()=>installing);
  controller.abort(Object.assign(Error('cancelled'),{code:'E_CANCELLED'}));
  // Unblock Chrome even if retirement waits for the in-flight rule write.
  await nextTurn();release();
  await assert.rejects(promise,{code:'E_CANCELLED'});
  await nextTurn();await nextTurn();
  assert.equal(port.sent.length,0);
  assert.deepEqual({tabs:f.tabs.size,rules:f.rules.size,authorized},{tabs:0,rules:0,authorized:0},
    'retirement must wait for rule installation and prevent late authorization');
});

test('lazy first request recovers only stale owned session rules and private tabs, preserving other owners',async()=>{
  const f=fixture(),ownedId=1901000042,foreignIds=[1900999999,1901010000];
  const staleRule=id=>({id,priority:1,action:{type:'block'},condition:{urlFilter:'example.test',resourceTypes:['xmlhttprequest']}});
  for(const id of [ownedId,...foreignIds])f.rules.set(id,staleRule(id));
  f.tabs.set(1,{id:1,url:f.page+'#old-token'});
  f.tabs.set(2,{id:2,url:f.api.runtime.getURL('sidepanel.html')});
  f.tabs.set(3,{id:3,url:'chrome-extension://other-extension/'+NETWORK_TRANSPORT_PATH+'#old-token'});
  assert.equal(typeof f.transport.recover,'function');
  assert.equal(f.calls.length,0,'constructing driver must not recover or mutate Chrome');
  const {promise,port}=await f.ready();
  assert.equal(f.rules.has(ownedId),false);
  for(const id of foreignIds)assert.deepEqual(f.rules.get(id),staleRule(id));
  assert.equal(f.tabs.has(1),false);assert.equal(f.tabs.has(2),true);assert.equal(f.tabs.has(3),true);
  const removal=f.calls.findIndex(c=>c.kind==='updateRules'&&c.change.removeRuleIds?.includes(ownedId));
  const creation=f.calls.findIndex(c=>c.kind==='create');
  assert.ok(removal>=0&&removal<creation,'stale owned rules must retire before admitting the first tab');
  port.onMessage.fire(result());await promise;
  assert.deepEqual([...f.rules.keys()],foreignIds);assert.deepEqual([...f.tabs.keys()],[2,3]);
});

test('unconfirmed lazy recovery rejects first and later requests before any tab or network dispatch',async()=>{
  const f=fixture(),ownedId=1901000042;
  f.rules.set(ownedId,{id:ownedId});f.faults.retainRule=true;
  await assert.rejects(f.start(),{code:'E_EFFECT_UNKNOWN'});
  await assert.rejects(f.start(),{code:'E_EFFECT_UNKNOWN'});
  assert.equal(f.calls.filter(c=>c.kind==='create').length,0);assert.equal(f.ports.length,0);
});

test('duplicate Port during pending addRules cannot replace setup ownership or leak a late rule',async()=>{
  const f=fixture();let release,installing=false,authorized=0;
  const gate=new Promise(resolve=>{release=resolve;}),update=f.api.declarativeNetRequest.updateSessionRules;
  f.api.declarativeNetRequest.updateSessionRules=async change=>{
    if(change.addRules?.length){installing=true;await gate;}
    return update(change);
  };
  const promise=f.start({beforeDispatch:async()=>{authorized++;}});
  try{
    await until(()=>f.tabs.size===1);const [tab]=f.tabs.values(),first=f.connect(tab);
    await until(()=>installing);
    const duplicate=f.connect(tab);await until(()=>duplicate.disconnected);
    // Let rejection/retirement proceed while the original Chrome write is pending.
    await nextTurn();await nextTurn();release();
    await assert.rejects(promise,{code:'E_OWNER'});
    await nextTurn();await nextTurn();
    assert.equal(first.sent.length,0);assert.equal(duplicate.sent.length,0);
    assert.deepEqual({tabs:f.tabs.size,rules:f.rules.size,authorized},{tabs:0,rules:0,authorized:0},
      'duplicate connection must not detach retirement from the original in-flight rule write');
  }finally{release();}
});

test('permanently pending beforeDispatch cancels within two seconds as unknown, blocks later requests and cannot dispatch late',
  {timeout:5000},async()=>{
    const f=fixture(),controller=new AbortController();let release,entered=false,timer;
    const gate=new Promise(resolve=>{release=resolve;});
    const promise=f.start({signal:controller.signal,beforeDispatch:async()=>{entered=true;await gate;}});
    try{
      await until(()=>f.tabs.size===1);const [tab]=f.tabs.values(),port=f.connect(tab);
      await until(()=>entered);
      const cancelledAt=performance.now();
      controller.abort(Object.assign(Error('cancelled'),{code:'E_CANCELLED'}));
      const outcome=await Promise.race([
        promise.then(()=>({fulfilled:true}),error=>({error})),
        new Promise(resolve=>{timer=setTimeout(()=>resolve({timedOut:true}),2000);})
      ]);
      assert.equal(outcome.timedOut,undefined,'cancel must settle while dispatch authorization remains permanently pending');
      assert.equal(outcome.error?.code,'E_EFFECT_UNKNOWN');
      assert.ok(performance.now()-cancelledAt<=2000,'unknown retirement must return within two seconds of cancellation');
      assert.equal(port.sent.length,0);f.clean();
      const created=f.calls.filter(c=>c.kind==='create').length;
      await assert.rejects(f.start(),{code:'E_EFFECT_UNKNOWN'});
      assert.equal(f.calls.filter(c=>c.kind==='create').length,created);
      // Only now allow the formerly hung Authority read to return: retirement
      // must remain final, and late setup must never send a carrier request.
      release();await nextTurn();await nextTurn();
      assert.equal(port.sent.length,0);assert.equal(port.disconnected,true);f.clean();
      await assert.rejects(f.start(),{code:'E_EFFECT_UNKNOWN'});
      assert.equal(f.calls.filter(c=>c.kind==='create').length,created);
    }finally{clearTimeout(timer);release();}
  });
