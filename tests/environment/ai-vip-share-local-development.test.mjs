import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import {createLocalFixture} from '../../examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs';

const base='examples/sidebar-tools/ai-vip-share/';
const [html,script]=await Promise.all(['src/App.jsx','src/main.js'].map(p=>readFile(base+p,'utf8')));
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
  developmentProfile=profile,getStatus,network,beforeStorageGet,afterStorageSet,receiptTransform,cookieSetMany,
  performanceClock=performance,cookieScopeOverride,currentPage,pollTimers=false}={}){
  // Historical VM business tests simulate a development panel that now exists
  // ONLY in the test harness, not in the installable React product DOM.
  const testOnly=['ai-vip-local-development','ai-vip-local-connect','ai-vip-local-status',
    'ai-vip-service-mode','ai-vip-demo-availability','ai-vip-feature-member',
    'ai-vip-feature-redeem','ai-vip-feature-cookie','ai-vip-feature-shop',
    'ai-vip-feature-proxy','ai-vip-shared-section','ai-vip-shared-account',
    'ai-vip-shared-status'];
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id));
  assert(testOnly.every(id=>!ids.has(id)),
    'Development/account allocation diagnostics must not appear in shipped App.jsx');
  const nodes=new Map([...ids,...testOnly].map(id=>[id,node(id)]));
  const calls=[],storageCalls=[],proxyCalls=[],cookieCalls=[],tabCalls=[],pageCalls=[],timers=[],toolStates=[];
  let page=currentPage??{status:'unavailable'};
  let current={...released,...(developmentProfile?{developmentProfile}: {})};
  const storage=async(operation,payload)=>{
    if(operation==='currentPage.info'){
      pageCalls.push(operation);return clone(typeof page==='function'?await page():page);
    }
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
    const result=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(cookieScopeOverride&&result.data?.sharedAccounts)for(const row of result.data.sharedAccounts.accounts)row.cookieScope=clone(cookieScopeOverride);
    if(receiptTransform&&result.data?.cookieDelivery)result.data=receiptTransform(clone(result.data));
    return result;
  };
  const managed={getStatus:async()=>getStatus?getStatus():clone(current),
    requestEnable:async args=>{proxyCalls.push({action:'enable',...clone(args)});current={...owned,developmentProfile};return clone(current)},
    requestDisable:async()=>{proxyCalls.push({action:'disable'});current={...released,developmentProfile};return clone(current)}};
  const window={OpenDeskTool:{root:{querySelector:id=>nodes.get(id.slice(1))},request:storage,
    setState:state=>toolStates.push(clone(state))},
    OpenDeskSDK:{browser:{network:{request},proxy:{managed},cookies:{setMany:async args=>{
      cookieCalls.push(clone(args));return cookieSetMany?cookieSetMany(args):{
        saved:args.cookies.length,verified:args.cookies.length,
        results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
    }},tabs:{create:async args=>{tabCalls.push(clone(args));return {tabRef:'fixture-tab'};}}}}};
  // Capture polling without creating timers; each check is driven explicitly below.
  if(pollTimers)window.setInterval=(callback,ms)=>{timers.push({callback,ms});return timers.length;};
  // Test-only instrumentation remains INSIDE mountController after the React
  // lifecycle wrapper; do not add testing exports to production code.
  const anchor='  return release;\n  }\n  // Legacy Node VM fixtures';
  assert.ok(script.includes(anchor),'AI VIP controller instrumentation anchor changed');
  const instrumented=script.replace(anchor,
    '  window.__activationTests={activationCodeFromPage,checkActivationPage,claimActivation:value=>claimActivation(value,serviceRevision)};\n'+anchor);
  vm.runInNewContext(instrumented,{window,document:{createElement:()=>node()},URL,Date,Intl,performance:performanceClock,
    TextEncoder,Uint8Array,crypto:{randomUUID,subtle:webcrypto.subtle}}, {timeout:2000});
  await flush();
  const get=name=>nodes.get('ai-vip-'+name);
  const click=async(name,trusted=true)=>{get(name).listeners.click({isTrusted:trusted});await flush()};
  return {store,fixture,get,click,calls,storageCalls,proxyCalls,cookieCalls,tabCalls,pageCalls,timers,toolStates,
    activation:window.__activationTests,setPage(value){page=value},
    async checkPage(){await window.__activationTests.checkActivationPage();await flush();},
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
  assert.match(e.get('verified').textContent,/服务端已核验/);
  assert.equal(e.get('proxy-toggle').hidden,false);
  assert.equal(e.get('proxy-toggle').disabled,false);
  assert.equal(e.store.get(RECOVERY),null);
  const journal=e.storageCalls.find(row=>row.operation==='storage.set'&&row.key===RECOVERY&&row.value);
  assert.equal(journal.value.schemaVersion,2);assert.equal(journal.value.serviceOrigin,ORIGIN);
  assert.equal(journal.value.packageVersion,'1.4.2');assert(!JSON.stringify(journal).includes('DEMO-VIP-01'));
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

test('feature status explains hidden production controls without granting development or issuing requests',async()=>{
  const e=await runtime({developmentProfile:null});
  assert.match(e.get('service-mode').textContent,/正式服务未配置/);
  assert.match(e.get('feature-member').textContent,/账号服务未配置/);
  assert.match(e.get('feature-redeem').textContent,/输入框仅可查看、不可提交/);
  assert.match(e.get('feature-cookie').textContent,/生产目标未配置/);
  assert.match(e.get('feature-shop').textContent,/商城地址未配置/);
  assert.match(e.get('feature-proxy').textContent,/生产代理未配置/);
  assert.match(e.get('demo-availability').textContent,/旧开发版或包来源不匹配/);
  assert.equal(e.get('local-development').hidden,true);
  assert.equal(e.get('redeem-form').hidden,false,'disabled form keeps first-install layout');
  assert.equal(e.get('redeem-code').disabled,true);
  assert.equal(e.get('redeem').disabled,true);
  assert.equal(e.calls.length,0);assert.equal(e.cookieCalls.length,0);assert.equal(e.proxyCalls.length,0);
});

test('feature status follows explicit local selection and revocation without claiming commercial success',async()=>{
  const e=await runtime();
  assert.match(e.get('demo-availability').textContent,/入口可用/);
  assert.match(e.get('service-mode').textContent,/正式服务未配置/);
  await e.click('local-connect');
  assert.match(e.get('service-mode').textContent,/本地演示已选择/);
  assert.match(e.get('feature-member').textContent,/实际查询结果/);
  assert.match(e.get('feature-redeem').textContent,/预检.*确认/);
  assert.match(e.get('feature-cookie').textContent,/仅演示测试站点/);
  assert.match(e.get('feature-proxy').textContent,/演示兑换授予/);
  assert.equal(e.get('proxy-toggle').hidden,true);
  e.setStatus({...released,developmentProfile:null});await e.click('proxy-refresh');
  assert.match(e.get('service-mode').textContent,/正式服务未配置/);
  assert.match(e.get('demo-availability').textContent,/入口不可用/);
  assert.equal(e.get('local-development').hidden,true);
  assert.equal(e.cookieCalls.length,0);assert.equal(e.proxyCalls.length,0);
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
  // The official 1.3.7 journal must survive the in-place 1.3.8 package upgrade.
  const prior=e.store.get(RECOVERY);
  e.store.set(RECOVERY,{...prior,packageVersion:'1.3.7'});
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.get('redeem-form').hidden,true);
  assert.equal(reopened.calls.filter(row=>row.url.endsWith('/redeem')).length,0);
  await reopened.click('recovery-check');
  assert.equal(reopened.store.get(RECOVERY),null);
  assert.equal(reopened.get('member-state').textContent,'权益有效');
  assert.equal(reopened.calls.filter(row=>row.url.endsWith('/status')&&!row.data?.operation).length,1);
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

const COOKIE_KEY='aiVipCookieDeliveryR137';
for(const outcome of ['success','failure'])test(`manual activation waits for delayed Cookie recovery ${outcome}`,async()=>{
  const entered=deferred(),resume=deferred();
  const e=await runtime({store:new Map([[PREFERENCE,{schemaVersion:1,enabled:true}]]),
    beforeStorageGet:async payload=>{
      if(payload.key!==COOKIE_KEY)return;
      entered.resolve();await resume.promise;
      if(outcome==='failure')throw Error('Cookie journal unavailable');
    }});
  await entered.promise;
  try{
    assert.equal(e.get('member-state').textContent,'尚未开通','member recovery has completed');
    assert.equal(e.get('recovery').hidden,true,'empty redemption journal has recovered');
    assert(e.storageCalls.some(row=>row.operation==='storage.get'&&row.key===RECOVERY));
    await e.preview();
    await e.click('redeem-confirm');
    assert.equal(e.calls.filter(row=>/\/(preview|redeem)$/.test(row.url)).length,0,
      'direct manual handlers must not preflight or confirm while Cookie recovery is pending');
    assert.equal(e.get('redeem-code').disabled,true);
    assert.equal(e.get('redeem').disabled,true);
    assert.equal(e.get('redeem-confirm').disabled,true);
  }finally{resume.resolve();await e.flush();}
  if(outcome==='failure'){
    assert.match(e.get('cookie-status').textContent,/恢复记录无法核对/);
    await e.preview();await e.click('redeem-confirm');
    assert.equal(e.calls.filter(row=>/\/(preview|redeem)$/.test(row.url)).length,0);
    assert.equal(e.get('redeem-code').disabled,true);
    assert.equal(e.get('redeem-confirm').disabled,true);
  }else{
    assert.equal(e.get('redeem-code').disabled,false,'Cookie recovery completion rerenders the form');
    assert.equal(e.get('redeem').disabled,false,'the retained code can now be preflighted');
    await e.preview();assert.equal(e.get('redeem-confirm').disabled,false);
    await e.click('redeem-confirm');assert.equal(e.fixture.ledger.size,1);
  }
});

for(const outcome of ['fault','unknown','partial'])test(`pending manual preview cannot confirm after Cookie ${outcome}`,async()=>{
  let failRead=false;
  const e=await runtime({beforeStorageGet:async payload=>{
    if(failRead&&payload.key===COOKIE_KEY)throw Error('Cookie journal unavailable');
  },cookieSetMany:async()=>{
    if(outcome==='unknown')throw Error('Cookie acknowledgement lost');
    return {saved:1,verified:1,stopped:true,results:[{index:0,saved:true,verified:true},
      {index:1,saved:false,verified:false,code:'E_GRANT_REVOKED'}]};
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.preview('DEMO-VIP-02');
  assert.equal(e.get('redeem-confirm').disabled,false);
  await e.click('shared-receive');
  failRead=outcome==='fault';await e.click('cookie-install');
  assert.equal(e.get('redeem-preview').hidden,false,'the reviewed preview is still pending');
  if(outcome==='fault'){
    assert.match(e.get('cookie-status').textContent,/恢复存储无法核对/);
    assert.equal(e.store.get(COOKIE_KEY)??null,null);
  }else assert.equal(e.store.get(COOKIE_KEY).state,outcome);
  const before=e.calls.length;
  await e.click('redeem-confirm');
  assert.equal(e.calls.length,before,'confirmation cannot issue even an identity request after Cookie fault/unknown');
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.get('redeem-confirm').disabled,true);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===RECOVERY&&row.value).length,1);
});

const syntheticDelivery=()=>({schemaVersion:1,deliveryId:randomUUID(),targetUrl:ORIGIN+'/session/',
  expiresAt:Date.now()+120000,cookies:[{name:'synthetic_session',value:'synthetic-test-only',
    path:'/session/',httpOnly:true,secure:false,sameSite:'lax',expirationDate:Date.now()/1000+3600}]});
async function cookieRuntime(options={}){
  const transform=options.receiptTransform;
  const e=await runtime({...options,cookieScopeOverride:options.cookieScopeOverride||[{name:'synthetic_session',path:'/session/'}],receiptTransform:r=>{
    r.cookieDelivery=syntheticDelivery();return transform?transform(r):r;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  return e;
}
// Change the assignment through the real in-memory server protocol, never a UI selector.
async function allocateOnServer(fixture,code='DEMO-VIP-02'){
  const headers={'X-OpenDesk-Local-Test':'1'};
  const preview=await fixtureRequest(fixture,{method:'POST',url:ORIGIN+'/api/preview',headers,data:{code}});
  assert.equal(preview.status,200);
  const redeemed=await fixtureRequest(fixture,{method:'POST',url:ORIGIN+'/api/redeem',headers,
    data:{previewId:preview.data.previewId,accountId:preview.data.accountId,idempotencyKey:randomUUID()}});
  assert.equal(redeemed.status,200);return redeemed.data;
}
test('manual activation acquires only the server assignment and server reassignment replaces the approved session slots',async()=>{
  const e=await runtime();await e.click('local-connect');
  assert.equal(e.get('shared-section').hidden,true);
  await e.preview();await e.click('redeem-confirm');
  assert.equal(e.get('shared-account').textContent,'公司共享账号 A');
  assert.equal(e.get('shared-account').listeners.change,undefined);
  assert.match(e.get('shared-status').textContent,/服务器已交付.*账号 A/);
  assert.equal(e.cookieCalls.length,0,'activation obtains data; the Host still reviews the exact Cookie batch');
  await e.click('cookie-install');
  assert.equal(e.store.get(COOKIE_KEY).sharedAccountId,'shared-a');
  await allocateOnServer(e.fixture);await e.click('refresh');
  assert.equal(e.get('shared-account').textContent,'公司共享账号 B');
  await e.click('shared-receive');await e.click('cookie-install');
  assert.equal(e.store.get(COOKIE_KEY).sharedAccountId,'shared-b');
  assert.equal(e.store.get(COOKIE_KEY).state,'success');
  assert.equal(e.cookieCalls.length,2);
  for(const call of e.calls.filter(row=>row.data?.operation==='sharedSession')){
    assert.deepEqual(Object.keys(call.data).sort(),['accountId','operation','redemptionId','requestId']);
    assert(!Object.hasOwn(call.data,'sharedAccountId'),'client cannot select the server account');
  }
  for(const batch of e.cookieCalls){
    assert.deepEqual(batch.cookies.map(row=>row.name).sort(),['opendesk_fixture_context','opendesk_fixture_session']);
    assert.equal(batch.url,ORIGIN+'/session/');
    for(const row of batch.cookies)assert(!JSON.stringify([...e.store.values()]).includes(row.value));
  }
  assert.equal(e.tabCalls.length,2);
  assert(e.tabCalls.every(row=>row.url===ORIGIN+'/session/'));
  const reopened=await runtime({fixture:e.fixture,store:e.store});
  assert.equal(reopened.get('shared-account').textContent,'公司共享账号 B');
  assert.equal(reopened.cookieCalls.length,0);assert.equal(reopened.get('cookie-install').hidden,true);
});
test('a late delivery for the previous server assignment cannot replace a freshly assigned session',async()=>{
  const hold=deferred(),entered=deferred();let delay=false;
  const e=await runtime({network:async(args,fixture)=>{
    const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(delay&&args.data?.operation==='sharedSession'&&response.data.sharedAccountId==='shared-a'){
      entered.resolve();await hold.promise;
    }
    return response;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  delay=true;e.get('shared-receive').listeners.click({isTrusted:true});await entered.promise;
  await allocateOnServer(e.fixture);await e.click('refresh');await e.click('shared-receive');
  assert.equal(e.get('shared-account').textContent,'公司共享账号 B');
  hold.resolve();await e.flush();
  assert.match(e.get('shared-status').textContent,/服务器已交付.*账号 B/);
  await e.click('cookie-install');assert.equal(e.store.get(COOKIE_KEY).sharedAccountId,'shared-b');
});
test('shared invalid identity, incomplete scope and expiry never write or announce a successful switch',async()=>{
  for(const fault of ['identity','redemption','account','target','scope','expiry']){
    const e=await runtime({network:async(args,fixture)=>{
      const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
      if(args.data?.operation==='sharedSession'){
        if(fault==='identity')response.data.sharedAccountId='shared-b';
        if(fault==='redemption')response.data.redemptionId='different-redemption';
        if(fault==='account')response.data.accountId='different-account';
        if(fault==='target')response.data.cookieDelivery.targetUrl='https://unrelated.test/';
        if(fault==='scope')response.data.cookieDelivery.cookies.pop();
        if(fault==='expiry')response.data.cookieDelivery.expiresAt=Date.now()-1000;
      }
      return response;
    }});
    await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
    assert.match(e.get('shared-status').textContent,/未取得有效/);
    await e.click('cookie-install');assert.equal(e.cookieCalls.length,0,fault);
    assert.doesNotMatch(e.get('shared-status').textContent,/切换成功/);
  }
});
test('shared partial and unknown writes block new delivery, reopening and automatic replay',async()=>{
  for(const state of ['partial','unknown']){
    const e=await runtime({cookieSetMany:async()=>{
      if(state==='unknown')throw Error('ack lost');
      return {saved:1,verified:1,stopped:true,results:[{index:0,saved:true,verified:true},{index:1,saved:false,verified:false,code:'E_GRANT_REVOKED'}]};
    }});
    await e.click('local-connect');await e.preview();await e.click('redeem-confirm');await e.click('cookie-install');
    assert.equal(e.store.get(COOKIE_KEY).state,state);
    await e.preview('DEMO-VIP-02');await e.click('redeem-confirm');
    assert.equal(e.fixture.ledger.size,1,'unknown or partial Cookie effects block further activation');
    await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
    const reopened=await runtime({fixture:e.fixture,store:e.store});
    await reopened.click('shared-receive');await reopened.click('cookie-install');
    assert.equal(reopened.cookieCalls.length,0);
  }
});
test('shared permission revoked before confirmation cancels the batch without replacing the current session',async()=>{
  let revoked=false;
  const e=await runtime({network:async(args,fixture)=>{
    const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(revoked&&new URL(args.url).pathname==='/api/member')delete response.data.sharedAccounts;
    return response;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  revoked=true;await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,0);assert.equal(e.get('cookie-install').hidden,true);
});
test('shared activation cannot fall back to a redeem Cookie when the following directory is revoked',async()=>{
  let redeemed=false;
  const e=await runtime({network:async(args,fixture)=>{
    const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(args.url.endsWith('/redeem'))redeemed=true;
    if(redeemed&&args.url.endsWith('/member'))delete response.data.sharedAccounts;
    return response;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  assert.equal(e.get('member-state').textContent,'权益有效');
  assert.equal(e.get('cookie-install').hidden,true);
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,0);
});
test('shared expired unsubmitted delivery permits explicit fresh acquisition without another activation',async()=>{
  let offset=0;
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,now:()=>Date.now()+offset});
  const e=await runtime({fixture,performanceClock:{now:()=>performance.now()+offset}});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  offset=121000;await e.click('cookie-install');assert.equal(e.cookieCalls.length,0);
  assert.equal(e.get('shared-receive').disabled,false);
  await e.click('shared-receive');await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,1);assert.equal(e.fixture.ledger.size,1);
});
test('shared delayed directory response cannot rewind server time and extend a delivery expiry',async()=>{
  let offset=0,delay=false;
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,now:()=>Date.now()+offset});
  const e=await runtime({fixture,performanceClock:{now:()=>performance.now()+offset},network:async(args,fixture)=>{
    const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(delay&&args.url.endsWith('/member'))offset=121000;
    return response;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  offset=119000;delay=true;await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,0);assert.equal(e.get('cookie-install').hidden,true);
});
test('Cookie delivery waits for explicit user intent, uses public setMany, records no values and never replays after reopen',async()=>{
  const e=await cookieRuntime();
  assert.equal(e.get('cookie-install').disabled,false);
  assert.equal(e.cookieCalls.length,0);
  await e.click('cookie-install',false);assert.equal(e.cookieCalls.length,0);
  await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,1);
  assert.equal(e.cookieCalls[0].url,ORIGIN+'/session/');
  assert.match(e.get('cookie-status').textContent,/全部 Cookie 已写入并核验/);
  const saved=e.store.get(COOKIE_KEY);
  assert.equal(saved.state,'success');assert.equal(saved.results[0].verified,true);
  assert(!JSON.stringify([...e.store.values()]).includes('synthetic-test-only'));
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.cookieCalls.length,0);
  assert.match(reopened.get('cookie-status').textContent,/全部 Cookie 已写入并核验/);
  assert.equal(reopened.get('cookie-install').hidden,true);
  await e.click('proxy-toggle');await e.click('proxy-toggle');
  assert.equal(e.store.get(COOKIE_KEY).state,'success');assert.equal(e.cookieCalls.length,1);
});
test('Cookie parser refuses cross-origin, script fields, store/partition overrides, invalid times and oversized data before SDK',async()=>{
  const mutations=[d=>{d.targetUrl='https://chatgpt.com/'},d=>{d.targetUrl=ORIGIN+'/session/?token=x'},
    d=>{d.scripts=['forbidden']},d=>{d.cookies[0].domain='.example.com'},
    d=>{d.cookies[0].storeId='1'},d=>{d.cookies[0].partitionKey={topLevelSite:'https://other.test'}},
    d=>{d.expiresAt=Date.now()-1000},d=>{d.cookies[0].expirationDate=Date.now()},
    d=>{d.cookies[0].expirationDate=Date.now()/1000-10},d=>{d.cookies[0].sameSite='None'},
    d=>{d.cookies[0].sameSite='no_restriction'},d=>{d.cookies[0].path='bad'},
    d=>{d.cookies[0].value='x'.repeat(4097)},d=>{d.cookies=[...d.cookies,...d.cookies]},
    d=>{d.cookies=Array.from({length:51},(_,i)=>({...d.cookies[0],name:'c'+i}))},
    d=>{d.cookies=Array.from({length:4},(_,i)=>({...d.cookies[0],name:'c'+i,value:'x'.repeat(4000)}))}];
  for(const mutate of mutations){
    const e=await cookieRuntime({receiptTransform:r=>{mutate(r.cookieDelivery);return r}});
    assert.equal(e.get('cookie-install').hidden,true);
    assert.match(e.get('shared-status').textContent,/未取得有效/);
    assert.equal(e.cookieCalls.length,0);
    assert.equal(e.store.get(RECOVERY),null,'invalid Cookie data must not misreport redemption as unknown');
  }
  const malformed=await cookieRuntime({receiptTransform:r=>({...r,cookieDelivery:'{invalid JSON'})});
  assert.equal(malformed.cookieCalls.length,0);assert.match(malformed.get('shared-status').textContent,/未取得有效/);
});
test('partial, unknown and malformed per-item receipts remain bounded and never replay on click or reopening',async()=>{
  for(const kind of ['partial','unknown','bad-count','bad-index','saved-unverified','missing-code']){
    const e=await cookieRuntime({cookieScopeOverride:[{name:'synthetic_session',path:'/session/'},{name:'synthetic_second',path:'/session/'}],receiptTransform:r=>{
      r.cookieDelivery.cookies.push({...r.cookieDelivery.cookies[0],name:'synthetic_second'});return r},
      cookieSetMany:async()=>kind==='bad-index'?{saved:1,verified:1,results:[{index:1,saved:true,verified:true}]}:
        kind==='saved-unverified'?{saved:1,verified:0,results:[{index:0,saved:true,verified:false}],stopped:true}:
        kind==='missing-code'?{saved:0,verified:0,results:[{index:0,saved:false,verified:false}],stopped:true}:
        {saved:kind==='bad-count'?2:1,verified:1,stopped:true,results:[
          {index:0,saved:true,verified:true},{index:1,saved:false,verified:false,
            code:kind==='unknown'?'E_OUTCOME_UNKNOWN':'E_GRANT_REVOKED'}]}});
    await e.click('cookie-install');
    assert.equal(e.store.get(COOKIE_KEY).state,kind==='partial'?'partial':'unknown');
    await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
    const reopened=await runtime({store:e.store,fixture:e.fixture});
    assert.equal(reopened.cookieCalls.length,0);assert.equal(reopened.get('cookie-install').hidden,true);
  }
});
test('known zero-effect SDK preflight allows an explicit retry after repair, with no automatic calls',async()=>{
  for(const code of ['E_SITE_GRANT_REQUIRED','E_CHROME_PERMISSION_REQUIRED','E_SCHEMA','E_LIMIT']){
    let available=false;
    const e=await cookieRuntime({cookieSetMany:async args=>{
      if(!available)throw Object.assign(Error('no permission'),{code});
      return {saved:1,verified:1,results:[{index:0,saved:true,verified:true}]};
    }});
    await e.click('cookie-install');
    assert.equal(e.store.get(COOKIE_KEY).state,'failed');assert.equal(e.cookieCalls.length,1);
    await e.flush();assert.equal(e.cookieCalls.length,1);
    assert.equal(e.get('cookie-install').disabled,false);
    available=true;await e.click('cookie-install');
    assert.equal(e.store.get(COOKIE_KEY).state,'success');assert.equal(e.cookieCalls.length,2);
  }
});
test('Cookie write-ahead/readback precedes effects and protects lost SDK acknowledgements',async()=>{
  let entered=false;
  const e=await cookieRuntime({cookieSetMany:async()=>{entered=true;throw Error('ack lost')}});
  await e.click('cookie-install');assert(entered);
  assert.equal(e.store.get(COOKIE_KEY).state,'unknown');
  assert.match(e.get('cookie-status').textContent,/未知.*禁止重放/);
  assert(!JSON.stringify([...e.store.values()]).includes('synthetic-test-only'));
  const blocked=await cookieRuntime({afterStorageSet:(payload,store)=>{
    if(payload.key===COOKIE_KEY)store.delete(COOKIE_KEY);
  }});
  await blocked.click('cookie-install');assert.equal(blocked.cookieCalls.length,0);
  assert.match(blocked.get('cookie-status').textContent,/恢复存储无法核对/);
});
test('zero-effect revoked receipt remains honest and revoked development cannot submit',async()=>{
  const e=await cookieRuntime({cookieSetMany:async()=>({saved:0,verified:0,stopped:true,
    results:[{index:0,saved:false,verified:false,code:'E_GRANT_REVOKED'}]})});
  await e.click('cookie-install');assert.equal(e.store.get(COOKIE_KEY).state,'failed');
  assert.match(e.get('cookie-status').textContent,/未写入/);
  const x=await cookieRuntime({afterStorageSet:(payload)=>{
    if(payload.key===COOKIE_KEY)x?.setStatus({...released,developmentProfile:null});
  }});
  // Revoking the trusted dev profile removes the pending response and refuses a later click.
  x.setStatus({...released,developmentProfile:null});await x.click('proxy-refresh');
  await x.click('cookie-install');assert.equal(x.cookieCalls.length,0);
});
test('Cookie confirmation blocks redemption controls and handlers until its receipt settles',async()=>{
  const entered=deferred(),resume=deferred();
  const e=await cookieRuntime({cookieSetMany:async()=>{entered.resolve();await resume.promise;
    return {saved:1,verified:1,results:[{index:0,saved:true,verified:true}]};}});
  const count=e.fixture.ledger.size;
  e.get('cookie-install').listeners.click({isTrusted:true});await entered.promise;
  assert.equal(e.get('redeem-confirm').disabled,true);
  assert.equal(e.get('redeem-code').disabled,true);
  assert.equal(e.get('recovery-check').disabled,true);
  await e.preview('DEMO-VIP-02');await e.click('redeem-confirm');await e.click('recovery-check');
  assert.equal(e.fixture.ledger.size,count);
  resume.resolve();await e.flush();
  await e.preview('DEMO-VIP-02');assert.equal(e.get('redeem-confirm').disabled,false);
  await e.click('redeem-confirm');assert.equal(e.fixture.ledger.size,count+1);
});
test('expiry, account change and development revocation during persistence stay definitely unsubmitted',async()=>{
  for(const kind of ['expiry','account','revocation']){
    let account='local-fixture-account',offset=0,hold=false;
    const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,
      getMemberState:()=>({account:{state:'bound',id:account,displayNameMasked:'t***'},entitlements:[]})});
    const e=await cookieRuntime({fixture,performanceClock:{now:()=>performance.now()+offset},
      afterStorageSet:async payload=>{
        if(!hold||payload.key!==COOKIE_KEY)return;hold=false;
        if(kind==='expiry')offset=180000;
        if(kind==='account'){account='changed-account';await e.click('refresh');}
        if(kind==='revocation'){e.setStatus({...released,developmentProfile:null});await e.click('proxy-refresh');}
      }});
    hold=true;await e.click('cookie-install');
    for(let i=0;i<6&&e.get('cookie-status').textContent.startsWith('正在核对');i++)await e.flush();
    assert.equal(e.cookieCalls.length,0,kind);
    assert.equal(e.store.get(COOKIE_KEY).state,'failed',kind+' has no Cookie effects: '+e.get('cookie-status').textContent);
    assert.equal(e.get('cookie-install').hidden,true);
    assert.doesNotMatch(e.get('cookie-status').textContent,/结果未知/);
  }
});
test('success A then B survives reopen and refuses a still-valid historical A delivery',async()=>{
  const a=syntheticDelivery(),b=syntheticDelivery();let delivered=a;
  const e=await cookieRuntime({receiptTransform:r=>({...r,cookieDelivery:delivered})});
  await e.click('cookie-install');delivered=b;
  await e.preview('DEMO-VIP-02');await e.click('redeem-confirm');await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,2);assert.equal(e.store.get(COOKIE_KEY).state,'success');
  const reopened=await runtime({store:e.store,fixture:e.fixture,cookieScopeOverride:[{name:'synthetic_session',path:'/session/'}],
    receiptTransform:r=>({...r,cookieDelivery:a})});
  await reopened.click('shared-receive');await reopened.click('cookie-install');
  assert.equal(reopened.cookieCalls.length,0);
  assert.equal(reopened.store.get(COOKIE_KEY).deliveryId,b.deliveryId);
});

const ACTIVATION='aiVipActivationR140';
const activationPage=(code='DEMO-VIP-01')=>({status:'available',url:ORIGIN+'/activate?activation_code='+encodeURIComponent(code)});
const posts=(e,path)=>e.calls.filter(row=>row.method==='POST'&&row.url.endsWith(path));

test('trusted activation URL fills a manual draft; never automatically submits voucher or Cookie',async()=>{
  const e=await runtime({currentPage:activationPage(),pollTimers:true});
  assert.equal(e.timers.length,1);assert.equal(e.timers[0].ms,1200);
  assert.equal(e.calls.length,0,'opening the sandbox is not an activation');
  await e.click('local-connect');await e.checkPage();
  assert.equal(e.get('redeem-code').value,'DEMO-VIP-01');
  assert.equal(e.get('activation-hint').hidden,false);
  assert.equal(posts(e,'/preview').length,0,'URL cannot preflight without a user action');
  assert.equal(posts(e,'/redeem').length,0,'URL cannot redeem without a user action');
  assert.equal(e.store.get(ACTIVATION),undefined,'legacy URL-claim writes are no longer required');
  for(let i=0;i<3;i++)await e.checkPage();
  assert.equal(posts(e,'/preview').length,0);
  await e.preview();assert.equal(posts(e,'/preview').length,1);
  assert.equal(e.get('redeem-preview').hidden,false);
  assert.equal(e.fixture.ledger.size,0);
  await e.click('redeem-confirm',false);assert.equal(posts(e,'/redeem').length,0);
  await e.click('redeem-confirm');assert.equal(posts(e,'/redeem').length,1);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.cookieCalls.length,0,'voucher confirmation does not approve Cookie');
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
  assert.equal(e.store.get(COOKIE_KEY).sharedAccountId,'shared-a');
  assert.doesNotMatch(e.get('shared-status').textContent,/登录成功/);
  const reopened=await runtime({store:e.store,fixture:e.fixture,currentPage:activationPage()});
  await reopened.checkPage();
  assert.equal(posts(reopened,'/preview').length,0);
  assert.equal(posts(reopened,'/redeem').length,0);
  assert.equal(reopened.cookieCalls.length,0);
});

test('manual activation rejects synthetic click, Enter, submit and confirmation events',async()=>{
  const e=await runtime();await e.click('local-connect');
  const field=e.get('redeem-code');field.value='DEMO-VIP-01';field.listeners.input();
  const event={isTrusted:false,key:'Enter',preventDefault(){}};
  e.get('redeem').listeners.click(event);field.listeners.keydown(event);
  e.get('redeem-form').listeners.submit(event);await e.flush();
  assert.equal(posts(e,'/preview').length,0);assert.equal(e.store.get(ACTIVATION),undefined);
  await e.preview();await e.click('redeem-confirm',false);
  assert.equal(posts(e,'/preview').length,1);assert.equal(posts(e,'/redeem').length,0);
  await e.click('redeem-confirm');assert.equal(posts(e,'/redeem').length,1);
});

test('URL parser and live entry reject other origins, paths, malformed or repeated parameters and untrusted metadata',async()=>{
  const e=await runtime();await e.click('local-connect');
  const invalid=[
    {status:'unavailable',url:activationPage().url},null,[],{},
    {status:'available',url:3},
    ...[
      'https://127.0.0.1:7898/activate?activation_code=DEMO-VIP-01',
      'http://localhost:7898/activate?activation_code=DEMO-VIP-01',
      'http://127.0.0.1:7899/activate?activation_code=DEMO-VIP-01',
      'http://127.0.0.1:7898.evil.test/activate?activation_code=DEMO-VIP-01',
      ORIGIN+'/session/?activation_code=DEMO-VIP-01',ORIGIN+'/activate/?activation_code=DEMO-VIP-01',
      ORIGIN+'/activate',ORIGIN+'/activate?code=DEMO-VIP-01',ORIGIN+'/activate?activation_code=',
      ORIGIN+'/activate?activation_code=short',ORIGIN+'/activate?activation_code='+'a'.repeat(121),
      ORIGIN+'/activate?activation_code=invalid%20code',ORIGIN+'/activate?activation_code=invalid%0Acode',
      ORIGIN+'/activate?activation_code=DEMO-VIP-01&activation_code=DEMO-VIP-01',
      ORIGIN+'/activate?activation_code=DEMO-VIP-01&activation_code=DEMO-VIP-02',
      ORIGIN+'/activate?activation_code=DEMO-VIP-01&other=1',
      ORIGIN+'/activate?activation_code=DEMO-VIP-01#fragment',
      'http://user:password@127.0.0.1:7898/activate?activation_code=DEMO-VIP-01',
      'not-a-url','data:text/plain,activation_code=DEMO-VIP-01',
      ORIGIN+'/activate?activation_code='+'a'.repeat(2048)
    ].map(url=>({status:'available',url}))
  ];
  for(const info of invalid){
    assert.equal(e.activation.activationCodeFromPage(info),null);
    e.setPage(info);await e.checkPage();
  }
  assert.equal(posts(e,'/preview').length,0);assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.store.get(ACTIVATION),undefined);assert.equal(e.cookieCalls.length,0);
  assert.equal(e.activation.activationCodeFromPage(activationPage('a._-01')),'a._-01');
  assert.equal(e.activation.activationCodeFromPage(activationPage('a'.repeat(120))),'a'.repeat(120));
  const production=await runtime({developmentProfile:null,currentPage:activationPage()});
  assert.equal(production.activation.activationCodeFromPage(activationPage()),null);
  await production.checkPage();assert.equal(production.pageCalls.length,0);assert.equal(production.calls.length,0);
});

test('polling an activation link cannot start another request while a manual preflight is pending',async()=>{
  const entered=deferred(),resume=deferred();
  const e=await runtime({currentPage:activationPage(),network:async(args,fixture)=>{
    if(args.url.endsWith('/preview')){entered.resolve();await resume.promise;}
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  }});
  await e.click('local-connect');await e.checkPage();
  assert.equal(posts(e,'/preview').length,0);
  const pending=e.preview();await entered.promise;
  await e.checkPage();await e.checkPage();
  assert.equal(posts(e,'/preview').length,1);
  assert.equal(posts(e,'/redeem').length,0);
  resume.resolve();await pending;
  // preview() only waits for its synthetic event-loop flush, not for the held
  // Provider response. Observe the real review state before confirming.
  for(let attempt=0;attempt<10&&e.get('redeem-preview').hidden;attempt++)await e.flush();
  assert.equal(e.get('redeem-preview').hidden,false,'delayed preflight must render the reviewed voucher');
  assert.equal(e.get('redeem-confirm').disabled,false,'manual confirmation must become available');
  assert.equal(e.fixture.ledger.size,0);
  await e.click('redeem-confirm');assert.equal(posts(e,'/redeem').length,1);
});

test('closing an approved activation page removes its draft without a POST or write-ahead journal',async()=>{
  const e=await runtime({currentPage:activationPage()});
  await e.click('local-connect');await e.checkPage();
  assert.equal(e.get('redeem-code').value,'DEMO-VIP-01');
  e.setPage({status:'available',url:ORIGIN+'/session/'});
  await e.checkPage();
  assert.equal(e.get('redeem-code').value,'');
  assert.equal(e.get('activation-hint').hidden,true);
  assert.equal(posts(e,'/preview').length,0);
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.store.get(RECOVERY)??null,null);
  e.setPage(activationPage());await e.checkPage();
  assert.equal(e.get('redeem-code').value,'DEMO-VIP-01');
});

test('activation origin change or revoked read permission before manual confirmation prevents redemption',async()=>{
  for(const page of [{status:'available',url:ORIGIN+'/session/'},{status:'unavailable'}]){
    const e=await runtime({currentPage:activationPage()});
    await e.click('local-connect');await e.checkPage();await e.preview();
    assert.equal(posts(e,'/preview').length,1);
    e.setPage(page);await e.click('redeem-confirm');
    assert.equal(posts(e,'/redeem').length,0,'no irreversible voucher side effect');
    assert.equal(e.store.get(RECOVERY)??null,null);
    assert.equal(e.cookieCalls.length,0);
    assert.match(e.get('redeem-status').textContent,/未提交兑换/);
  }
});

test('unknown or partial Cookie outcomes prohibit additional manual or URL-initiated redemption',async()=>{
  for(const outcome of ['unknown','partial']){
    const e=await runtime({currentPage:activationPage('DEMO-VIP-02'),cookieSetMany:async()=>{
      if(outcome==='unknown')throw Error('ack lost');
      return {saved:1,verified:1,stopped:true,results:[
        {index:0,saved:true,verified:true},
        {index:1,saved:false,verified:false,code:'E_GRANT_REVOKED'}]};
    }});
    await e.click('local-connect');await e.preview('DEMO-VIP-01');
    await e.click('redeem-confirm');await e.click('cookie-install');
    assert.equal(e.store.get(COOKIE_KEY).state,outcome);
    await e.checkPage();await e.preview('DEMO-VIP-02');await e.click('redeem-confirm');
    assert.equal(posts(e,'/preview').length,1);assert.equal(posts(e,'/redeem').length,1);
    const reopened=await runtime({fixture:e.fixture,store:e.store,currentPage:activationPage('DEMO-VIP-02')});
    await reopened.checkPage();await reopened.preview('DEMO-VIP-02');await reopened.click('redeem-confirm');
    assert.equal(posts(reopened,'/preview').length,0);
    assert.equal(posts(reopened,'/redeem').length,0);
    assert.equal(reopened.cookieCalls.length,0);
  }
});

test('unknown voucher receipt keeps a recoverable durable journal and never silently resubmits',async()=>{
  const e=await runtime({currentPage:activationPage(),network:async(args,fixture)=>
    fixtureRequest(fixture,{...args,headers:{...args.config.headers,
      ...(args.url.endsWith('/redeem')?{'X-Fixture-Drop-Ack':'1'}:{})}})});
  await e.click('local-connect');await e.checkPage();await e.preview();
  await e.click('redeem-confirm');
  assert.equal(e.fixture.ledger.size,1);assert(e.store.get(RECOVERY));
  assert.equal(e.cookieCalls.length,0);
  assert.doesNotMatch(e.get('redeem-status').textContent,/已确认兑换成功/);
  const reopened=await runtime({fixture:e.fixture,store:e.store,currentPage:activationPage()});
  await reopened.checkPage();assert.equal(posts(reopened,'/redeem').length,0);
  await reopened.click('recovery-check');assert.equal(reopened.store.get(RECOVERY),null);
  await reopened.checkPage();assert.equal(posts(reopened,'/redeem').length,0);
});

test('source changes after durable voucher-intent persistence retain recovery without POST',async()=>{
  const e=await runtime({currentPage:activationPage(),afterStorageSet:payload=>{
    if(payload.key===RECOVERY&&payload.value)e.setPage({status:'available',url:ORIGIN+'/session/'});
  }});
  await e.click('local-connect');await e.checkPage();await e.preview();await e.click('redeem-confirm');
  assert.equal(posts(e,'/preview').length,1);
  assert.equal(posts(e,'/redeem').length,0);
  assert(e.store.get(RECOVERY),'unknown post-intent outcome must remain reconcile-only');
  assert.equal(e.cookieCalls.length,0);
  await e.checkPage();assert.equal(posts(e,'/redeem').length,0);
});

test('consumed activation clears Host draft state after the reviewed Cookie write',async()=>{
  const e=await runtime();await e.click('local-connect');
  e.get('redeem-code').value='DEMO-VIP-01';e.get('redeem-code').listeners.input();
  assert.equal(e.toolStates.at(-1)?.dirty,true);
  await e.preview();await e.click('redeem-confirm');
  assert.equal(e.toolStates.at(-1)?.dirty,true,'unwritten in-memory Cookie delivery is a pending draft');
  await e.click('cookie-install');
  assert.deepEqual(e.toolStates.at(-1),{dirty:false,busy:false});
});
