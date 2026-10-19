import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectCloudRequestSamples} from '../../src/ui/cloud-status-presentation.js';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';
const read=path=>readFile(path,'utf8');

test('Side Panel keeps Cloud as a dedicated product tab and development-only Debug at the end',async()=>{
  const [html,nav,shell]=await Promise.all([read('src/ui/tool.html'),
    read('src/ui/react/tabs/navigation.tsx'),read('src/ui/react/app-shell.tsx')]);
  const tabs=[...html.matchAll(/data-workbench-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(tabs,['tasks','tools','workflow','develop','cloud','debug']);
  assert.match(html,/id="tab-cloud"/);
  assert.match(nav,/data-workbench-tab=\{tab.key\}/);
  assert.match(shell,/<SidebarNavigation/);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
});

test('only tab navigation scrolls horizontally and Cloud cards wrap on narrow panels',async()=>{
  const css=await read('src/ui/tool-shell.css');
  assert.match(css,/\.workbench-nav\{[^}]*overflow-x:auto;overflow-y:hidden;/);
  assert.match(css,/\.workbench-nav button\{flex:0 0 auto;min-width:50px;/);
  assert.match(css,/\.cloud-overview-metrics\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:270px\)\{\.cloud-overview-metrics\{grid-template-columns:1fr\}/);
  assert.match(css,/#workspace-content\{[^}]*overflow-y:auto/);
});

test('hosting control rules match the dedicated Cloud container and wrap action buttons',async()=>{
  const [html,css,react,auth]=await Promise.all([read('src/ui/tool.html'),
    read('src/ui/tool-shell.css'),read('src/ui/react/tabs/cloud.tsx'),
    read('src/ui/react/tabs/cloud-authorization.tsx')]);
  assert.match(html,/<link\b[^>]*\bhref="cloud-hosting\.css"/);
  assert.match(css,/\.cloud-request-samples li\{flex-wrap:wrap/);
  assert.match(css,/\.cloud-request-pagination\{display:flex/);
  assert.match(react,/className="cloud-requests od-surface"/);
  assert.match(auth,/className="cloud-action-row"/);
  assert.match(auth,/id="cloud-stop"/);
});

test('Cloud controls exist once across React and trusted legacy forms; refresh remains read-only',async()=>{
  const [html,cloud,react,appShell,settings,auth]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/cloud-hosting.js'),
    read('src/ui/react/tabs/cloud.tsx'),read('src/ui/react/app-shell.tsx'),
    read('src/ui/react/tabs/cloud-settings.tsx'),read('src/ui/react/tabs/cloud-authorization.tsx')]);
  for(const id of ['cloud-hosting','cloud-pair','cloud-unpair','cloud-refresh'])
    assert.equal((settings.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  for(const id of ['cloud-approve','cloud-stop'])
    assert.equal((auth.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  for(const id of ['cloud-overview-refresh','cloud-request-samples','cloud-first-run'])
    assert.ok(react.includes('id="'+id+'"'),id);
  assert.match(appShell,/<CloudConnectionPage/);
  assert.match(cloud,/async function dispatchNext\(/);
  assert.match(cloud,/onRefresh:\(\)=>action\(\(\)=>\{\},true\)/);
  assert.match(cloud,/reactUI\.renderCloudPage\(/);
  assert.doesNotMatch(html,/id="cloud-hosting"/);
});

test('cloud request previews project whitelisted states rather than IDs or result data',()=>{
  const samples=projectCloudRequestSamples({requests:[{
    requestId:'REQUEST_SECRET',runId:'RUN_SECRET',provider:{url:'https://secret.example'},
    taskTitle:'用户安装的表单任务',state:'permitted',runState:'running',retirementState:'released',receipt:{token:'HIDDEN'}
  }]});
  assert.equal(samples.length,1);
  assert.equal(samples[0].title,'用户安装的表单任务');
  assert.equal(samples[0].state,'已取得许可');assert.equal(samples[0].run,'运行中');
  assert.equal(samples[0].receipt,'回执已确认');
  assert.doesNotMatch(JSON.stringify(samples),/SECRET|HIDDEN|https?:\/\//);
  assert.deepEqual(projectCloudRequestSamples({requests:[]}),[]);
  assert.equal(projectCloudRequestSamples({requests:[{state:'https://secret.example'}]})[0].state,'状态未识别');
});

const readyStatus={provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true,
  siteAuthorization:'granted',slotState:'available',pendingResources:false};
const sample=(row,status=readyStatus)=>projectCloudRequestSamples({...status,requests:[row]})[0];

test('request previews distinguish waiting, execution, saved results, retirement and receipts',()=>{
  const cases=[
    [{state:'waiting'},'等待浏览器开始执行','结果保存未确认','资源释放未确认','回执未确认'],
    [{state:'prepared',runState:'preparing',retirementState:'not-started'},'等待执行许可','结果保存未确认','资源尚未释放','回执未确认'],
    [{state:'permitted',runState:'running',resultId:'RESERVED_SECRET',retirementState:'not-started'},'任务正在执行','结果保存未确认','资源尚未释放','回执未确认'],
    [{state:'cancellation-pending',runState:'stopping',retirementState:'not-started'},'停止已请求，等待执行结束及资源释放','结果保存未确认','资源尚未释放','回执未确认'],
    [{state:'permitted',runState:'completed',retirementState:'fenced'},'结果已保存，等待资源释放','结果已保存','资源释放中','回执未确认'],
    [{state:'finished',runState:'stopped',retirementState:'fenced'},'执行已停止，等待资源释放','结果已保存','资源释放中','回执未确认'],
    [{state:'finished',runState:'completed',retirementState:'released'},'等待提供者确认回执','结果已保存','资源已释放','回执未确认'],
    [{state:'finished',runState:'completed',retirementState:'released',receipt:{}},'','结果已保存','资源已释放','回执已确认'],
    [{state:'permitted',runState:'settling',resultId:'RESERVED_SECRET'},'等待结果保存确认','结果保存未确认','资源释放未确认','回执未确认'],
    [{state:'permitted',runState:'retiring',retirementState:'fenced'},'等待资源释放，结果尚待确认','结果保存未确认','资源释放中','回执未确认']
  ];
  for(const [row,reason,result,settlement,receipt] of cases){
    const value=sample(row);
    assert.equal(value.reason,reason);assert.equal(value.result,result);
    assert.equal(value.settlement,settlement);assert.equal(value.receipt,receipt);
    assert.doesNotMatch(JSON.stringify(value),/SECRET/);
  }
});

test('waiting reasons conservatively follow hosting prerequisites',()=>{
  for(const [override,reason] of [
    [{provider:null},'等待配对提供者'],[{enabled:false},'托管已关闭，等待重新启用'],
    [{online:false},'等待提供者连接'],[{reconciled:false},'等待连接对账'],
    [{hostReady:false},'等待浏览器执行宿主就绪'],[{slotAvailable:false,slotState:'retirement-pending'},'等待原任务资源释放']
  ])assert.equal(sample({state:'waiting'},{...readyStatus,...override}).reason,reason);
});

test('only fully confirmed successful completion hides a historical cloud cancellation reason',()=>{
  const completed={state:'finished',runState:'completed',retirementState:'released',receipt:{token:'RECEIPT_SECRET'},reason:'E_CLOUD_CANCELLED'};
  const before=structuredClone(completed),value=sample(completed);
  assert.equal(value.state,'已完成');assert.equal(value.run,'已完成');assert.equal(value.reason,'');
  assert.doesNotMatch(JSON.stringify(value),/取消|失败|SECRET/);assert.deepEqual(completed,before);
  for(const override of [
    {state:'cancelled'},{runState:'stopped'},{runState:'failed'},{runState:'interrupted'},
    {runState:null},{retirementState:'fenced'},{receipt:null}
  ])assert.match(sample({...completed,...override}).reason,/云请求已取消或租约已到期/);
  assert.equal(sample({...completed,state:'cancelled'}).state,'已取消');
  assert.equal(sample({...completed,runState:'failed'}).run,'失败');
  assert.equal(sample({...completed,reason:'E_CLOUD_REVOKED'}).reason,'本机托管授权已撤销');
});

test('unknown states and reasons stay conservative, bounded and secret free',()=>{
  for(const unsafe of ['https://SECRET.example/failure','constructor','__proto__','toString']){
    const value=sample({state:unsafe,runState:unsafe,retirementState:unsafe,reason:unsafe,receipt:null});
    assert.equal(value.state,'状态未识别');assert.equal(value.run,'执行状态未识别');
    assert.equal(value.result,'结果保存未确认');assert.equal(value.settlement,'资源释放未确认');
    assert.match(value.reason,/待核对/);
    assert.doesNotMatch(JSON.stringify(value),/SECRET|https?:\/\/|constructor|__proto__|toString/);
  }
  assert.match(sample({state:'OUTCOME_UNKNOWN',runState:'paused_unknown'}).reason,/执行结果待核对，暂不重试/);
  assert.equal(projectCloudRequestSamples({requests:[{state:'waiting'}]},0).length,0);
  assert.equal(projectCloudRequestSamples({requests:Array(8).fill({state:'waiting'})},100).length,5);
});

function hostingFixture({tab='cloud'}={}){
  let current;
  return {document:{documentElement:{dataset:{opendeskTab:tab}},getElementById:()=>null},
    reactUI:{cloudPageMounted:true,renderCloudPage(next){current=next;}},
    model:()=>current};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('My hosting status displays saved stopped results and pending release with read-only refresh',async()=>{
  const f=hostingFixture();let reads=0;
  const row={state:'finished',runState:'stopped',retirementState:'fenced',reason:'E_CLOUD_CANCELLED'};
  const cloud={cloudStatus:async()=>{reads++;return {...readyStatus,slotAvailable:false,tasks:[{}],requests:[row]};},
    cloudNext:()=>assert.fail('read-only refresh cannot claim')};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:true}});
  try{
    await flush();await flush();const before=reads;
    await f.model().onRefresh();await f.model().pairing.onRefresh();
    assert.equal(reads,before+2);
    assert.match(f.model().requests.rows[0].summary,/结果已保存.*资源释放中.*回执未确认.*等待资源释放/);
    assert.match(f.model().overview.summary,/结果已保存|资源释放/);
  }finally{hosting.dispose();}
});

test('My hosting readiness and unreadable status never expose raw errors or stale request samples',async()=>{
  const f=hostingFixture();let error=false;
  const cloud={cloudStatus:async()=>{if(error)throw {code:'E_SECRET_TOKEN',message:'https://SECRET.example'};
    return {...readyStatus,hostReady:false,requests:[{state:'waiting'}]};}};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:true}});
  try{
    await flush();await flush();assert.equal(f.model().pairing.brief,'宿主未就绪');
    assert.match(f.model().overview.summary,/等待浏览器执行宿主就绪/);
    error=true;await f.model().pairing.onRefresh();
    assert.equal(f.model().overview.myState,'状态不可读取');
    assert.match(f.model().requests.emptyText,/请求状态暂不可读取/);
    assert.doesNotMatch(JSON.stringify(f.model()),/SECRET|https?:\/\//);
  }finally{hosting.dispose();}
});

test('pending server revocation blocks new pairing and both refresh gestures stay read-only',async()=>{
  const f=hostingFixture();let reads=0,state='pending';
  const forbidden=()=>assert.fail('refresh cannot pair or claim');
  const cloud={cloudStatus:async()=>{reads++;return {provider:null,enabled:false,revocation:{state},requests:[]};},
    cloudPair:forbidden,cloudNext:forbidden,cloudResolve:forbidden};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:false}});
  try{
    await flush();await flush();
    assert.equal(f.model().pairing.brief,'本机已停止；服务端撤销待确认');
    assert.equal(f.model().pairing.canPair,false);
    const before=reads;
    await f.model().pairing.onRefresh();await f.model().onRefresh();
    assert.equal(reads,before+2);
    state='confirmed';await f.model().onRefresh();
    assert.equal(f.model().pairing.brief,'撤销已确认');
    assert.equal(f.model().pairing.canPair,true);
    state='SECRET';await f.model().onRefresh();
    assert.equal(f.model().pairing.canPair,false);
    assert.match(f.model().overview.myState,/撤销状态待核对/);
    assert.doesNotMatch(JSON.stringify(f.model()),/SECRET/);
  }finally{hosting.dispose();}
});

test('waiting follows current website authorization and original slot reasons',()=>{
  for(const [siteAuthorization,reason] of [
    ['revoked','目标网站访问已撤销'],['unknown','目标网站授权待核对'],['none','尚无已批准网站范围']
  ])assert.match(sample({state:'waiting'},{...readyStatus,siteAuthorization}).reason,new RegExp(reason));
  for(const [slotState,reason] of [
    ['preview','等待预览结束'],['local-running','等待本地任务'],['cloud-running','等待云任务'],
    ['stopping','等待原运行停止'],['retirement-pending','等待原任务资源释放'],
    ['outcome-unknown','原运行结果待核对'],['unknown','执行槽状态待核对']
  ])assert.match(sample({state:'waiting'},{...readyStatus,slotAvailable:false,slotState}).reason,new RegExp(reason));
  const missing={provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true};
  assert.match(sample({state:'waiting'},missing).reason,/目标网站授权待核对/);
  assert.match(sample({state:'waiting'},{...readyStatus,slotState:undefined}).reason,/执行槽状态待核对/);
  assert.match(sample({state:'waiting'},{...readyStatus,pendingResources:undefined}).reason,/待处理资源状态待核对/);
});

test('unknown native effects remain independent of interrupted saved results and retirement',()=>{
  const row={state:'cancellation-pending',runState:'interrupted',retirementState:'fenced',
    outcomeUnknown:true,reason:'E_CLOUD_CANCELLED',resultId:'PRIVATE_RESULT'};
  const before=structuredClone(row),value=sample(row);
  assert.equal(value.state,'取消处理中');assert.equal(value.run,'已中断');assert.equal(value.result,'结果已保存');
  assert.equal(value.settlement,'资源释放中');assert.equal(value.receipt,'回执未确认');
  assert.match(value.reason,/网页副作用待核对，请勿重试该请求/);
  assert.deepEqual(row,before);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_RESULT/);
  for(const outcomeUnknown of [false,undefined,'SECRET']){
    assert.doesNotMatch(sample({...row,outcomeUnknown}).reason,/网页副作用待核对|SECRET/);
  }
  assert.match(sample({...row,retirementState:'released',receipt:true}).reason,/网页副作用待核对/);
});

test('unknown outcome reason uses a safe whitelist without changing interrupted native facts',()=>{
  const row={state:'OUTCOME_UNKNOWN',runState:'interrupted',retirementState:'fenced',
    outcomeUnknown:true,reason:'E_OUTCOME_UNKNOWN',resultId:'PRIVATE_RESULT',receipt:null};
  const before=structuredClone(row),value=sample(row);
  assert.equal(value.state,'结果待核对');assert.equal(value.run,'已中断');assert.equal(value.result,'结果已保存');
  assert.equal(value.settlement,'资源释放中');assert.equal(value.receipt,'回执未确认');
  assert.match(value.reason,/原执行副作用或结果待核对，暂不重试/);
  assert.match(value.reason,/网页副作用待核对，请勿重试该请求/);
  assert.doesNotMatch(value.reason,/状态原因待核对|E_OUTCOME_UNKNOWN|PRIVATE/);
  assert.deepEqual(row,before);
  const paused=sample({...row,runState:'paused_unknown',outcomeUnknown:false});
  assert.equal(paused.result,'结果保存未确认');
  assert.match(paused.reason,/原执行副作用或结果待核对，暂不重试/);
  assert.doesNotMatch(paused.reason,/网页副作用待核对/);
  const malicious=sample({...row,reason:'E_OUTCOME_UNKNOWN https://SECRET.example'});
  assert.match(malicious.reason,/状态原因待核对/);assert.doesNotMatch(malicious.reason,/SECRET|https?:\/\//);
});

test('My displays current grants, bounded totals, and stopped pending resources without historical samples',async()=>{
  const f=hostingFixture(),calls=[];
  let response={...readyStatus,enabled:false,siteAuthorization:'revoked',slotAvailable:false,
    slotState:'retirement-pending',pendingResources:true,requestTotal:37,requests:[]};
  const cloud={cloudStatus:async request=>{calls.push(request);return response},
    cloudNext:()=>assert.fail('read-only refresh cannot claim')};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:true}});
  try{
    await flush();await flush();
    assert.match(f.model().overview.summary,/已关闭.*目标网站访问已撤销.*仍有待处理资源/);
    assert.equal(f.model().overview.slot,'等待资源释放');
    assert.equal(f.model().overview.requests,'37');
    response={...readyStatus,requestTotal:37,requests:Array(5).fill({state:'waiting'})};
    await f.model().pairing.onRefresh();
    assert.match(f.model().pairing.status,/历史云请求 37 条.*最近 5 条统计/);
    assert.deepEqual(calls[0],{includeRequests:false});
    assert.ok(calls.filter(x=>x.includeRequests!==false).every(x=>x.limit===5));
  }finally{hosting.dispose();}
});

test('read failure clears every affirmative metric and blocks pairing approval while refresh and console remain usable',async()=>{
  const f=hostingFixture();let failed=false,consoleOpens=0;
  const cloud={cloudStatus:async()=>{if(failed)throw {code:'E_PRIVATE',message:'SECRET https://private.example'};return readyStatus}};
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},tabs:{create:async()=>{consoleOpens++;}}};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,client:{cloud},
    host:{executionPending:true},api});
  try{
    await flush();await flush();assert.equal(f.model().overview.connection,'已连接');
    failed=true;await f.model().onRefresh();
    for(const id of ['provider','connection','host','slot','tasks','requests'])
      assert.equal(f.model().overview[id],'待核对',id);
    assert.equal(f.model().pairing.canPair,false);
    assert.equal(f.model().authorization.canApprove,false);
    await f.model().onOpenConsole();assert.equal(consoleOpens,1);
    assert.doesNotMatch(JSON.stringify(f.model()),/PRIVATE|SECRET|https?:\/\//);
    failed=false;await f.model().onRefresh();
    assert.equal(f.model().overview.connection,'已连接');
    assert.equal(f.model().overview.slot,'空闲');
  }finally{hosting.dispose();}
});

