import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,deferred} from './helpers/controller-fixture.mjs';
import {readCookieJournal} from '../src/cookie-journal.js';

const KEY='aiVipCookieDeliveryR137';
const cookie=(extra={})=>({name:'__Host-session',value:'synthetic-local-only',domain:'chatgpt.com',path:'/',
  hostOnly:true,secure:true,httpOnly:true,sameSite:'lax',session:true,storeId:'0',...extra});
const input=rows=>JSON.stringify(rows??[cookie()]);
async function journal(e){return (await readCookieJournal(async()=>{
  const value=e.store.get(KEY);return {value,etag:'a'.repeat(64)};
})).value;}
async function settle(e){for(let i=0;i<30&&e.get('site-select').disabled;i++)await e.flush();}

test('local file works without member/development service, cancelled preparation leaves no secrets or writes',async()=>{
  const e=await runtime({developmentProfile:null});
  assert.equal(e.get('site-select').value,'local-chatgpt');
  await e.importFile(input());
  assert.equal(e.get('cookie-install').hidden,false);
  assert.match(e.get('site-status').textContent,/1 \/ 1.*1 项/);
  assert.match(e.get('file-summary').textContent,/文件共 1 项.*保留 1 项.*已跳过 0 项.*1 批/);
  assert.equal(e.get('file-summary').hidden,false);
  assert.equal(e.calls.length,0);assert.equal(e.cookieCalls.length,0);
  await e.click('site-cancel');
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.get('file-summary').hidden,true);
  assert.equal(e.get('file-summary').textContent,'');
  assert.equal(e.cookieCalls.length,0);
  assert.ok(!JSON.stringify([...e.store]).includes('synthetic-local-only'));
});

test('malformed/all-expired/oversized file feedback does not dispatch and later valid input recovers',async()=>{
  let contextQueries=0;
  const e=await runtime({developmentProfile:null,cookieContext:async()=>{contextQueries++;return {storeId:'0'};}});
  for(const text of ['secret invalid JSON']){
    await e.importFile(text);assert.equal(e.get('cookie-install').hidden,true);
    assert.match(e.get('site-status').textContent,/无效|不安全/);
    assert.ok(!e.get('site-status').textContent.includes('secret invalid'));
  }
  await e.importFile(input([cookie({name:'expired-secret-name',session:false,expirationDate:1})]));
  assert.match(e.get('site-status').textContent,/没有可用 Cookie.*未准备任何写入批次/);
  assert.doesNotMatch(e.get('site-status').textContent,/expired-secret-name|synthetic-local-only/);
  assert.equal(e.get('site-status').attributes['data-tone'],'error');
  assert.match(e.get('file-summary').textContent,/文件共 1 项.*保留 0 项.*已跳过 1 项/);
  assert.equal(contextQueries,0);assert.equal(e.cookieCalls.length,0);
  await e.importFile(input(),{size:65537});
  assert.match(e.get('site-status').textContent,/64 KiB/);
  await e.importFile(input());assert.equal(e.get('cookie-install').disabled,false);
  assert.equal(e.get('site-status').attributes['data-tone'],'neutral');
  assert.equal(e.cookieCalls.length,0);
});

test('context mismatch and changed context stop before writing',async()=>{
  let current='1';const e=await runtime({developmentProfile:null,cookieContext:async()=>({storeId:current})});
  await e.importFile(input());assert.match(e.get('site-status').textContent,/Store/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.match(e.get('file-summary').textContent,/文件共 1 项.*保留 1 项.*已跳过 0 项/);
  current='0';await e.importFile(input());current='1';
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,0);
});

test('each partition batch needs a new explicit confirmation; duplicate click dispatches only once, reopen never writes',async()=>{
  const gate=deferred();let first=true;
  const e=await runtime({developmentProfile:null,cookieSetMany:async args=>{
    if(first){first=false;await gate.promise;}
    return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  }});
  await e.importFile(input([cookie(),cookie({name:'partitioned',partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}})]));
  await e.click('cookie-install');await e.click('cookie-install');
  assert.equal(e.cookieCalls.length,1);
  gate.resolve();await settle(e);
  assert.equal(e.cookieCalls.length,1);assert.equal(e.tabCalls.length,0);
  assert.match(e.get('site-status').textContent,/2 \/ 2/);
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,2);assert.deepEqual(e.tabCalls,[{url:'https://chatgpt.com/'}]);
  assert.equal(e.get('site-receive').disabled,false);
  assert.deepEqual((await journal(e)).attempts.map(r=>r.state),['success','success']);
  const reopened=await runtime({store:e.store,developmentProfile:null});
  assert.equal(reopened.get('site-select').value,'local-chatgpt');
  assert.match(reopened.get('cookie-status').textContent,/本批 Cookie 已写入并核验/);
  assert.equal(reopened.get('cookie-install').hidden,true);assert.equal(reopened.cookieCalls.length,0);
  assert.ok(!JSON.stringify([...e.store]).includes('synthetic-local-only'));
});

