// This test proves deterministic package contracts using real production modules.
// It does NOT create a Chrome operation, model tool call, native receipt or installed Task.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTaskPackage,verifyTaskPackage,validateTaskParams,TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';

const doc = file => readFile(new URL('../../'+file,import.meta.url),'utf8').then(JSON.parse);
const sha = /^[a-f0-9]{64}$/;
const isCode = code => err => err?.code === code;

test('real modern-search example is a fixed candidate, not a trusted installation receipt', async () => {
  const pkg = await doc('examples/tasks/agent-modern-search.v1.opendesk-task.json');
  const real = await verifyTaskPackage(pkg);
  assert.equal(real.manifest.taskId,'sample.agent-modern-search');
  assert.equal(real.manifest.siteOrigins[0],'http://127.0.0.1:43111');
  assert.deepEqual(real.manifest.permissions,['page.automation']);
  assert.match(real.manifest.program.sourceHash,sha);
  assert.match(real.manifestHash,sha);
  assert.equal((await createTaskPackage(real.manifest,real.sourceUtf8)).manifestHash,real.manifestHash);
  assert.deepEqual(validateTaskParams(real.manifest.paramsSchema,{}),{keyword:'OpenDesk'});
  assert.deepEqual(validateTaskParams(real.manifest.paramsSchema,{keyword:'Repeat'}),{keyword:'Repeat'});
  assert.throws(()=>validateTaskParams(real.manifest.paramsSchema,{keyword:'x',password:'secret'}),isCode('E_SCHEMA'));
  assert.throws(()=>validateTaskParams(real.manifest.paramsSchema,{keyword:''}),isCode('E_PARAMS'));
  await assert.rejects(verifyTaskPackage({...real,stage:'Installed'}),isCode('E_SCHEMA'));
});

test('real package verification rejects forged source, widened origins and permissions', async () => {
  const pkg = await doc('examples/tasks/agent-modern-search.v1.opendesk-task.json');
  await assert.rejects(verifyTaskPackage({...pkg,sourceUtf8:pkg.sourceUtf8+'\n// injected'}),isCode('E_HASH'));
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,
    siteOrigins:['https://another.example']}}),isCode('E_HASH'));
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,
    siteOrigins:['https://another.example','https://third.example']}}),isCode('E_PERMISSION'));
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,
    permissions:['page.automation','all_sites']}}),isCode('E_PERMISSION'));
});

