import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import {createLocalFixture} from '../../examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs';

const base='examples/sidebar-tools/ai-vip-share/';
const [html,script]=await Promise.all(['src/index.html','src/main.js'].map(p=>readFile(base+p,'utf8')));
const ORIGIN='http://127.0.0.1:7898',EXTENSION_ORIGIN='chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf';
const PREFERENCE='aiVipLocalDevelopmentR136',RECOVERY='aiVipRedeemR52';
const domains=['chatgpt.com','openai.com','claude.ai','anthropic.com','gemini.google.com',
  'generativelanguage.googleapis.com','perplexity.ai'];
const profile={endpoint:{scheme:'http',host:'127.0.0.1',port:7897},domains};
const released={state:'disabled',permission:true,canStop:false,control:'controllable_by_this_extension',reason:null};
const owned={...released,state:'enabled',canStop:true,control:'controlled_by_this_extension'};
const clone=value=>JSON.parse(JSON.stringify(value));
const etag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
function node(id=''){
  return {id,hidden:false,disabled:false,value:'',textContent:'',type:'password',style:{},attributes:{},
    children:[],listeners:{},classList:{toggle(){}},append(...xs){this.children.push(...xs)},
    replaceChildren(...xs){this.children=xs},addEventListener(name,fn){this.listeners[name]=fn},
    setAttribute(name,value){this.attributes[name]=String(value)},removeAttribute(name){delete this.attributes[name]},focus(){}};
}
// Exercise the real fixture handler in memory. No port, browser or background service starts.
function fixtureRequest(fixture,{method,url,data,headers}){
  return new Promise(resolve=>{
    const request=new PassThrough();request.method=method;request.url=new URL(url).pathname;
    request.headers={origin:EXTENSION_ORIGIN,...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]))};
    const response={headersSent:false,writeHead(status){this.status=status;this.headersSent=true},
      end(body){resolve({status:this.status,data:JSON.parse(body)})}};
    fixture.server.emit('request',request,response);
    request.end(data===undefined?'':JSON.stringify(data));
  });
}
async function runtime({store=new Map(),fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN}),
  developmentProfile=profile,getStatus,network,beforeStorageGet,afterStorageSet}={}){
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,node(id)]));
  const calls=[],storageCalls=[],proxyCalls=[];
  let current={...released,...(developmentProfile?{developmentProfile}: {})};
  const storage=async(operation,payload)=>{
    storageCalls.push({operation,...clone(payload)});
    const before=store.get(payload.key)??null;
    if(operation==='storage.get'){
      await beforeStorageGet?.(payload);
      return {value:clone(before),etag:etag(before)};
    }
    assert.equal(operation,'storage.set');assert.equal(payload.ifMatch,etag(before));
    store.set(payload.key,clone(payload.value));
    await afterStorageSet?.(payload,store);
    return {saved:true};
  };
  const request=async args=>{
    calls.push(clone(args));
    assert.equal(args.config.headers?.['X-OpenDesk-Local-Test'],'1');
    assert.equal(new URL(args.url).origin,ORIGIN);
    assert(['/api/member','/api/preview','/api/redeem','/api/status'].includes(new URL(args.url).pathname));
    if(network)return network(args,fixture);
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  };
  const managed={getStatus:async()=>getStatus?getStatus():clone(current),
    requestEnable:async args=>{proxyCalls.push({action:'enable',...clone(args)});current={...owned,developmentProfile};return clone(current)},
    requestDisable:async()=>{proxyCalls.push({action:'disable'});current={...released,developmentProfile};return clone(current)}};
  const window={OpenDeskTool:{root:{querySelector:id=>nodes.get(id.slice(1))},request:storage},
    OpenDeskSDK:{browser:{network:{request},proxy:{managed},tabs:{create:async()=>{throw Error('unused')}}}}};
  vm.runInNewContext(script,{window,document:{createElement:()=>node()},URL,Date,Intl,performance,
    crypto:{randomUUID}}, {timeout:2000});
  await flush();
  const get=name=>nodes.get('ai-vip-'+name);
  const click=async(name,trusted=true)=>{get(name).listeners.click({isTrusted:trusted});await flush()};
  return {store,fixture,get,click,calls,storageCalls,proxyCalls,
    async preview(value='DEMO-VIP-01'){
      get('redeem-code').value=value;get('redeem-code').listeners.input();
      get('redeem-form').listeners.submit({isTrusted:true,preventDefault(){}});await flush();
    },setStatus(value){current=value},flush};
}