test('late first-batch success preserves its receipt but expired remainder never claims file completion or opens website',async()=>{
  let now=Date.now();const gate=deferred();
  class Clock extends Date {static now(){return now;}}
  const e=await runtime({developmentProfile:null,dateClock:Clock,cookieSetMany:async args=>{
    await gate.promise;
    return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  }});
  await e.importFile(input([cookie(),cookie({name:'partitioned',partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}})]));
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
  now+=120001;gate.resolve();await settle(e);
  assert.equal(e.cookieCalls.length,1);assert.equal(e.tabCalls.length,0);
  assert.match(e.get('site-status').textContent,/准备已到期.*剩余 1 项未提交/);
  assert.match(e.get('cookie-status').textContent,/本批 Cookie 已写入并核验/);
  assert.doesNotMatch(e.get('cookie-status').textContent,/全部 Cookie/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.get('site-receive').disabled,false);
  assert.deepEqual((await journal(e)).attempts.map(row=>row.state),['success']);
  const reopened=await runtime({store:e.store,developmentProfile:null});
  assert.match(reopened.get('cookie-status').textContent,/本批 Cookie/);
  assert.equal(reopened.cookieCalls.length,0);assert.equal(reopened.tabCalls.length,0);
  assert.ok(!JSON.stringify([...e.store]).includes('synthetic-local-only'));
});

test('expiry before confirmation reports all unsubmitted cookies and dispatches nothing',async()=>{
  let now=Date.now();class Clock extends Date {static now(){return now;}}
  const e=await runtime({developmentProfile:null,dateClock:Clock,pollTimers:true});
  await e.importFile(input([cookie(),cookie({name:'partitioned',partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}})]));
  now+=120001;
  e.timers.find(row=>row.ms===1200).callback();await e.flush();
  assert.match(e.get('site-status').textContent,/准备已到期.*剩余 2 项未提交/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.cookieCalls.length,0);assert.equal(e.tabCalls.length,0);
  assert.equal(e.get('file-summary').textContent,'');
});

test('trusted pre-dispatch cancellation permits only another explicit click; unknown remains locked after reopen',async()=>{
  let cancel=true;
  const e=await runtime({developmentProfile:null,cookieSetMany:async()=>{
    throw Object.assign(Error('synthetic'),{code:cancel?'E_COOKIE_NOT_SUBMITTED':'E_CANCELLED'});
  }});
  await e.importFile(input());await e.click('cookie-install');await settle(e);
  assert.equal(e.get('cookie-install').disabled,false);
  assert.equal((await journal(e)).attempts[0].resolution,'not-submitted');
  assert.equal(e.cookieCalls.length,1);
  cancel=false;await e.click('cookie-install');await settle(e);
  assert.equal((await journal(e)).attempts[1].state,'unknown');
  const before=JSON.stringify(e.store.get(KEY));
  const reopened=await runtime({store:e.store,developmentProfile:null});
  assert.equal(reopened.get('site-receive').disabled,true);
  await reopened.importFile(input());assert.equal(reopened.cookieCalls.length,0);
  assert.equal(JSON.stringify(e.store.get(KEY)),before);
});


test('mixed file submits only retained cookies, keeps review counts across batches and clears on completion',async()=>{
  const partitionKey={topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false};
  const retained=[cookie(),cookie({name:'partitioned',partitionKey})];
  const e=await runtime({developmentProfile:null});
  await e.importFile(input([cookie({name:'expired',session:false,expirationDate:1}),...retained]));
  assert.match(e.get('file-summary').textContent,/文件共 3 项.*保留 2 项.*已跳过 1 项.*2 批/);
  assert.equal(e.cookieCalls.length,0);
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,1);
  assert.equal(e.get('file-summary').hidden,false);
  assert.match(e.get('site-status').textContent,/2 \/ 2/);
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,2);
  assert.deepEqual(e.cookieCalls.flatMap(batch=>batch.cookies.map(row=>row.name)),['__Host-session','partitioned']);
  assert.equal(e.get('file-summary').textContent,'');
  assert.match(e.get('site-status').textContent,/保留的各批 Cookie.*写入并核验.*目标页核对/);
  assert.doesNotMatch(e.get('site-status').textContent,/登录成功|全部已登录/);
});

test('expired partition claims still undergo current-context checks before retained rows can be prepared',async()=>{
  let queries=0;
  const e=await runtime({developmentProfile:null,cookieContext:async kind=>{
    if(kind==='store')return {storeId:'0'};
    queries++;return {partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}};
  }});
  const expired=cookie({name:'expired',session:false,expirationDate:1,
    partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:true}});
  await e.importFile(input([cookie(),expired]));
  assert.equal(queries,1);
  assert.match(e.get('site-status').textContent,/分区与当前网站不符/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.cookieCalls.length,0);
  assert.match(e.get('file-summary').textContent,/文件共 2 项.*保留 1 项.*已跳过 1 项/);
  await e.importFile(input([cookie(),{...expired,partitionKey:{...expired.partitionKey,hasCrossSiteAncestor:false}}]));
  assert.equal(queries,2);
  assert.equal(e.get('cookie-install').hidden,false);
  assert.match(e.get('file-summary').textContent,/保留 1 项.*已跳过 1 项/);
});


test('missing website permission retains non-secret file counts with no prepared batch or writes',async()=>{
  const e=await runtime({developmentProfile:null,cookieContext:async()=>{
    throw Object.assign(Error('synthetic'),{code:'E_SITE_GRANT_REQUIRED'});
  }});
  await e.importFile(input([cookie(),cookie({name:'past',session:false,expirationDate:1})]));
  assert.match(e.get('file-summary').textContent,/文件共 2 项.*保留 1 项.*已跳过 1 项/);
  assert.match(e.get('site-status').textContent,/授予 ChatGPT 网站 Cookie/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.cookieCalls.length,0);
  assert.ok(!JSON.stringify([...e.store]).includes('synthetic-local-only'));
});
