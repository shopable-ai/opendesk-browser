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
 connection:'authenticated',reconciled:true,hostReady:true,slotAvailable:true,tasks:[{taskId:'PRIVATE-TASK',siteOrigins:['https://secret.local']}],
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
 assert.match(html,/<button[^>]*id="tab-cloud"[^>]*hidden>云控<\/button>/);
 assert.ok(html.indexOf('id="cloud-my-open"')<html.indexOf('id="workbench-cloud"'));
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
 assert.match(hosting,/if\(!busy&&!disposed\)await dispatchNext\(s\)/);
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