test('local development requires trusted exact profile and explicit opt-in; production ignores saved selection',async()=>{
  for(const developmentProfile of [null,{...profile,endpoint:{...profile.endpoint,scheme:'https'}},
    {...profile,domains:[...domains,'example.com']},{...profile,domains:domains.slice(1)},
    {...profile,endpoint:{...profile.endpoint,host:'localhost'}}]){
    const store=new Map([[PREFERENCE,{schemaVersion:1,enabled:true}]]);
    const e=await runtime({developmentProfile,store});
    assert.equal(e.get('local-development').hidden,true);
    assert.equal(e.get('member-state').textContent,'服务未配置');
    await e.click('local-connect');assert.equal(e.calls.length,0);
    assert(!e.storageCalls.some(row=>row.key===PREFERENCE),'untrusted status must not even load saved dev selection');
  }
  const e=await runtime();
  assert.equal(e.get('local-development').hidden,false);
  assert.match(e.get('local-status').textContent,/本地开发.*尚未连接/);
  assert.equal(e.calls.length,0);
  await e.click('local-connect',false);assert.equal(e.calls.length,0);
  await e.click('local-connect');
  assert.equal(e.calls.length,1);assert.equal(e.calls[0].url,ORIGIN+'/api/member');
  assert.equal(e.get('member-state').textContent,'尚未开通');
  assert.equal(e.get('redeem-form').hidden,false);
  assert.equal(e.get('proxy-toggle').hidden,true,'account binding and a local preference are not proxy entitlement');
});

test('real fixture preview/confirm grants development feature, refreshes member and feeds public managed proxy config',async()=>{
  const e=await runtime();await e.click('local-connect');await e.preview();
  assert.equal(e.get('redeem-preview').hidden,false);
  assert.match(e.get('preview-description').textContent,/不是付费会员/);
  assert.equal(e.fixture.ledger.size,0);
  await e.click('redeem-confirm',false);assert.equal(e.fixture.ledger.size,0);
  await e.click('redeem-confirm');
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.get('member-state').textContent,'权益有效');
  assert.match(e.get('verified').textContent,/本地开发服务已核验/);
  assert.equal(e.get('proxy-toggle').hidden,false);
  assert.equal(e.get('proxy-toggle').disabled,false);
  assert.equal(e.store.get(RECOVERY),null);
  const journal=e.storageCalls.find(row=>row.operation==='storage.set'&&row.key===RECOVERY&&row.value);
  assert.equal(journal.value.schemaVersion,2);assert.equal(journal.value.serviceOrigin,ORIGIN);
  assert.equal(journal.value.packageVersion,'1.3.6');assert(!JSON.stringify(journal).includes('DEMO-VIP-01'));
  await e.click('proxy-toggle');
  assert.deepEqual(e.proxyCalls,[{action:'enable',config:profile}]);
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
  assert.equal(e.get('local-connect').disabled,true,'must explicitly stop before leaving local service');
  await e.click('proxy-toggle');
  assert.equal(e.get('proxy-state').textContent,'已停止');
  assert.equal(e.proxyCalls.at(-1).action,'disable');
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.get('member-state').textContent,'权益有效');
  assert.equal(reopened.calls[0].url,ORIGIN+'/api/member');
  assert.equal(reopened.proxyCalls.length,0,'reopening never automatically enables proxy');
  assert.equal(reopened.get('local-connect').attributes['aria-pressed'],'true');
  await reopened.click('local-connect');
  assert.equal(reopened.get('member-state').textContent,'服务未配置');
  assert.equal(reopened.store.get(PREFERENCE).enabled,false);
});

