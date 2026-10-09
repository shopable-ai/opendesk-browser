// Offline checks of this workflow's original actual-WXT observations.
// A pass is bounded R13 evidence, never final F3/ZIP acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const directory=path.resolve(process.argv[2]||'docs/framework/evidence/r131-acceptance-01a121da');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=async name=>JSON.parse(await readFile(path.join(directory,name)));
const decode=w=>w.type==='object'?Object.fromEntries(w.value.map(([k,v])=>[k,decode(v)])):w.type==='array'?w.value.map(decode):w.value;
const cases=[];
async function bound(mode,label){
  const file=`native-${mode}/${label}.json`,snapshot=await load(file);
  const build=await load(`builds/build-${mode}.json`);
  assert.equal(snapshot.session.package.packageHash,build.report.packageHash,'Actual package identity mismatch');
  assert.equal(snapshot.session.version.product,'Chrome/155.0.8059.39');
  assert.equal(snapshot.session.freshProfileObserved.previouslyPresent,false);
  const ui=snapshot.pages.find(p=>p.state?.source)?.state;
  assert(ui,'Sidebar observation missing');
  const runId=ui.identity.split('：').at(-1),stores=snapshot.native.stores['opendesk-browser'];
  const run=stores.runs.find(r=>r.tag==='controller-run'&&r.runId===runId);
  const result=stores.results.find(r=>r.tag==='controller-result'&&r.runId===runId);
  assert(run&&result,'Exact durable run/result missing');
  assert.equal(run.resultId,result.resultId);
  assert.deepEqual(run.revision,result.revision);
  assert.equal(result.revision.sourceHash,sha(ui.source));
  assert.deepEqual(decode(run.paramsWire),JSON.parse(ui.params));
  assert.equal(run.workerRetired,true);
  assert.equal(run.retirementState,'released');
  assert(snapshot.native.contexts.some(c=>c.contextType==='SIDE_PANEL'));
  const inputs=ui.inputs?.filter(e=>e.id==='script-run'&&e.type==='click'&&e.source===ui.source&&e.at>=run.createdAt-1000&&e.at<=run.createdAt);
  assert.equal(inputs?.length,1,'Require exactly one real Sidebar Run click for this source');
  assert.equal(inputs[0].isTrusted,true);
  assert.equal(inputs[0].params,ui.params);
  const journal=stores.commandJournal.filter(r=>r.tag==='controller-operation'&&r.runId===runId);
  for(const operation of journal){
    assert.equal(operation.submissionCount,1);
    assert.equal(operation.envelope.identity.runId,runId);
    assert.equal(operation.envelope.revision.sourceHash,result.revision.sourceHash);
    assert.equal(operation.envelope.identity.contentHash,result.revision.sourceHash);
    assert.equal(operation.envelope.identity.ownerEpoch,1);
    assert.equal(operation.envelope.target.documentId,run.target.documentId);
  }
  const binding={mode,label,runId,resultId:result.resultId,sourceHash:result.revision.sourceHash,
    documentId:run.target.documentId,hostInstanceId:run.hostInstanceId,packageHash:snapshot.session.package.packageHash,
    raw:file,rawSha256:sha(await readFile(path.join(directory,file)))};
  cases.push(binding);
  return {snapshot,ui,run,result,journal,binding};
}
for(const mode of ['production','development']){
  const build=await load(`builds/build-${mode}.json`);
  assert.equal(build.status,'passed');assert.deepEqual(build.sourceDriftDuringBuild,[]);
  for(const input of build.sourceInputs)assert.equal(sha(await readFile(input.path)),input.sha256,`Build source drift: ${input.path}`);
  const search=await bound(mode,'search-completed');
  assert.equal(search.binding.packageHash,build.report.packageHash);
  assert.equal(search.result.state,'completed');
  const business=search.snapshot.pages.find(p=>p.state?.count)?.state;
  assert.equal(business.count,'提交次数：1');
  assert.equal(business.keyword,`R13.1 WXT ${mode}`);
  assert.deepEqual(decode(search.result.outcome.valueWire),{result:`结果：R13.1 WXT ${mode}`});
  const matrix=await bound(mode,'r13-matrix');
  const value=decode(matrix.result.outcome.valueWire);
  assert.deepEqual(value,{alt:1,answer:'RESULT:R13.1 WXT',checked:true,clicks:'1',count:2,coveredAction:'E_TIMEOUT',
    disabled:false,disabledAction:'E_TIMEOUT',duplicate:'E_STRICT_MODE_VIOLATION',empty:'',first:'r13-submit',hidden:false,
    hiddenAction:'E_TIMEOUT',last:'r13-duplicate',late:'异步完成',nth:'r13-duplicate',outOfRange:'E_SELECTOR_NOT_FOUND',
    radio:true,readonlyAction:'E_TIMEOUT',region:'b',title:1,unchecked:false,value:'R13.1 WXT',version:'1.1.0-r13'});
  const events=matrix.snapshot.pages.find(p=>p.state?.fixtureEvents)?.state.fixtureEvents;
  const count=(id,type)=>events.filter(e=>e.id===id&&e.type===type).length;
  assert.equal(count('r13-consent','click'),2);assert.equal(count('r13-consent','change'),2);
  assert.equal(count('r13-region','input'),1);assert.equal(count('r13-region','change'),1);
  assert.equal(count('r13-submit','click'),1);
  for(const id of ['disabled','hidden','covered','readonly','r13-duplicate'])assert.equal(count(id,'click'),0);
  const restart=await load(`native-${mode}/sw-restart.json`);
  assert.equal(restart.stopped,true);assert.notEqual(restart.before.targetId,restart.after.targetId);
  const restored=await load(`native-${mode}/restored-after-sw-restart.json`);
  const restartBaseline=mode==='production'?await load('native-production/ai-generated-completed.json'):matrix.snapshot;
  const before=restartBaseline.native.stores['opendesk-browser'];
  for(const result of before.results){assert.deepEqual(restored.native.stores['opendesk-browser'].results.find(r=>r.resultId===result.resultId),result);}
}
const observe=await bound('production','ai-observation');
const overview=decode(observe.result.outcome.valueWire);
assert.equal(overview.version,'1.1.0-r13');
assert.equal(overview.nodes.filter(n=>n.locator?.kind==='role').length,2);
const generated=await bound('production','ai-generated-completed');
assert.deepEqual(decode(generated.result.outcome.valueWire),{count:'提交次数：2',result:'结果：R13.1 Codex observed',value:'R13.1 Codex observed'});
for(const [label,code] of [['stop-completed','E_CANCELLED'],['timeout-completed','E_TIMEOUT'],['navigation-completed','E_DOCUMENT_REPLACED'],['site-revoked','E_PERMISSION']]){
  const test=await bound('production',label);
  assert.equal(test.run.state,'stopped');assert.equal(test.result.outcome.error.code,code);
  assert(!test.journal.some(r=>r.nativeReceipts?.some(n=>n.stage==='locator.commitIntent')),'Cancelled wait dispatched a write');
  if(label==='site-revoked'){
    assert.deepEqual(test.snapshot.native.permissions.origins,[]);
    assert.equal(test.run.resultDeliveryRevoked,true);
  }
}
const fault=await load('native-production/fault-snapshot-armed.json');
for(const label of ['unknown-check','unknown-select','unknown-click']){
  const test=await bound('production',label);
  assert.equal(test.result.outcome.error.code,'E_TIMEOUT');
  assert.equal(test.journal.length,1);assert.equal(test.journal[0].state,'effect_unknown');
  const stages=test.journal[0].nativeReceipts.map(r=>r.stage);
  assert(stages.includes('locator.commitIntent'));assert(!stages.includes('locator.commitNoEffect'));
  const effects=fault.events.filter(e=>e.method==='locatorCommit'&&e.envelope.identity.runId===test.run.runId);
  assert.equal(effects.length,1);assert.equal(effects[0].withheld,true);
  assert.equal(effects[0].response.value.v.find(([key])=>key==='committed')[1].v,true);
  const page=test.snapshot.pages.find(p=>p.state?.fixtureEvents)?.state;
  const effectId=label==='unknown-check'?'r13-consent':label==='unknown-select'?'r13-region':'r13-submit';
  assert.equal(page.fixtureEvents.filter(e=>e.id===effectId&&e.type===(label==='unknown-select'?'change':'click')).length,1);
}
const reopened=await load('native-development/sidebar-reopened.json');
const matrix=await load('native-development/r13-matrix.json');
const host=s=>s.native.contexts.find(c=>c.contextType==='SIDE_PANEL').documentUrl;
assert.notEqual(host(reopened),host(matrix));
for(const r of matrix.native.stores['opendesk-browser'].results)assert.deepEqual(reopened.native.stores['opendesk-browser'].results.find(v=>v.resultId===r.resultId),r);
assert.equal(reopened.pages.find(p=>p.state?.fixtureEvents).state.fixture.clicks,'1');
const originalCleanup=await load('native-development/cleanup.json');
assert.equal(originalCleanup.cleanupStatus,'FAIL','Original cleanup failure must remain preserved');
assert.equal(originalCleanup.profileRemoved,true);assert.equal(originalCleanup.pidAliveAfterExit,false);
assert(originalCleanup.cleanupErrors.length>0,'Original cleanup errors missing');
const cleanup=await load('cleanup-confirmation/cleanup.json');
assert.equal(cleanup.cleanupStatus,'PASS');assert.equal(cleanup.profileRemoved,true);assert.equal(cleanup.pidAliveAfterExit,false);
const report={scope:'Actual WXT R13 bounded native verification; NOT final F3, campaign, ZIP or expert95 score',status:'PASS',cases,
  cleanupFailurePreserved:'native-development/cleanup.json',cleanupCorrection:'cleanup-confirmation/cleanup.json',
  unsupported:['trusted keyboard press','automatic scroll','cross-frame','Shadow DOM','complex mouse actions'],
  notTested:['Same-profile full browser restart','Final 603+19 ledger/campaign/resource-baseline closure','Independent final F3','ZIP installation consistency','Formal expert95 scoring']};
await writeFile(path.join(directory,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,boundRuns:cases.length,scope:report.scope}));