test('operation rejection and local approval validation preserve trusted status and use separate safe feedback',async()=>{
  const f=hostingFixture();let reads=0,approvals=0;
  const cloud={cloudStatus:async()=>{reads++;return {...readyStatus,enabled:false}},
    cloudApprove:async()=>{approvals++;throw {code:'E_PRIVATE_SECRET',message:'https://SECRET.example'};}};
  const mh='a'.repeat(64),sh='b'.repeat(64);
  const catalog={catalog:[{taskId:'PRIVATE_TASK',version:'1.0.0',manifestHash:mh,stage:'available',
    verification:{manifestHash:mh,sourceHash:sh},
    manifest:{title:'已验证任务',program:{sourceHash:sh},siteOrigins:['https://example.test']}}],
    installed:[{taskId:'PRIVATE_TASK',version:'1.0.0',manifestHash:mh,
      installationId:'install-one',generation:1,enabled:true}]};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud,request:async()=>catalog},host:{executionPending:true}});
  try{
    await flush();await flush();const before=reads;
    await f.model().authorization.onApprove();
    assert.match(f.model().pairing.status,/请先核对所选任务/);
    assert.equal(approvals,0);assert.equal(reads,before);
    f.model().authorization.onConsent(true);
    await f.model().authorization.onApprove();
    assert.match(f.model().pairing.status,/请选择 1–32 项已验证/);
    const selected=f.model().authorization.tasks[0];
    f.model().authorization.onSelection(selected.key,true);
    assert.equal(f.model().authorization.consent,false);
    f.model().authorization.onConsent(true);
    await f.model().authorization.onApprove();
    assert.equal(approvals,1);assert.equal(reads,before);
    assert.match(f.model().pairing.status,/操作未完成，请检查连接与授权（E_CLOUD）/);
    assert.doesNotMatch(f.model().pairing.status,/SECRET|https?:\/\//);
    assert.equal(f.model().overview.connection,'已连接');
    await f.model().onRefresh();assert.equal(reads,before+1);
  }finally{hosting.dispose();}
});

