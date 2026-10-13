import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectCloudStatus,cloudHostingSummary} from '../../src/ui/cloud-status-presentation.js';
import {createDebugWorkbench} from '../../src/ui/debug-workbench.js';
const read=path=>readFile(path,'utf8');
function fixture(){
  const ids=['debug-refresh','debug-copy','debug-feedback','debug-cloud-summary','debug-pairing','debug-connection',
    'debug-reconcile','debug-slot','debug-task-count','debug-request-count','debug-snapshot'];
  const map=new Map(ids.map(id=>[id,{textContent:'',disabled:false,listeners:new Map(),
    addEventListener(t,fn){this.listeners.set(t,fn)},removeEventListener(t){this.listeners.delete(t)}}]));
  const document={getElementById:id=>{assert.ok(map.has(id),id);return map.get(id)}};
  return {document,map};
}
const response={executorId:'PRIVATE-ID',provider:{url:'https://sensitive.example',providerId:'private'},enabled:true,online:true,
 connection:'authenticated',reconciled:true,hostReady:true,slotAvailable:true,siteAuthorization:'granted',slotState:'available',pendingResources:false,tasks:[{taskId:'PRIVATE-TASK',siteOrigins:['https://secret.local']}],
 requests:[{requestId:'PRIVATE-REQUEST',runId:'SECRET-RUN',state:'finished',retirementState:'released',receipt:{token:'SENSITIVE'}}]};
