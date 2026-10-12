import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectCloudRequestSamples} from '../../src/ui/cloud-status-presentation.js';
const read=path=>readFile(path,'utf8');

test('Side Panel has six product tabs and development-only Debug at seventh',async()=>{
  const [html,work,mem,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/task-workbench.js'),
    read('src/ui/sidebar-tab-memory.js'),read('src/ui/tool-shell.js')]);
  const tabs=[...html.matchAll(/data-workbench-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(tabs,['tasks','discover','workflow','develop','tools','cloud','debug']);
  assert.match(html,/<button[^>]*id="tab-cloud"[^>]*hidden>云控<\/button>/);
  assert.match(html,/id="workbench-cloud" role="tabpanel" aria-labelledby="tab-cloud"/);
  assert.match(work,/if\(name==='cloud'&&!cloudAvailable\)return false/);
  assert.match(work,/get\('tab-cloud'\)\.hidden=!cloudAvailable/);
  assert.match(work,/visibleTabs=\(\)=>tabOrder\.filter/);
  assert.match(shell,/taskWorkbench\.setCloudAvailable\(true\)/);
  assert.match(mem,/PRODUCT_TABS=new Set\(\['tasks','discover','workflow','develop','tools','cloud'\]\)/);
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

test('Cloud controls exist once in the Cloud tab; My retains a compact entry',async()=>{
  const [html,cloud,work,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/cloud-hosting.js'),
    read('src/ui/task-workbench.js'),read('src/ui/tool-shell.js')]);
  const my=html.slice(html.indexOf('id="workbench-tasks"'),html.indexOf('id="workbench-tools"'));
  const pane=html.slice(html.indexOf('id="workbench-cloud"'),html.indexOf('id="workbench-local-discover"'));
  assert.match(my,/id="cloud-my-open"/);
  assert.doesNotMatch(my,/id="cloud-pair"|id="cloud-approve"/);
  for(const id of ['cloud-hosting','cloud-pair','cloud-approve','cloud-stop','cloud-refresh','cloud-overview-refresh','cloud-request-samples'])
    assert.ok(pane.includes('id="'+id+'"'),id);
  assert.match(cloud,/async function dispatchNext\(s\)/);
  assert.match(cloud,/click\('cloud-overview-refresh',async\(\)=>\{\}\)/);
  assert.match(work,/listen\(get\('cloud-my-open'\),'click',\(\)=>navigate\('cloud'\)\)/);
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