test('sandbox trusted button and Enter preview without native form submission or duplicate requests',async()=>{
  for(const input of ['click','keydown']){
    const e=await runtime();await e.click('local-connect');
    const field=e.get('redeem-code');field.value='DEMO-VIP-01';field.listeners.input();
    const target=input==='click'?e.get('redeem'):field;
    let prevented=0;
    const event={key:'Enter',isTrusted:false,preventDefault(){prevented++}};
    target.listeners[input](event);await e.flush();
    assert.equal(e.calls.filter(row=>row.url.endsWith('/preview')).length,0);
    target.listeners[input]({...event,isTrusted:true});
    e.get('redeem-form').listeners.submit({...event,isTrusted:true});
    await e.flush();
    assert(prevented>0,'cancel the browser form default in the sandbox');
    assert.equal(e.calls.filter(row=>row.url.endsWith('/preview')).length,1);
    assert.equal(e.get('redeem-preview').hidden,false);
    assert.equal(e.fixture.ledger.size,0,'preview still needs explicit redemption confirmation');
  }
});

test('unknown redeem acknowledgement survives reopen and only status query resolves it; no duplicate consumption',async()=>{
  const e=await runtime({network:async(args,fixture)=>fixtureRequest(fixture,{...args,
    headers:{...args.config.headers,...(args.url.endsWith('/redeem')?{'X-Fixture-Drop-Ack':'1'}:{})}})});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  assert.equal(e.fixture.ledger.size,1);assert(e.store.get(RECOVERY));
  assert.equal(e.get('recovery').hidden,false);
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.get('redeem-form').hidden,true);
  assert.equal(reopened.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  await reopened.click('recovery-check');
  assert.equal(reopened.store.get(RECOVERY),null);
  assert.equal(reopened.get('member-state').textContent,'权益有效');
  assert.equal(reopened.calls.filter(row=>row.url.endsWith('/status')).length,1);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(reopened.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
});

test('pending or missing fixture ledger remains locked, and dev journal cannot recover in production',async()=>{
  const store=new Map([[PREFERENCE,{schemaVersion:1,enabled:true}],
    [RECOVERY,{schemaVersion:2,serviceOrigin:ORIGIN,toolId:'ai-vip-share',packageVersion:'1.3.6',
      accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()}]]);
  const e=await runtime({store});
  await e.click('recovery-check');assert(store.get(RECOVERY));
  assert.match(e.get('redeem-error').textContent,/最终结论/);
  const production=await runtime({store,developmentProfile:null});
  assert.equal(production.calls.length,0);assert.equal(production.get('recovery-check').disabled,true);
  assert(store.get(RECOVERY));
});

test('1.3.5 production recovery journal remains valid and cannot be consumed by development service',async()=>{
  const record={schemaVersion:1,toolId:'ai-vip-share',packageVersion:'1.3.5',accountId:'old-account',
    idempotencyKey:randomUUID(),createdAt:Date.now()};
  const e=await runtime({store:new Map([[RECOVERY,record]])});
  await e.click('local-connect');
  assert.equal(e.calls.length,0);assert.deepEqual(e.store.get(RECOVERY),record);
  assert.equal(e.get('recovery-check').disabled,true);
  assert.doesNotMatch(e.get('recovery-status').textContent,/版本或身份无法/);
});

test('revoked trusted development availability ignores late member result and retains STOP for owned proxy',async()=>{
  let reply;
  const e=await runtime({network:async args=>new Promise(resolve=>{reply=resolve})});
  await e.click('local-connect');
  assert(reply);e.setStatus({...owned});await e.click('proxy-refresh');
  assert.equal(e.get('local-development').hidden,true);
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
  reply({status:200,data:{schemaVersion:1,serverNow:Date.now(),account:{state:'bound',
    id:'local-fixture-account',displayNameMasked:'m***'},entitlements:[],redemptions:[]}});
  await flush();assert.equal(e.get('member-state').textContent,'服务未配置');
  await e.click('proxy-toggle');assert.equal(e.get('proxy-state').textContent,'已停止');
});

test('local fixture technical activation never grants member feature, and foreign origins remain refused',async()=>{
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN});
  const lease=await fixtureRequest(fixture,{method:'POST',url:ORIGIN+'/api/activate',
    headers:{'X-OpenDesk-Local-Test':'1'},data:{code:'LOCAL-DEV-ONLY',deviceId:'test-device'}});
  assert.equal(lease.status,200);
  const member=await fixtureRequest(fixture,{method:'GET',url:ORIGIN+'/api/member',headers:{'X-OpenDesk-Local-Test':'1'}});
  assert.deepEqual(member.data.entitlements,[]);assert.deepEqual(member.data.redemptions,[]);
  const refused=await fixtureRequest(fixture,{method:'GET',url:ORIGIN+'/api/member',
    headers:{'X-OpenDesk-Local-Test':'1',Origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}});
  assert.equal(refused.status,403);assert.equal(refused.data.error,'E_BROWSER_ORIGIN_DISABLED');
  const missingHeader=await fixtureRequest(fixture,{method:'GET',url:ORIGIN+'/api/member',headers:{}});
  assert.equal(missingHeader.status,403);
});