test('read-only cloud diagnostics omit tokens and all private identifiers',()=>{
 const value=projectCloudStatus({...response,credential:'SENSITIVE'},{version:'1.2.3',capturedAt:'2026-10-11T00:00:00.000Z'});
 const json=JSON.stringify(value);
 assert.equal(value.requests.total,1);assert.equal(value.requests.receivedReceipts,1);
 assert.equal(value.requests.releasedSlots,1);assert.equal(value.requests.states.finished,1);
 assert.doesNotMatch(json,/PRIVATE|SECRET|SENSITIVE|https?:\/\//);
 assert.match(cloudHostingSummary(value),/已启用/);
});
test('untrusted provider state is reduced to a known diagnostic enum',()=>{
 const value=projectCloudStatus({connection:'token%SECRET',requests:[{state:'https://secret.example'}]});
 assert.equal(value.connection,'unknown');assert.equal(value.requests.states.other,1);
 assert.doesNotMatch(JSON.stringify(value),/SECRET|https?:\/\//);
});
test('completed diagnostics remain read-only and preserve true cancellation counts despite old reasons',()=>{
 const raw={...response,requests:[
   {...response.requests[0],runState:'completed',reason:'E_CLOUD_CANCELLED'},
   {state:'cancelled',reason:'E_CLOUD_CANCELLED'},
   {state:'cancellation-pending',runState:'stopping',retirementState:'fenced',reason:'https://SECRET.example'}
 ]};
 const before=structuredClone(raw),value=projectCloudStatus(raw);
 assert.equal(value.requests.states.finished,1);assert.equal(value.requests.states.cancelled,1);
 assert.equal(value.requests.states['cancellation-pending'],1);
 assert.equal(value.requests.receivedReceipts,1);assert.equal(value.requests.releasedSlots,1);
 assert.doesNotMatch(JSON.stringify(value),/E_CLOUD_CANCELLED|SECRET|https?:\/\//);
 assert.deepEqual(raw,before);
 assert.match(cloudHostingSummary({...value,slotAvailable:false,slotState:'retirement-pending'}),/等待原任务资源释放/);
 assert.match(cloudHostingSummary({...value,hostReady:false}),/需要可用的浏览器执行宿主/);
});
test('revocation projects only confirmation state and separates local stop from server confirmation',()=>{
 const pending=projectCloudStatus({provider:null,enabled:false,revocation:{state:'pending',credential:'SECRET',url:'https://SECRET.example'}});
 assert.equal(pending.revocation,'pending');
 assert.match(cloudHostingSummary(pending),/本机已停止；服务端撤销待确认/);
 assert.doesNotMatch(cloudHostingSummary(pending),/未配对提供者|已完全失效|撤销已确认/);
 assert.doesNotMatch(JSON.stringify(pending),/SECRET|https?:\/\//);
 const confirmed=projectCloudStatus({revocation:{state:'confirmed'}});
 assert.equal(confirmed.revocation,'confirmed');assert.match(cloudHostingSummary(confirmed),/服务端撤销已确认/);
 assert.equal(projectCloudStatus({revocation:null}).revocation,null);
 for(const state of ['https://SECRET.example','constructor','__proto__']){
   const unknown=projectCloudStatus({revocation:{state}});
   assert.equal(unknown.revocation,'unknown');assert.match(cloudHostingSummary(unknown),/撤销状态待核对/);
   assert.doesNotMatch(JSON.stringify(unknown),/SECRET|https?:\/\/|constructor|__proto__/);
 }
});
test('development UI only reads cloudStatus and never claims, pairs, approves or starts a run',async()=>{
 const {document,map}=fixture();let n=0,copied='';
 const cloud={cloudStatus:async()=>{n++;return response},cloudNext:()=>assert.fail('must not claim'),cloudApprove:()=>assert.fail('must not approve')};
 const debug=createDebugWorkbench({document,client:{cloud},host:{currentRun:'LOCAL-SECRET',start:()=>assert.fail('must not run')},
   api:{runtime:{getManifest:()=>({version:'1.2.3'})}},clipboard:{writeText:x=>{copied=x;return Promise.resolve()}},
   now:()=>new Date('2026-10-11T00:00:00Z')});
 await debug.refresh();assert.equal(n,1);
 assert.equal(map.get('debug-task-count').textContent,'1');
 map.get('debug-copy').listeners.get('click')();await Promise.resolve();
 assert.match(copied,/opendesk.cloud-control.diagnostics.v1/);
 assert.doesNotMatch(copied,/PRIVATE|SECRET|SENSITIVE|https?:\/\//);
 debug.dispose();assert.equal(map.get('debug-copy').listeners.size,0);
});
test('late diagnostics after disposal are ignored',async()=>{
 const {document,map}=fixture();let resume;
 const pending=new Promise(resolve=>{resume=resolve});
 const debug=createDebugWorkbench({document,client:{cloud:{cloudStatus:()=>pending}},host:{},clipboard:null});
 const operation=debug.refresh();debug.dispose();resume(response);await operation;
 assert.equal(map.get('debug-snapshot').textContent,'');
});
test('production Cloud tab is visible in Side Panel while Debug remains hidden',async()=>{
 const [entry,work,html,css,cloud,debug]=await Promise.all([
   read('src/entrypoints/tool-shell.js'),read('src/ui/task-workbench.js'),read('src/ui/tool.html'),
   read('src/ui/tool-shell.css'),read('src/ui/cloud-hosting.js'),read('src/ui/debug-workbench.js')]);
 assert.match(entry,/debugEnabled:import\.meta\.env\.MODE==='development'/);
 assert.match(work,/if\(name==='debug'&&!debugEnabled\)return false/);
 assert.match(work,/if\(debugEnabled\)tabOrder\.push\(\['debug','tab-debug'\]\)/);
 assert.match(html,/<button[^>]*id="tab-debug"[^>]*hidden>调试<\/button>/);
 assert.match(html,/<button[^>]*id="tab-cloud"[^>]*>云控<\/button>/);
 assert.ok(html.indexOf('id="workbench-tools"')<html.indexOf('id="workbench-cloud"'));
 assert.ok(html.indexOf('id="workbench-cloud"')<html.indexOf('id="cloud-pair"'));
 assert.ok(html.indexOf('id="cloud-pair"')<html.indexOf('id="workbench-debug"'),
   'Cloud controls must remain in the one production Cloud tab');
 assert.match(html,/id="workbench-debug" role="tabpanel"[^>]*hidden>/);
 assert.match(css,/\.workbench-nav\{[^}]*display:flex;[^}]*overflow-x:auto;/);
 assert.ok(html.indexOf('id="task-installed-cards"')<html.indexOf('id="cloud-hosting"'), 'tasks first; cloud config below');
 assert.doesNotMatch(cloud,/JSON\.stringify\(s,null,2\)/);
 assert.doesNotMatch(debug,/cloudNext\s*\(|cloudResolve\s*\(|host\.start\s*\(/);
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});


test('cloud status refresh is read-only and full tool/catalog tabs cannot claim cloud tasks',async()=>{
 const [hosting,shell]=await Promise.all([read('src/ui/cloud-hosting.js'),read('src/ui/tool-shell.js')]);
 assert.match(hosting,/async function refresh\(\)\{/);
 const start=hosting.indexOf('async function refresh()'),end=hosting.indexOf('async function dispatchNext(');
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(hosting.slice(start,end),/cloudNext|cloudResolve|host\.start/);
 assert.match(hosting,/click\('cloud-refresh',async\(\)=>\{\}\)/);
 assert.match(hosting,/if\(!busy&&!disposed\)try\{await dispatchNext\(s\)/);
 assert.match(shell,/let cloudHosting=null;/);
 assert.match(shell,/const actualSidePanel=await isActualSidePanelContext\(\{api:chrome,href:hostUrl\.href\}\)/);
 const sidePanelStart=shell.indexOf('const actualSidePanel='),sidePanelEnd=shell.indexOf('const toolId=requestedToolId',sidePanelStart);
 assert.ok(sidePanelStart>=0&&sidePanelEnd>sidePanelStart);
 const sidePanelOnly=shell.slice(sidePanelStart,sidePanelEnd);
 assert.match(sidePanelOnly,/if\(actualSidePanel\|\|!tab\?\.id\)\{/);
 assert.match(sidePanelOnly,/cloudHosting=createCloudHosting\(/);
 assert.match(sidePanelOnly,/tabMemory\.restore\(\)/);
 assert.equal((sidePanelOnly.match(/createCloudHosting\(/g)||[]).length,1);
});


test('diagnostic facts are enum-only, bounded, and conservative for absent or malicious inputs',()=>{
 const raw={...response,siteAuthorization:'revoked',slotState:'outcome-unknown',pendingResources:true,
   requestTotal:123,requests:[{state:'cancellation-pending',runState:'interrupted',retirementState:'fenced',outcomeUnknown:true}]};
 const before=structuredClone(raw),value=projectCloudStatus(raw);
 assert.equal(value.siteAuthorization,'revoked');assert.equal(value.slotState,'outcome-unknown');
 assert.equal(value.pendingResources,true);assert.equal(value.requests.total,123);assert.equal(value.requests.sampled,1);
 assert.equal(value.requests.unknownOutcomes,1);assert.equal(value.slotAvailable,false);
 assert.match(cloudHostingSummary({...value,enabled:false}),/已关闭.*目标网站访问已撤销.*仍有待处理资源/);
 assert.deepEqual(raw,before);
 for(const unsafe of [undefined,'SECRET https://private.example','constructor','__proto__']){
   const unknown=projectCloudStatus({...response,siteAuthorization:unsafe,slotState:unsafe,pendingResources:unsafe});
   assert.equal(unknown.siteAuthorization,'unknown');assert.equal(unknown.slotState,'unknown');
   assert.equal(unknown.pendingResources,null);assert.equal(unknown.slotAvailable,false);
   assert.doesNotMatch(JSON.stringify(unknown),/SECRET|https?:\/\/|constructor|__proto__/);
 }
 assert.equal(projectCloudStatus({...response,requests:[{retirementState:'fenced',runState:'interrupted'}]}).requests.unknownOutcomes,0);
});

test('Debug reads and copies new facts without expanding its authority, then clears stale diagnostics on read failure',async()=>{
 const {document,map}=fixture();let copied='',reads=0,readFailure=false;
 const forbidden=()=>assert.fail('diagnostics must remain read-only');
 const cloud={cloudStatus:async request=>{assert.deepEqual(request,{});reads++;if(readFailure)throw Object.assign(new Error('PRIVATE read failure'),{code:readFailure});return {...response,
   siteAuthorization:'unknown',slotState:'preview',pendingResources:false,requestTotal:76}},
   cloudNext:forbidden,cloudResolve:forbidden,cloudPair:forbidden,cloudApprove:forbidden};
 const debug=createDebugWorkbench({document,client:{cloud},host:{start:forbidden},clipboard:{writeText:async text=>{copied=text;}}});
 try{
   await debug.refresh();map.get('debug-copy').listeners.get('click')();await Promise.resolve();
   const value=JSON.parse(copied);
   assert.equal(value.siteAuthorization,'unknown');assert.equal(value.slotState,'preview');
   assert.equal(value.pendingResources,false);assert.equal(value.requests.total,76);assert.equal(reads,1);
   assert.doesNotMatch(copied,/PRIVATE|SECRET|SENSITIVE|https?:\/\//);
   const diagnosticFields=['debug-pairing','debug-connection','debug-reconcile','debug-slot','debug-task-count','debug-request-count'];
   for(const id of diagnosticFields)assert.notEqual(map.get(id).textContent,'未知',id);
   readFailure='E_TOKEN_PRIVATE';await debug.refresh();assert.equal(reads,2);
   for(const id of diagnosticFields)assert.equal(map.get(id).textContent,'未知',id);
   assert.equal(map.get('debug-snapshot').textContent,'未获得可信诊断快照。');
   assert.doesNotMatch(map.get('debug-feedback').textContent,/PRIVATE/);
   assert.match(map.get('debug-feedback').textContent,/^E_DIAGNOSTICS/);
   for(const code of ['E_HOST_CLOSED','PRIVATE https://secret.example']){
     readFailure=code;await debug.refresh();
     assert.match(map.get('debug-feedback').textContent,/^E_DIAGNOSTICS/);
     assert.doesNotMatch(map.get('debug-feedback').textContent,/PRIVATE|SECRET|https?:\/\//);
     assert.doesNotMatch(map.get('debug-snapshot').textContent,/PRIVATE|SECRET|https?:\/\//);
   }
   copied='';map.get('debug-copy').listeners.get('click')();await Promise.resolve();
   assert.equal(copied,'');assert.match(map.get('debug-feedback').textContent,/没有可复制的诊断摘要/);
 }finally{debug.dispose();}
});
