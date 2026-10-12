import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectCloudRequestSamples} from '../../src/ui/cloud-status-presentation.js';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';
const read=path=>readFile(path,'utf8');

test('Side Panel keeps hosting in My and development-only Debug at sixth',async()=>{
  const [html,work,mem,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/task-workbench.js'),
    read('src/ui/sidebar-tab-memory.js'),read('src/ui/tool-shell.js')]);
  const tabs=[...html.matchAll(/data-workbench-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(tabs,['tasks','discover','workflow','develop','tools','debug']);
  assert.doesNotMatch(html,/id="tab-cloud"|id="workbench-cloud"/);
  assert.match(work,/if\(name==='cloud'\)name='tasks'/);
  assert.doesNotMatch(shell,/setCloudAvailable/);
  assert.match(mem,/if\(saved==='cloud'\)saved='tasks'/);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('only tab navigation scrolls horizontally and Cloud cards wrap on narrow panels',async()=>{
  const css=await read('src/ui/tool-shell.css');
  assert.match(css,/\.workbench-nav\{[^}]*display:flex;[^}]*overflow-x:auto;overflow-y:hidden;/);
  assert.match(css,/\.workbench-nav button\{flex:0 0 auto;min-width:50px;/);
  assert.match(css,/\.cloud-overview-metrics\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:270px\)\{\.cloud-overview-metrics\{grid-template-columns:1fr\}/);
  assert.match(css,/#workspace-content\{[^}]*overflow-y:auto/);
});

test('hosting control rules match the live My container and wrap action buttons',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/cloud-hosting.css')]);
  const my=html.slice(html.indexOf('id="workbench-tasks"'),html.indexOf('id="workbench-tools"'));
  assert.match(my,/id="cloud-hosting"/);
  assert.match(html,/<link rel="stylesheet" href="cloud-hosting\.css">/);
  assert.doesNotMatch(css,/#workbench-cloud/);
  assert.match(css,/#workbench-tasks #cloud-hosting>div\{[^}]*display:flex;flex-wrap:wrap;gap:var\(--space-2\)/);
  assert.match(css,/#workbench-tasks #cloud-hosting>div button\{flex:1 1 130px;min-height:36px\}/);
});

test('Cloud controls exist once within My and refresh stays read-only',async()=>{
  const [html,cloud,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/cloud-hosting.js'),read('src/ui/tool-shell.js')]);
  const my=html.slice(html.indexOf('id="workbench-tasks"'),html.indexOf('id="workbench-tools"'));
  for(const id of ['cloud-hosting','cloud-pair','cloud-approve','cloud-stop','cloud-refresh','cloud-overview-refresh','cloud-request-samples'])
    assert.ok(my.includes('id="'+id+'"'),id);
  assert.match(cloud,/async function dispatchNext\(s\)/);
  assert.match(cloud,/click\('cloud-overview-refresh',async\(\)=>\{\}\)/);
  assert.match(shell,/let cloudHosting=null/);
});

test('cloud request previews project whitelisted states rather than IDs or result data',()=>{
  const samples=projectCloudRequestSamples({requests:[{
    requestId:'REQUEST_SECRET',runId:'RUN_SECRET',provider:{url:'https://secret.example'},
    state:'permitted',runState:'running',retirementState:'released',receipt:{token:'HIDDEN'}
  }]});
  assert.equal(samples.length,1);
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

function hostingFixture(){
  const element=()=>({textContent:'',disabled:false,value:'',checked:false,children:[],listeners:new Map(),
    addEventListener(type,fn){this.listeners.set(type,fn)},removeEventListener(type){this.listeners.delete(type)},
    replaceChildren(){this.children=[]},append(...children){this.children.push(...children)}});
  const map=new Map();
  return {map,document:{getElementById(id){if(!map.has(id))map.set(id,element());return map.get(id)},createElement:element}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('My hosting status displays saved stopped results and pending release with read-only refresh',async()=>{
  const {document,map}=hostingFixture();let reads=0;
  const row={state:'finished',runState:'stopped',retirementState:'fenced',reason:'E_CLOUD_CANCELLED'};
  const response={...readyStatus,slotAvailable:false,tasks:[{}],requests:[row]};
  const forbidden=()=>assert.fail('status refresh must not execute a cloud action');
  const cloud={cloudStatus:async()=>{reads++;return response},cloudNext:forbidden,cloudResolve:forbidden,
    cloudPair:forbidden,cloudApprove:forbidden,cloudStop:forbidden,cloudUnpair:forbidden};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true,start:forbidden}});
  try{
    await flush();
    const beforeRefresh=reads;
    for(const id of ['cloud-refresh','cloud-overview-refresh']){map.get(id).listeners.get('click')();await flush();}
    assert.equal(reads,beforeRefresh+2);
    assert.match(map.get('cloud-my-state').textContent,/已停止.*结果已保存.*资源释放中.*等待资源释放/);
    const detail=map.get('cloud-request-samples').children[0].children[1].textContent;
    assert.match(detail,/结果已保存.*资源释放中.*回执未确认.*等待资源释放/);
  }finally{hosting.dispose();}
});

test('My hosting readiness and unreadable status never expose raw errors or stale request samples',async()=>{
  const {document,map}=hostingFixture();let error=false;
  const cloud={cloudStatus:async()=>{if(error)throw {code:'E_SECRET_TOKEN',message:'https://SECRET.example'};
    return {...readyStatus,hostReady:false,requests:[{state:'waiting'}]}}};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
  try{
    await flush();assert.equal(map.get('cloud-brief').textContent,'宿主未就绪');
    assert.match(map.get('cloud-my-state').textContent,/等待浏览器执行宿主就绪/);
    error=true;map.get('cloud-refresh').listeners.get('click')();await flush();
    assert.equal(map.get('cloud-my-state').textContent,'状态不可读取');
    assert.match(map.get('cloud-request-samples').children[0].textContent,/请求状态暂不可读取/);
    assert.doesNotMatch([...map.values()].map(el=>el.textContent).join('\n'),/SECRET|https?:\/\//);
  }finally{hosting.dispose();}
});

test('pending server revocation blocks new pairing and both refresh gestures stay read-only',async()=>{
  const {document,map}=hostingFixture();let reads=0,state='pending';
  const forbidden=()=>assert.fail('refresh must not pair, revoke, claim or execute');
  const cloud={cloudStatus:async()=>{reads++;return {provider:null,enabled:false,revocation:{state},requests:[]}},
    cloudPair:forbidden,cloudUnpair:forbidden,cloudStop:forbidden,cloudNext:forbidden,cloudResolve:forbidden};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:false,start:forbidden}});
  try{
    await flush();assert.equal(map.get('cloud-brief').textContent,'本机已停止；服务端撤销待确认');
    assert.match(map.get('cloud-my-state').textContent,/本机已停止；服务端撤销待确认/);
    assert.match(map.get('cloud-overview-state').textContent,/本机已停止；服务端撤销待确认/);
    assert.equal(map.get('cloud-pair').disabled,true);
    const beforeRefresh=reads;
    for(const id of ['cloud-refresh','cloud-overview-refresh']){map.get(id).listeners.get('click')();await flush();}
    assert.equal(reads,beforeRefresh+2);assert.equal(map.get('cloud-pair').disabled,true);
    assert.equal(sample({state:'waiting'},{provider:null,enabled:false,revocation:{state:'pending'}}).reason,'本机已停止；服务端撤销待确认');
    state='confirmed';map.get('cloud-overview-refresh').listeners.get('click')();await flush();
    assert.equal(map.get('cloud-brief').textContent,'撤销已确认');
    assert.match(map.get('cloud-overview-state').textContent,/服务端撤销已确认/);
    assert.equal(map.get('cloud-pair').disabled,false);
    state='SECRET';map.get('cloud-refresh').listeners.get('click')();await flush();
    assert.equal(map.get('cloud-pair').disabled,true);
    assert.match(map.get('cloud-my-state').textContent,/撤销状态待核对/);
    assert.doesNotMatch([...map.values()].map(el=>el.textContent).join('\n'),/SECRET/);
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
  const {document,map}=hostingFixture();const calls=[];
  let response={...readyStatus,enabled:false,siteAuthorization:'revoked',slotAvailable:false,
    slotState:'retirement-pending',pendingResources:true,requestTotal:37,requests:[]};
  const forbidden=()=>assert.fail('read-only refresh must not execute');
  const cloud={cloudStatus:async request=>{calls.push(request);return response},cloudNext:forbidden,cloudResolve:forbidden};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true,start:forbidden}});
  try{
    await flush();
    assert.match(map.get('cloud-overview-state').textContent,/已关闭.*目标网站访问已撤销.*仍有待处理资源/);
    assert.match(map.get('cloud-my-state').textContent,/仍有待处理资源/);
    assert.equal(map.get('cloud-overview-slot').textContent,'等待资源释放');
    assert.equal(map.get('cloud-overview-requests').textContent,'37');
    response={...readyStatus,requestTotal:37,requests:Array(5).fill({state:'waiting'})};
    map.get('cloud-refresh').listeners.get('click')();await flush();
    assert.match(map.get('cloud-status').textContent,/历史云请求 37 条.*最近 5 条统计/);
    assert.deepEqual(calls[0],{includeRequests:false});
    assert.ok(calls.filter(r=>r.includeRequests!==false).every(r=>r.limit===5));
  }finally{hosting.dispose();}
});

test('read failure clears every affirmative metric and blocks pairing approval while refresh and console remain usable',async()=>{
  const {document,map}=hostingFixture();let failed=false,consoleOpens=0;
  const cloud={cloudStatus:async()=>{if(failed)throw {code:'E_PRIVATE',message:'SECRET https://private.example'};return readyStatus}};
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},tabs:{create:async()=>{consoleOpens++;}}};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true},api});
  try{
    await flush();assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
    failed=true;map.get('cloud-refresh').listeners.get('click')();await flush();
    for(const id of ['provider','connection','host','slot','tasks','requests']){
      assert.equal(map.get('cloud-overview-'+id).textContent,'待核对',id);
    }
    assert.equal(map.get('cloud-pair').disabled,true);assert.equal(map.get('cloud-approve').disabled,true);
    assert.equal(map.get('cloud-refresh').disabled,false);assert.equal(map.get('cloud-overview-refresh').disabled,false);
    map.get('cloud-open-console').listeners.get('click')();await flush();assert.equal(consoleOpens,1);
    assert.doesNotMatch([...map.values()].map(el=>el.textContent).join('\n'),/PRIVATE|SECRET|https?:\/\//);
    failed=false;map.get('cloud-overview-refresh').listeners.get('click')();await flush();
    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
    assert.equal(map.get('cloud-overview-slot').textContent,'空闲');
  }finally{hosting.dispose();}
});