test('development revocation during write-ahead read creates no recovery record and remains retryable',async()=>{
  const entered=deferred(),resume=deferred();let hold=false;
  const e=await runtime({beforeStorageGet:async payload=>{
    if(hold&&payload.key===RECOVERY){hold=false;entered.resolve();await resume.promise;}
  }});
  await e.click('local-connect');await e.preview();
  hold=true;e.get('redeem-confirm').listeners.click({isTrusted:true});
  await entered.promise;
  e.setStatus({...released});await e.click('proxy-refresh');
  assert.equal(e.get('member-state').textContent,'服务未配置');
  resume.resolve();await flush();
  assert.equal(e.store.get(RECOVERY)??null,null);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===RECOVERY).length,0);
  assert.equal(e.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  assert.equal(e.get('recovery').hidden,true,'known pre-write cancellation cannot invent unknown storage effects');
  e.setStatus({...released,developmentProfile:profile});await e.click('proxy-refresh');
  assert.equal(e.get('redeem-code').disabled,false);
  await e.preview();await e.click('redeem-confirm');
  assert.equal(e.fixture.ledger.size,1,'safe cancellation permits one later user-confirmed redemption');
  assert.equal(e.get('member-state').textContent,'权益有效');
});

test('development revocation during recovery write preserves dev origin and allows status-only reconciliation',async()=>{
  const entered=deferred(),resume=deferred();let hold=false;
  const e=await runtime({afterStorageSet:async payload=>{
    if(hold&&payload.key===RECOVERY&&payload.value){hold=false;entered.resolve();await resume.promise;}
  }});
  await e.click('local-connect');await e.preview();
  hold=true;e.get('redeem-confirm').listeners.click({isTrusted:true});
  await entered.promise;
  e.setStatus({...released});await e.click('proxy-refresh');
  resume.resolve();await flush();
  const record=clone(e.store.get(RECOVERY));
  assert.equal(record.schemaVersion,2);assert.equal(record.serviceOrigin,ORIGIN);
  assert.equal(record.accountId,'local-fixture-account');
  assert.equal(e.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  assert.equal(e.get('recovery-check').disabled,true,'production cannot query a development transaction');
  e.setStatus({...released,developmentProfile:profile});await e.click('proxy-refresh');
  assert.equal(e.get('redeem-form').hidden,true);
  await e.click('recovery-check');
  assert.equal(e.calls.filter(row=>row.url.endsWith('/status')).length,1);
  assert.equal(e.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  assert.deepEqual(e.store.get(RECOVERY),record,'unknown final state keeps the original development journal');
});

test('development revocation and restoration during recovery read invalidates the original revision',async()=>{
  const entered=deferred(),resume=deferred();let hold=false;
  const e=await runtime({beforeStorageGet:async payload=>{
    if(hold&&payload.key===RECOVERY){hold=false;entered.resolve();await resume.promise;}
  }});
  await e.click('local-connect');await e.preview();
  hold=true;e.get('redeem-confirm').listeners.click({isTrusted:true});
  await entered.promise;
  e.setStatus({...released});await e.click('proxy-refresh');
  e.setStatus({...released,developmentProfile:profile});await e.click('proxy-refresh');
  assert.equal(e.get('member-state').textContent,'尚未开通','same service mode is restored before the old read finishes');
  resume.resolve();await flush();
  assert.equal(e.store.get(RECOVERY)??null,null,'a new service revision cannot reuse the old redemption intent');
  assert.equal(e.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===RECOVERY).length,0);
  assert.equal(e.get('recovery').hidden,true);
});
