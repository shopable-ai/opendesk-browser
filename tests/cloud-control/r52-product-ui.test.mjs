import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
// R5.2 migration: test the real React Cloud Controller snapshot, not the
// deleted DOM form. Each historic scenario remains covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const base={provider:{providerId:'trusted'},enabled:false,online:false,reconciled:false,
  connection:'offline',tasks:[],hostReady:true,slotAvailable:true,
  requestTotal:0,requests:[]};
async function surface({status=base,cloud={},catalog={catalog:[],installed:[]},onOpenRun,onManageTasks,host}={}){
  let snapshot,reads=0,claims=0;
  const client={cloud:{
    cloudStatus:async()=>{reads++;return status;},
    cloudNext:async()=>{claims++;return null;},
    ...cloud
  },request:async(type)=>{assert.equal(type,'listTaskCatalog');return catalog;}};
  const view=createCloudHosting({client,host:host||{executionPending:false},
    document:{documentElement:{dataset:{opendeskTab:'cloud'}},getElementById:()=>null},
    api:{},reactUI:{cloudPageMounted:true,renderCloudPage(next){snapshot=next;}},
    onOpenRun,onManageTasks});
  await flush();await flush();
  return {view,client,model:()=>snapshot,reads:()=>reads,claims:()=>claims};
}
test('Cloud keeps task consent primary and endpoint settings secondary',async()=>{
  const [entry,js,react,authorization,settings,appShell,css]=await Promise.all([
    'src/ui/sidepanel.html','src/ui/cloud-hosting.js','src/ui/react/tabs/cloud.tsx',
    'src/ui/react/tabs/cloud-authorization.tsx','src/ui/react/tabs/cloud-settings.tsx',
    'src/ui/react/app-shell.tsx','src/ui/tool-shell.css'
  ].map(file=>readFile(file,'utf8')));
  const html=await renderSidebarFixture();
  assert.match(react,/export function CloudConnectionPage/);
  const page=react.slice(react.indexOf('export function CloudConnectionPage'),
    react.indexOf('// Program source never renders'));
  for(const tag of ['<CloudFirstRun','<CloudProgramInbox','<CloudTaskAuthorization',
    '<CloudRequestHistory','<CloudClientCredentials','<CloudPairingSettings'])
    assert.ok(page.includes(tag),tag+' must be composed by React');
  assert.ok(page.indexOf('<CloudTaskAuthorization')<page.indexOf('<CloudPairingSettings'));
  // Check composition order rather than component definition order.
  const reactOrder=['id="cloud-overview-state"','<CloudFirstRun','<CloudRequestHistory']
    .map(tag=>page.indexOf(tag));
  assert.ok(reactOrder.every((index,i)=>index>=0&&(i===0||index>reactOrder[i-1])));
  assert.match(react,/id="cloud-first-run"/);
  for(const id of ['cloud-request-prev','cloud-request-next','cloud-request-detail','cloud-request-open-result'])
    assert.ok(react.includes('id="'+id+'"'));
  for(const id of ['cloud-pair','cloud-unpair','cloud-refresh','cloud-client-create','cloud-client-token'])
    assert.ok(settings.includes('id="'+id+'"'));
  for(const id of ['cloud-approve','cloud-stop','cloud-consent'])
    assert.ok(authorization.includes('id="'+id+'"'));
  assert.match(authorization,/resultAllowed|resultConsent/);
  assert.match(appShell,/<CloudConnectionPage/);
  assert.match(js,/reactUI\.renderCloudPage\(/);
  assert.match(js,/cloud\.cloudClientGrant\(/);
  assert.match(js,/cloud\.cloudClientRevoke\(/);
  assert.match(css,/\.cloud-request-pagination/);
  assert.match(html,/id="tab-cloud"/);
  assert.equal((entry.match(/id="cloud-hosting"/g)||[]).length,0,
    'React is sole DOM writer; obsolete duplicate native form must not return');
});
test('unpaired cloud shows inline connection CTA, never claims a new Run',async()=>{
  const f=await surface({status:{...base,provider:null}});
  try{
    assert.equal(f.model().setup.visible,true);
    assert.equal(f.model().visibleApproval,false);
    assert.equal(f.model().pairing.canUnpair,false);
    assert.equal(f.model().pairing.canPair,true);
    assert.equal(f.claims(),0);
    await f.model().onRefresh();assert.equal(f.claims(),0);
    assert.match(f.model().setup.nextStep,/先安装或验证任务/);
  }finally{f.view.dispose();}
});
test('paired but not enabled exposes Task selection and blocks execution',async()=>{
  const f=await surface();
  try{
    assert.equal(f.model().setup.visible,false);
    assert.equal(f.model().visibleApproval,true);
    assert.equal(f.model().authorization.hostingEnabled,false);
    assert.equal(f.model().authorization.canStop,false);
    assert.equal(f.model().authorization.tasks.length,0);
    assert.equal(f.model().pairing.canUnpair,true);
    assert.equal(f.claims(),0);
    assert.match(f.model().overview.summary,/未启用任务授权/);
  }finally{f.view.dispose();}
});
test('local Stop does not claim Provider confirmation while remote suspend is pending',async()=>{
  const f=await surface({status:{...base,remoteSuspension:'pending'}});
  try{
    assert.match(f.model().overview.summary,/提供者尚未确认暂停/);
    assert.equal(f.model().authorization.canStop,false);
    assert.equal(f.claims(),0);
  }finally{f.view.dispose();}
});
test('trusted Cloud requests show readable Task names without exposing raw request IDs, URLs or result data',async()=>{
  const f=await surface({status:{...base,requestTotal:2,requests:[
    {taskTitle:'表单填写',requestId:'SECRET-RUN-1',state:'finished',runState:'completed',
      retirementState:'released',receipt:true,params:{name:'PRIVATE_NAME'}},
    {taskTitle:'关键词搜索',requestId:'SECRET-RUN-2',state:'OUTCOME_UNKNOWN',
      runState:'paused_unknown',target:{url:'https://PRIVATE_SEARCH_URL'}}
  ]}});
  try{
    const rows=f.model().requests.rows;
    assert.equal(rows.length,2);
    assert.match(rows[0].title,/关键词搜索/);
    assert.match(rows[1].title,/表单填写/);
    assert.doesNotMatch(JSON.stringify(rows),/SECRET-RUN|PRIVATE_NAME|PRIVATE_SEARCH_URL/);
  }finally{f.view.dispose();}
});
test('Cloud request details page original history and navigate only to the original authorized Run',async()=>{
  const runId='11111111-1111-4111-8111-111111111111',queries=[],opened=[];
  const initial={taskTitle:'表单任务',state:'finished',runState:'completed',
    retirementState:'released',receipt:true,runId,params:{name:'SECRET_NAME'},
    target:{url:'https://SECRET_URL'},requestId:'SECRET_REQUEST_ID'};
  const f=await surface({cloud:{cloudStatus:async query=>{
    queries.push(query);return {...base,requestTotal:6,requestPage:{offset:query.offset||0,limit:5,
      nextOffset:query.offset?null:5},requests:query.offset?[
        {taskTitle:'搜索任务',state:'OUTCOME_UNKNOWN',runState:'paused_unknown'}]:[initial]};
  }},onOpenRun:async id=>opened.push(id)});
  try{
    assert.equal(f.model().requests.canPrev,false);
    assert.equal(f.model().requests.canNext,true);
    assert.doesNotMatch(JSON.stringify(f.model().requests.rows),/SECRET_NAME|SECRET_URL|SECRET_REQUEST_ID/);
    f.model().requests.onDetail(0);
    assert.equal(f.model().requests.detail.canOpenRun,true);
    assert.equal(f.model().requests.detail.runId,runId);
    await f.model().requests.onOpenResult();
    assert.deepEqual(opened,[runId]);
    assert.equal(f.claims(),0);
    await f.model().requests.onNext();
    assert.deepEqual(queries.at(-1),{limit:5,offset:5});
    assert.equal(f.model().requests.canPrev,true);
    assert.equal(f.model().requests.detail,null);
    assert.equal(f.claims(),0);
  }finally{f.view.dispose();}
});
test('no installed Task CTA opens the real My tab rather than a nonexistent tab ID',async()=>{
  let navigations=0;
  const f=await surface({onManageTasks:()=>navigations++});
  try{
    assert.equal(f.model().authorization.tasks.length,0);
    f.model().authorization.onManageTasks();
    assert.equal(navigations,1);
    const react=await readFile('src/ui/react/tabs/cloud-authorization.tsx','utf8');
    assert.match(react,/暂无已安装任务/);
    assert.match(react,/model\.onManageTasks/);
  }finally{f.view.dispose();}
});
test('approval validation is actionable while untrusted remote error details remain redacted',async()=>{
  const f=await surface();
  try{
    await f.model().authorization.onApprove();
    assert.match(f.model().pairing.status,/请先核对所选任务的固定版本/);
  }finally{f.view.dispose();}
  const bad=await surface({status:{...base,provider:null},cloud:{
    cloudPair:async()=>{throw {code:'E_PROVIDER',message:'PRIVATE_PAGE_URL_OR_TOKEN'};}
  }});
  try{
    bad.model().pairing.onField('url','https://cloud.example.test');
    bad.model().pairing.onField('providerId','provider');
    bad.model().pairing.onField('pairingCode','sensitive-secret');
    await bad.model().pairing.onPair();
    assert.match(bad.model().pairing.status,/提供者连接异常/);
    assert.doesNotMatch(bad.model().pairing.status,/PRIVATE_PAGE_URL_OR_TOKEN|sensitive-secret/);
  }finally{bad.view.dispose();}
});
test('Side Panel issues a one-time fixed Task credential and revokes it with inline confirmation',async()=>{
  const taskId='sample.form-fill',clientId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const pin={taskId,version:'1.0.0',manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
    installationId:'install-1',generation:1,resultAllowed:false};
  let revoked=false;const grants=[],revocations=[];
  const f=await surface({status:{...base,enabled:true,tasks:[pin]},cloud:{
    cloudClientGrant:async data=>{grants.push(data);return {clientId,credential:'c'.repeat(64)};},
    cloudClients:async()=>({total:revoked?0:1,nextOffset:null,
      clients:revoked?[]:[{clientId,label:'Trusted Search',tasks:[{taskId,version:'1.0.0'}]}]}),
    cloudClientRevoke:async data=>{revocations.push(data);revoked=true;return {revoked:true};}
  }});
  try{
    assert.equal(f.model().clients.taskId,taskId);
    f.model().clients.onField('name','Trusted Search');
    f.model().clients.onField('resultAllowed',true);
    assert.equal(f.model().clients.resultAllowed,false,'Cannot silently expand result disclosure');
    await f.model().clients.onCreate();
    assert.deepEqual(grants,[{label:'Trusted Search',taskId,allowResult:false}]);
    assert.equal(f.model().clients.token,'c'.repeat(64));
    f.model().clients.onRevoke(clientId);
    assert.equal(f.model().clients.rows[0].confirming,true);
    assert.equal(revocations.length,0);
    f.model().clients.onRevoke(clientId);
    for(let i=0;i<8;i++)await flush();
    assert.deepEqual(revocations,[{clientId}]);
    assert.equal(f.model().clients.token,'');
    assert.equal(f.model().clients.rows.length,0);
  }finally{f.view.dispose();}
});
test('Stop status distinguishes pending Provider ACK and redacts foreign fields',async()=>{
  const {projectCloudStatus,cloudHostingSummary}=await import('../../src/ui/cloud-status-presentation.js');
  const status={enabled:false,remoteSuspension:'pending',provider:{
    url:'https://PRIVATE-ORIGIN.invalid',credential:'HIDDEN-TOKEN'}};
  const pending=projectCloudStatus(status);
  assert.equal(pending.remoteSuspension,'pending');
  assert.match(cloudHostingSummary(pending),/本地已停止执行.*提供者尚未确认暂停/);
  assert.doesNotMatch(JSON.stringify(pending),/PRIVATE-ORIGIN|HIDDEN-TOKEN|https?:\/\//);
  const confirmed=projectCloudStatus({...status,remoteSuspension:'confirmed'});
  assert.equal(confirmed.remoteSuspension,'confirmed');
  assert.doesNotMatch(cloudHostingSummary(confirmed),/提供者尚未确认暂停/);
  const untrusted=projectCloudStatus({...status,remoteSuspension:'HIDDEN-TOKEN'});
  assert.equal(untrusted.remoteSuspension,null);
  assert.doesNotMatch(JSON.stringify(untrusted),/HIDDEN-TOKEN/);
});
