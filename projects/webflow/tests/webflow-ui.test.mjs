import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modelCode=readFileSync(resolve(project,'src/ui/model.js'),'utf8');
const uiCode=readFileSync(resolve(project,'src/ui/main.js'),'utf8');
const config=JSON.parse(readFileSync(resolve(project,'tool.config.json'),'utf8'));
const sandbox={};
vm.runInNewContext(modelCode,sandbox,{filename:'model.js',timeout:3000});
const M=sandbox.OpenDeskWebFlowModel;
const base=(id='baidu.search.top3')=>({...config.delegatedTasks.find(p=>p.taskId===id),
  title:id,site:id.startsWith('baidu')?'https://www.baidu.com':'https://www.google.com',
  state:'available'});

test('app declares one isolated v2 package, reviewed pins and original SDK only',()=>{
  assert.equal(config.format,'opendesk.sidebar-tool.v2');
  assert.equal(config.id,'webflow');
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(config.capabilities,['storage.local','currentPage.read','tasks.open','tasks.run']);
  assert.equal(config.delegatedTasks.length,2);
  assert.equal(new Set(config.delegatedTasks.map(x=>x.taskId)).size,2);
  for(const item of config.delegatedTasks){
    assert.match(item.contentHash,/^[a-f0-9]{64}$/);
    assert.match(item.manifestHash,/^[a-f0-9]{64}$/);
    assert.ok(uiCode.includes(item.taskId));
    assert.ok(uiCode.includes(item.version));
    assert.ok(uiCode.includes(item.contentHash));
  }
  assert.ok(!uiCode.includes('chrome.storage'));
  assert.ok(!uiCode.includes('browser.runtime'));
  assert.ok(!uiCode.includes('document.querySelector('));
  assert.ok(!uiCode.includes('opendesk.task.intent.v2'));
});
test('fixed pin identity rejects name collision, version or hash drift',()=>{
  const pin=base();
  assert.equal(M.pinsEqual(pin,{...pin}),true);
  assert.equal(M.pinsEqual(pin,{...pin,version:'99.0.0'}),false);
  assert.equal(M.pinsEqual(pin,{...pin,contentHash:'b'.repeat(64)}),false);
  assert.equal(M.pinsEqual(pin,{...pin,manifestHash:'c'.repeat(64)}),false);
  assert.equal(M.taskKey(pin)!==M.taskKey({...pin,version:'1.1.2'}),true);
  assert.equal(M.errorState({code:'E_REVISION'}),'changed');
  assert.equal(M.errorState({code:'E_PERMISSION'}),'unavailable');
});
test('search, availability, attention and favorites filter 100 tasks without relying on titles for identity',()=>{
  const rows=Array.from({length:100},(_,n)=>({
    ...base(n%2?'google.search.top3':'baidu.search.top3'),
    taskId:'example.'+n,title:'示例 '+n,site:n%2?'https://www.google.com':'https://www.baidu.com',
    state:n%5===0?'changed':'available'
  }));
  const fav=[M.taskKey(rows[9])];
  assert.equal(M.filterTasks(rows,'', 'all', fav).length,100);
  assert.equal(M.filterTasks(rows,'百度','all',fav).length,0);
  assert.equal(M.filterTasks(rows,'google','available',fav).length,40);
  assert.equal(M.filterTasks(rows,'','attention',fav).length,20);
  assert.equal(M.filterTasks(rows,'','favorite',fav).length,1);
  assert.equal(M.filterTasks(rows,'','all',fav)[0].taskId,rows[9].taskId);
});
test('completed alone does not mean persisted result or business success',()=>{
  const pin=base();
  const s={clientRequestId:'wf-1',runId:'run-1',resultId:'result-1',state:'completed',
    retirementState:'released',value:{status:'success',count:3,results:[{title:'hello'}]}};
  const noResult=M.projectRun(s,pin,1);
  assert.equal(noResult.state,'completed');
  assert.equal(noResult.resultPersisted,false);
  assert.equal(noResult.runtimeOk,false);
  assert.equal(noResult.business,'unverified');
  const withResult={...s,result:{tag:'controller-result',runId:'run-1',resultId:'result-1',
    state:'completed',outcome:{ok:true}}};
  const proven=M.projectRun(withResult,pin,2);
  assert.equal(proven.resultPersisted,true);
  assert.equal(proven.runtimeOk,true);
  assert.equal(proven.business,'reported-success');
  assert.equal(proven.count,3);
  assert.equal(proven.delivery,'not_observed');
  assert.equal(proven.aiReply,'not_observed');
  assert.equal(M.projectRun({...withResult,value:{status:'blocked'}},pin).business,'blocked');
  assert.equal(M.projectRun({...withResult,result:{...withResult.result,outcome:{ok:false}}},pin).runtimeOk,false);
  assert.equal(M.projectRun({...withResult,result:{...withResult.result,resultId:'not-this-run'}},pin).resultPersisted,false);
});
test('UNKNOWN remains terminal for auto-replay purposes and imported records cannot self-prove delivery',()=>{
  assert.equal(M.isTerminal('unknown'),true);
  assert.equal(M.isTerminal('running'),false);
  const imported=M.recentRecords([{clientRequestId:'original',taskId:'baidu.search.top3',
    state:'unknown',resultPersisted:false,delivery:'success',aiReply:'completed'}]);
  assert.equal(imported.length,1);
  assert.equal(imported[0].state,'unknown');
  assert.equal(imported[0].delivery,'not_observed');
  assert.equal(imported[0].aiReply,'not_observed');
  assert.equal(M.recentRecords([{foo:'bad'}]).length,0);
  assert.equal(M.recentRecords(Array.from({length:50},(_,n)=>({clientRequestId:'c'+n,taskId:'b'}))).length,12);
});
test('original builder accepts and preserves real v2 pins without embedding a runner',async()=>{
  const tool=validateSidebarToolPackage(await createSidebarToolPackage(project));
  assert.equal(tool.id,'webflow');
  assert.equal(tool.version,'0.3.0');
  assert.equal(tool.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(tool.scripts.length,1);
  assert.equal(tool.delegatedTasks.length,2);
  assert.equal(tool.delegatedTasks[0].manifestHash,config.delegatedTasks[0].manifestHash);
  assert.equal(tool.delegatedTasks[1].contentHash,config.delegatedTasks[1].contentHash);
  assert.ok(tool.js.includes('tasks.start'));
  assert.ok(tool.css.includes('.wf-app'));
});