test('operation rejection and local approval validation preserve trusted status and use separate safe feedback',async()=>{
  const {document,map}=hostingFixture();let reads=0,approvals=0;
  const cloud={cloudStatus:async()=>{reads++;return {...readyStatus,enabled:false}},
    cloudApprove:async()=>{approvals++;throw {code:'E_PRIVATE_SECRET',message:'https://SECRET.example'};}};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
  try{
    await flush();const initialReads=reads;
    map.get('cloud-approve').listeners.get('click')();await flush();
    assert.match(map.get('cloud-status').textContent,/请先批准所选固定任务和网站范围/);
    assert.equal(approvals,0);assert.equal(reads,initialReads);
    map.get('cloud-consent').checked=true;
    map.get('cloud-approve').listeners.get('click')();await flush();
    assert.match(map.get('cloud-status').textContent,/请先安装并选择任务/);assert.equal(approvals,0);
    map.get('task-installed-list').value='PRIVATE_TASK';
    map.get('cloud-approve').listeners.get('click')();await flush();
    assert.equal(approvals,1);assert.equal(reads,initialReads);
    assert.match(map.get('cloud-status').textContent,/操作未完成，请核对状态后再试/);
    assert.doesNotMatch(map.get('cloud-status').textContent,/状态暂不可读取|PRIVATE|SECRET|https?:\/\//);
    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
    assert.equal(map.get('cloud-overview-slot').textContent,'空闲');
    map.get('cloud-refresh').listeners.get('click')();await flush();
    assert.equal(reads,initialReads+1);
  }finally{hosting.dispose();}
});

test('missing facts never advertise readiness even when legacy booleans are true',async()=>{
  const {document,map}=hostingFixture();
  const cloud={cloudStatus:async()=>({provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true,requests:[]})};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
  try{
    await flush();assert.equal(map.get('cloud-brief').textContent,'网站授权待核对');
    assert.equal(map.get('cloud-overview-slot').textContent,'执行槽状态待核对');
    assert.match(map.get('cloud-overview-state').textContent,/目标网站授权待核对.*待处理资源状态待核对/);
    assert.doesNotMatch(map.get('cloud-my-state').textContent,/可用/);
  }finally{hosting.dispose();}
});


test('periodic polling stays cheap between bounded refreshes and failed cheap reads clear stale facts',async t=>{
  const {document,map}=hostingFixture();document.documentElement={dataset:{opendeskTab:'tasks'}};
  let timestamp=6000,scheduled,failed=false;const calls=[];
  t.mock.method(Date,'now',()=>timestamp);
  t.mock.method(globalThis,'setTimeout',(fn,delay)=>{assert.equal(delay,2000);scheduled=fn;return 1;});
  const cloud={cloudStatus:async request=>{
    calls.push(request);if(failed)throw {message:'SECRET'};
    return {...readyStatus,requestTotal:request.includeRequests===false?null:90,requests:[]};
  },cloudNext:()=>assert.fail('pending local execution must not claim')};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
  try{
    await flush();assert.deepEqual(calls,[{includeRequests:false},{limit:5}]);
    timestamp=8000;await scheduled();
    assert.deepEqual(calls,[{includeRequests:false},{limit:5},{includeRequests:false}]);
    failed=true;timestamp=10000;await scheduled();
    for(const metric of ['provider','connection','host','slot','tasks','requests'])
      assert.equal(map.get('cloud-overview-'+metric).textContent,'待核对');
    failed=false;timestamp=12000;await scheduled();
    assert.deepEqual(calls.slice(-2),[{includeRequests:false},{limit:5}]);
    assert.equal(map.get('cloud-overview-requests').textContent,'90');
  }finally{hosting.dispose();}
});

test('dispatch rejection is operation feedback and does not erase successful status reads',async()=>{
  const {document,map}=hostingFixture();let claims=0;
  const cloud={cloudStatus:async()=>readyStatus,cloudNext:async()=>{claims++;throw {code:'E_PRIVATE',message:'SECRET'};}};
  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:false}});
  try{
    await flush();assert.equal(claims,1);
    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
    assert.match(map.get('cloud-status').textContent,/操作未完成，请核对状态后再试/);
    assert.doesNotMatch(map.get('cloud-status').textContent,/状态暂不可读取|SECRET/);
  }finally{hosting.dispose();}
});