test('missing facts never advertise readiness even when legacy booleans are true',async()=>{
  const f=hostingFixture(),cloud={cloudStatus:async()=>({provider:{},enabled:true,online:true,reconciled:true,
    hostReady:true,slotAvailable:true,requests:[]})};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:true}});
  try{
    await flush();await flush();assert.equal(f.model().pairing.brief,'网站授权待核对');
    assert.equal(f.model().overview.slot,'执行槽状态待核对');
    assert.match(f.model().overview.summary,/目标网站授权待核对.*待处理资源状态待核对/);
    assert.doesNotMatch(f.model().overview.myState,/可用/);
  }finally{hosting.dispose();}
});

test('periodic polling stays cheap between bounded refreshes and failed cheap reads clear stale facts',async t=>{
  const f=hostingFixture({tab:'tasks'});let timestamp=6000,scheduled,failed=false;const calls=[];
  t.mock.method(Date,'now',()=>timestamp);
  t.mock.method(globalThis,'setTimeout',(fn,delay)=>{assert.equal(delay,2000);scheduled=fn;return 1;});
  const cloud={cloudStatus:async request=>{
    calls.push(request);if(failed)throw {message:'SECRET'};
    return {...readyStatus,requestTotal:request.includeRequests===false?null:90,requests:[]};
  },cloudNext:()=>assert.fail('pending local execution must not claim')};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:true}});
  try{
    await flush();await flush();assert.deepEqual(calls,[{includeRequests:false}]);
    timestamp=8000;await scheduled();
    assert.deepEqual(calls,[{includeRequests:false},{includeRequests:false}]);
    failed=true;timestamp=10000;await scheduled();
    for(const id of ['provider','connection','host','slot','tasks','requests'])
      assert.equal(f.model().overview[id],'待核对');
    failed=false;timestamp=22000;await scheduled();
    assert.deepEqual(calls.slice(-2),[{includeRequests:false},{limit:5}]);
    assert.equal(f.model().overview.requests,'90');
  }finally{hosting.dispose();}
});

test('dispatch rejection is operation feedback and does not erase successful status reads',async()=>{
  const f=hostingFixture();let claims=0;
  const cloud={cloudStatus:async()=>readyStatus,cloudNext:async()=>{claims++;throw {code:'E_PRIVATE',message:'SECRET'};}};
  const hosting=createCloudHosting({document:f.document,reactUI:f.reactUI,
    client:{cloud},host:{executionPending:false}});
  try{
    await flush();await flush();assert.equal(claims,1);
    assert.equal(f.model().overview.connection,'已连接');
    assert.match(f.model().pairing.status,/操作未完成，请检查连接与授权（E_CLOUD）/);
    assert.doesNotMatch(f.model().pairing.status,/状态暂不可读取|SECRET/);
  }finally{hosting.dispose();}
});

