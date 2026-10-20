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
  developmentProfile=profile,getStatus,network,beforeStorageGet,afterStorageSet,receiptTransform,cookieSetMany,
  performanceClock=performance}={}){
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,node(id)]));
  const calls=[],storageCalls=[],proxyCalls=[],cookieCalls=[];
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
    const result=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(receiptTransform&&result.data?.status==='redeemed')result.data=receiptTransform(clone(result.data));
    return result;
  };
  const managed={getStatus:async()=>getStatus?getStatus():clone(current),
    requestEnable:async args=>{proxyCalls.push({action:'enable',...clone(args)});current={...owned,developmentProfile};return clone(current)},
    requestDisable:async()=>{proxyCalls.push({action:'disable'});current={...released,developmentProfile};return clone(current)}};
  const window={OpenDeskTool:{root:{querySelector:id=>nodes.get(id.slice(1))},request:storage},
    OpenDeskSDK:{browser:{network:{request},proxy:{managed},cookies:{setMany:async args=>{
      cookieCalls.push(clone(args));return cookieSetMany?cookieSetMany(args):{
        saved:args.cookies.length,verified:args.cookies.length,
        results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
    }},tabs:{create:async()=>{throw Error('unused')}}}}};
  vm.runInNewContext(script,{window,document:{createElement:()=>node()},URL,Date,Intl,performance:performanceClock,
    crypto:{randomUUID}}, {timeout:2000});
  await flush();
  const get=name=>nodes.get('ai-vip-'+name);
  const click=async(name,trusted=true)=>{get(name).listeners.click({isTrusted:trusted});await flush()};
  return {store,fixture,get,click,calls,storageCalls,proxyCalls,cookieCalls,
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
  assert.equal(journal.value.packageVersion,'1.3.8');assert(!JSON.stringify(journal).includes('DEMO-VIP-01'));
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
  assert.match(e.get('feature-redeem').textContent,/输入框暂不显示/);
  assert.match(e.get('feature-cookie').textContent,/生产目标未配置/);
  assert.match(e.get('feature-shop').textContent,/商城地址未配置/);
  assert.match(e.get('feature-proxy').textContent,/生产代理未配置/);
  assert.match(e.get('demo-availability').textContent,/旧开发版或包来源不匹配/);
  assert.equal(e.get('local-development').hidden,true);
  assert.equal(e.get('redeem-form').hidden,true);
  assert.equal(e.calls.length,0);assert.equal(e.cookieCalls.length,0);assert.equal(e.proxyCalls.length,0);
});

test('feature status follows explicit local selection and revocation without claiming commercial success',async()=>{
  const e=await runtime();
  assert.match(e.get('demo-availability').textContent,/入口可用/);
  assert.match(e.get('service-mode').textContent,/正式服务未配置/);
  await e.click('local-connect');
  assert.match(e.get('service-mode').textContent,/本地演示已选择/);
  assert.match(e.get('feature-member').textContent,/实际查询结果/);
  assert.match(e.get('feature-redeem').textContent,/先预检再确认/);
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

const COOKIE_KEY='aiVipCookieDeliveryR137';
const syntheticDelivery=()=>({schemaVersion:1,deliveryId:randomUUID(),targetUrl:ORIGIN+'/session/',
  expiresAt:Date.now()+120000,cookies:[{name:'synthetic_session',value:'synthetic-test-only',
    path:'/session/',httpOnly:true,secure:false,sameSite:'lax',expirationDate:Date.now()/1000+3600}]});
async function cookieRuntime(options={}){
  const transform=options.receiptTransform;
  const e=await runtime({...options,receiptTransform:r=>{
    r.cookieDelivery=syntheticDelivery();return transform?transform(r):r;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  return e;
}
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
    assert.match(e.get('cookie-status').textContent,/已拒绝 Cookie 交付/);
    assert.equal(e.cookieCalls.length,0);
    assert.equal(e.store.get(RECOVERY),null,'invalid Cookie data must not misreport redemption as unknown');
  }
  const malformed=await cookieRuntime({receiptTransform:r=>({...r,cookieDelivery:'{invalid JSON'})});
  assert.equal(malformed.cookieCalls.length,0);assert.match(malformed.get('cookie-status').textContent,/已拒绝/);
});
test('partial, unknown and malformed per-item receipts remain bounded and never replay on click or reopening',async()=>{
  for(const kind of ['partial','unknown','bad-count','bad-index','saved-unverified','missing-code']){
    const e=await cookieRuntime({receiptTransform:r=>{
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
  await e.preview();assert.equal(e.get('redeem-confirm').disabled,false);
  const count=e.fixture.ledger.size;
  e.get('cookie-install').listeners.click({isTrusted:true});await entered.promise;
  assert.equal(e.get('redeem-confirm').disabled,true);
  assert.equal(e.get('redeem-code').disabled,true);
  assert.equal(e.get('recovery-check').disabled,true);
  await e.click('redeem-confirm');await e.click('recovery-check');
  assert.equal(e.fixture.ledger.size,count);
  resume.resolve();await e.flush();
  assert.equal(e.get('redeem-confirm').disabled,false);
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
  await e.preview();await e.click('redeem-confirm');await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,2);assert.equal(e.store.get(COOKIE_KEY).state,'success');
  const reopened=await runtime({store:e.store,fixture:e.fixture,
    receiptTransform:r=>({...r,cookieDelivery:a})});
  await reopened.preview();await reopened.click('redeem-confirm');await reopened.click('cookie-install');
  assert.equal(reopened.cookieCalls.length,0);
  assert.equal(reopened.store.get(COOKIE_KEY).deliveryId,b.deliveryId);
});
