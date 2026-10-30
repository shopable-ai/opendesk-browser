// Assertions for actual browser input -> original NetworkService -> native Fetch
// -> independent Node server. This is NOT installed App/Authority execution.
import assert from 'node:assert/strict';
import {click,fill,until} from './native-session.mjs';

export async function checkHeaderTransitions({page,browser,modulePath,seen,streams,release}){
  const eventStart=browser.events.length;
  await page.read(`import(${JSON.stringify(modulePath)}).then(m=>m.mountTransitionProbe())`);
  const history=()=>page.read('structuredClone(globalThis.httpHeaderTransitions.history)');
  const active=()=>page.read('globalThis.httpHeaderTransitions.active?.run.runId');
  const configure=async(headers,mode='page',timeout=5000)=>{
    await fill(page,'#probe-headers',JSON.stringify(headers));
    await page.read(`document.querySelector('#probe-mode').value=${JSON.stringify(mode)}`);
    await fill(page,'#probe-timeout',String(timeout));
  };
  const start=async()=>{const before=(await history()).length;await click(page,'#probe-run');return before;};
  const finished=async before=>until(async()=>{
    const rows=await history();return rows.length===before+1?rows.at(-1):null;
  },'diagnostic outcome for original click');
  const requests=runId=>seen.filter(r=>r.runId===runId);
  const expected=[{title:'第一项',id:'1'},{title:'第二项',id:'2'},{title:'第三项',id:'3'}];
  const cases=[];
  async function complete(name,headers){
    await configure(headers);const run=await finished(await start());
    assert.equal(run.status,'completed');assert.deepEqual(run.records,expected);
    assert.deepEqual(run.snapshot,headers);assert.deepEqual(run.configured,headers);
    assert.deepEqual(requests(run.runId).map(r=>r.request),[1,2,3]);
    cases.push({name,...run});return run;
  }
  const a={Accept:'text/html','X-Client-Tag':'header-A'};
  const b={Accept:'application/xhtml+xml','X-Client-Tag':'header-B'};
  await complete('A',a);await complete('B',b);await complete('deleted',{});

  await configure(a,'hold');const bindingBefore=await start();
  const bindingId=await until(active,'active binding diagnostic');
  await until(()=>requests(bindingId).length===1,'first request held by independent server');
  await fill(page,'#probe-headers',JSON.stringify(b));
  assert.equal(await active(),bindingId,'Editor change must not start a new run');
  assert.equal(await page.read('document.querySelector("#probe-run").disabled'),true);
  release(bindingId);
  const binding=await finished(bindingBefore);
  assert.equal(binding.runId,bindingId);assert.deepEqual(binding.snapshot,a);
  assert.equal(binding.status,'completed');assert.deepEqual(binding.records,expected);
  cases.push({name:'inflight-edit-stays-A',nextEditor:b,...binding});

  for(const [name,timeout] of [['stop',5000],['timeout',1500]]){
    await configure({'X-Client-Tag':'header-'+name},'slow',timeout);
    const before=await start(),runId=await until(active,'active '+name+' diagnostic');
    await until(()=>streams.some(s=>s.runId===runId),'actual streaming '+name+' request');
    if(name==='stop')await click(page,'#probe-stop');
    const run=await finished(before);
    assert.equal(run.runId,runId);assert.equal(run.error,name==='stop'?'E_CANCELLED':'E_TIMEOUT');
    assert.equal(run.status,name==='stop'?'stopped':'error');
    assert.deepEqual(run.pages,[]);assert.deepEqual(run.records,[]);
    assert.equal(run.submitted.length,1,'No subsequent page dispatched after '+name);
    await until(()=>streams.find(s=>s.runId===runId)?.closed,'server observes '+name+' close');
    const stream=streams.find(s=>s.runId===runId);
    assert.equal(stream.finished,false);
    cases.push({name,...run,serverStream:{...stream},scope:'TRANSPORT_ONLY_NOT_HOST_RETIREMENT'});
  }

  const invalid=[...['User-Agent','uSeR-aGeNt','Cookie','Authorization','Host','Origin','Referer','Sec-CH-UA']
    .map(name=>({Accept:'text/html',[name]:'fixture-only'})),
    {'X-Test':'value\r\nInjected: bad'},{'X-Test':1},null,[]];
  for(const headers of invalid){
    await configure(headers);const run=await finished(await start());
    assert.equal(run.status,'error');assert.equal(run.error,'E_CONFIG_UNSUPPORTED');
    assert.deepEqual(run.submitted,[]);assert.deepEqual(run.authorizations,[]);
    assert.deepEqual(requests(run.runId),[],'Rejected configuration never reaches server');
    cases.push({name:'rejected',...run});
  }
  await complete('recovery',{'X-Client-Tag':'header-recovery'});

  const negativeObservationMs=1000;
  await page.read(`new Promise(ok=>setTimeout(ok,${negativeObservationMs}))`);
  const live=await page.read('globalThis.httpHeaderTransitions.readLogs()');
  const events=browser.events.slice(eventStart).filter(e=>e.sessionId===page.sessionId);
  const wire=[];
  for(const run of cases){
    assert.equal(run.click.isTrusted,true,'Real browser input must invoke the click handler');
    if(run.name==='stop')assert.equal(run.stopClick.isTrusted,true);
    const belongs=entry=>new URL(entry.url).searchParams.get('runId')===run.runId;
    assert.deepEqual(live.submitted.filter(belongs),run.submitted,'No late dispatch for '+run.name);
    assert.deepEqual(live.authorizations.filter(belongs),run.authorizations,'No late authorization for '+run.name);
    assert.equal(requests(run.runId).length,run.submitted.length,'One server request per actual submission');
    for(const submitted of run.submitted){
      const target=new URL(submitted.url),request=Number(target.searchParams.get('request'));
      assert.equal(target.searchParams.get('runId'),run.runId);
      assert.equal(submitted.credentials,'omit');assert.equal(submitted.redirect,'manual');
      const normalized=Object.fromEntries(Object.entries(run.snapshot).map(([k,v])=>[k.toLowerCase(),v]));
      assert.deepEqual(submitted.headers,normalized);
      const server=requests(run.runId).find(r=>r.request===request);
      const sent=events.find(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===submitted.url);
      assert(sent,'CDP request event for '+submitted.url);
      const extra=events.find(e=>e.method==='Network.requestWillBeSentExtraInfo'&&e.params.requestId===sent.params.requestId);
      assert(extra,'CDP ExtraInfo for '+submitted.url);
      const observed=Object.fromEntries(Object.entries(extra.params.headers).map(([k,v])=>[k.toLowerCase(),v]));
      for(const name of ['accept','x-client-tag']){
        const expected=name==='accept'?(normalized[name]??'*/*'):normalized[name];
        assert.equal(server.headers[name],expected,'Server '+name+' for '+run.name);
        assert.equal(observed[name],expected,'CDP '+name+' for '+run.name);
        if(expected!==undefined){
          const raw=server.rawHeaders.findIndex((h,i)=>i%2===0&&h.toLowerCase()===name);
          assert(raw>=0);assert.equal(server.rawHeaders[raw+1],expected);
        }
      }
      assert.equal(server.headers.cookie,undefined);assert.equal(server.headers.authorization,undefined);
      wire.push({runId:run.runId,request,url:submitted.url,cdpRequestId:sent.params.requestId,
        submitted:submitted.headers,networkHeaders:extra.params.headers,serverRawHeaders:server.rawHeaders});
    }
  }
  assert.equal(new Set(cases.map(r=>r.runId)).size,cases.length,'Distinct diagnostic run identities');
  return {scope:'CLICKABLE_LOOPBACK_DIAGNOSTIC_NOT_INSTALLED_APP',cases,wire,negativeObservationMs,
    installedRunId:'NOT_AVAILABLE_NO_HTTP_ENTRY',hostRetirement:'NOT_TESTED'};
}

// Called after the owned browser and server have closed: no request arriving
// after the in-page assertions may hide in an otherwise passing raw report.
export function checkFinalTransitionRequests(transitions,seen){
  const expected=transitions.cases.flatMap(run=>run.submitted.map(row=>new URL(row.url).pathname+new URL(row.url).search));
  const observed=seen.filter(row=>row.url.startsWith('/transition/')).map(row=>row.url);
  assert.deepEqual(observed,expected,'Final server audit must include exactly the correlated dispatches');
  assert.equal(seen.filter(row=>!row.url.startsWith('/transition/')&&row.url!=='/favicon.ico').length,0,
    'No uncorrelated endpoint requests during transitions');
  return {status:'PASS_AFTER_BROWSER_AND_SERVER_CLOSED',requests:observed.length};
}