function proposedWorkflow() {
  const workflow=emptyWorkflow('http://127.0.0.1:43111','deadbeef-dead-beef-dead-beefdeadbeef');
  workflow.title='重复查询';
  workflow.description='在用户授权的测试页重复搜索';
  workflow.paramsSchema={type:'object',properties:{keyword:{type:'string',title:'搜索关键词',
    minLength:1,maxLength:80,default:'OpenDesk'}},required:['keyword'],additionalProperties:false};
  workflow.steps=[
    {stepId:'fill',op:'fill',locatorKind:'label',selector:'搜索关键词',param:'keyword'},
    {stepId:'click',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'},
    {stepId:'wait',op:'wait',locatorKind:'text',selector:'搜索完成',timeout:10000},
    {stepId:'extract',op:'extract',locatorKind:'css',selector:'#results'}
  ];
  return workflow;
}

test('AI-shaped reviewed workflow compiles to immutable, repeatable fixed code, not model invocation', async () => {
  const workflow=proposedWorkflow();
  const first=await compileWorkflow(workflow);
  const second=await compileWorkflow(workflow);
  assert.equal(first.sourceHash,second.sourceHash);
  assert.equal(first.sourceUtf8,second.sourceUtf8);
  assert.match(first.sourceUtf8,/async function main\(\)/);
  assert.match(first.sourceUtf8,/params\["keyword"\]/);
  assert.doesNotMatch(first.sourceUtf8,/(fetch\(|openai\.|anthropic\.|model\.complete\()/i);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'example.global-first-reviewed',
    version:'1.0.0',title:'冻结的搜索任务',description:'仅用于真实合同离线回归，不是 Chrome E2E',
    author:'OpenDesk Browser',source:'test-fixture',siteOrigins:[workflow.siteOrigin],
    permissions:['page.automation'],entryFormat:'async-main',
    program:{revision:1,sourceHash:first.sourceHash},paramsSchema:workflow.paramsSchema};
  const pkg=await createTaskPackage(manifest,first.sourceUtf8);
  assert.equal((await verifyTaskPackage(pkg)).manifestHash,pkg.manifestHash);
  assert.equal(pkg.manifest.program.sourceHash,first.sourceHash);
  const changed=structuredClone(workflow);
  changed.steps[0].selector='其他字段';
  const changedCode=await compileWorkflow(changed);
  assert.notEqual(changedCode.sourceHash,first.sourceHash);
  await assert.rejects(createTaskPackage(manifest,changedCode.sourceUtf8),isCode('E_HASH'));
  // Package validity can be checked offline; Installed requires actual trusted run receipts.
});

test('R5 TOP20 references only canonical OPP/EXP/GF and registered competitors', async () => {
  const [opps,experiments,claims,rivals]=await Promise.all([
    doc('docs/product/browser-extension-ecosystem/opportunity-register.json'),
    doc('docs/product/browser-extension-ecosystem/commercial-experiments.json'),
    doc('docs/product/browser-extension-ecosystem/first-claims-ledger.json'),
    doc('docs/product/browser-extension-ecosystem/competitor-timeline.json')
  ]);
  const items=opps.globalFirstR5Portfolio.top20;
  assert.equal(opps.opportunities.length,84);
  assert.equal(experiments.experiments.length,8);
  assert.equal(items.length,20);
  assert.deepEqual(items.map(x=>x.order),Array.from({length:20},(_,i)=>i+1));
  assert.equal(new Set(items.map(x=>x.opportunityId)).size,20);
  const O=new Set(opps.opportunities.map(x=>x.id));
  const G=new Set(claims.claims.map(x=>x.id));
  const C=new Set(rivals.competitors.map(x=>x.id));
  for(const item of items) {
    assert.ok(O.has(item.opportunityId),item.opportunityId);
    assert.ok(G.has(item.referenceGfId),item.referenceGfId);
    assert.ok(C.has(item.strongestAlternativeId),item.strongestAlternativeId);
    assert.equal(item.independentScore,'NOT_SCORED');
    assert.equal(item.qualifiedFirstClaim,'NOT_APPROVED');
    if(item.existingExperimentId) {
      const e=experiments.experiments.find(x=>x.id===item.existingExperimentId);
      assert.ok(e?.opportunityIds.includes(item.opportunityId),
        item.opportunityId+' invented experiment linkage');
      assert.notEqual(e.stage,'ARCHIVED');
    }
  }
  assert.equal(claims.approvedClaimIds.length,0);
  assert.equal(opps.globalFirstR5Portfolio.publicClaimApprovalCount,0);
});

test('large competitors that already reuse AI are expressly cited without falsely classifying model-free repeat', async () => {
  const [t,l]=await Promise.all([
    doc('docs/product/browser-extension-ecosystem/competitor-timeline.json'),
    doc('docs/product/browser-extension-ecosystem/first-claims-ledger.json')
  ]);
  assert.ok(t.competitors.length>=45);
  assert.equal(new Set(t.competitors.map(x=>x.id)).size,t.competitors.length);
  for(const id of ['gemini-in-chrome','claude-in-chrome','uipath-delegate']) {
    const competitor=t.competitors.find(x=>x.id===id);
    assert.ok(competitor?.verifiedSources?.length>0);
    assert.equal(competitor.r5AgainstGF007.modelFreeRerun,'UNKNOWN_NOT_MEASURED');
  }
  const gf=l.claims.find(x=>x.id==='GF-007');
  assert.equal(gf.publicUseAllowed,false);
  assert.equal(gf.r5CriticalCounterexample?.requiresGlobalFirstClaim,false);
  assert.match(gf.r5CriticalCounterexample?.status,/UNDEFENDABLE/);
});
