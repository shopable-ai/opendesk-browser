import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const base=read('docs/framework/stage0/baseline-ledger-v1.json');
const ledger=read('docs/framework/source-compatibility-ledger.json');
const spec=read('docs/framework/test-spec-v5.json');
const byCase=new Map(spec.cases.map(c=>[c.id,c]));

test('72 source identities/hashes and all 48 symbols survive the plan correction',()=>{
  assert.equal(ledger.fileRows.length,72);
  assert.equal(ledger.apiItems.length,48);
  assert.deepEqual(ledger.fileRows.map(x=>[x.file,x.sourceHash,x.auditReference.id]),
    base.fileRows.map(x=>[x.file,x.sourceHash,x.auditReference.id]));
  assert.deepEqual(ledger.apiItems.map(x=>[x.symbol,x.sourceLine,x.oldSignature]),
    base.apiItems.map(x=>[x.symbol,x.sourceLine,x.oldSignature]));
});

test('each current mapped capability has concrete source, semantics, dependency and cases',()=>{
  const items=[...ledger.apiItems,...ledger.capabilityItems,...ledger.resourceItems];
  assert.equal(new Set(items.map(x=>x.id)).size,items.length);
  for(const x of items){
    assert.ok(x.source?.path && /^[a-f0-9]{64}$/.test(x.source.sha256),x.id);
    assert.ok(x.oldBehavior && x.behaviorDecision && x.completionCondition,x.id);
    assert.ok(x.tasks?.length && x.dependencies?.length && x.owner,x.id);
    assert.ok(x.caseIds?.length,x.id);
    for(const id of x.caseIds){
      const c=byCase.get(id);assert.ok(c,id);
      assert.ok(c.input!==undefined && c.expected && c.required!==undefined,id);
    }
    for(const p of x.newModules??[]) assert.ok(!/(?:compat|legacy)\/src-bex|assets\/js\/core/.test(p),p);
    // A mapped future module may not exist yet. Runtime claims require evidence.
    if(x.runtimePass){
      assert.ok(x.productPackageSha256 && x.evidence?.length,x.id);
      assert.ok(['tested','independently-accepted'].includes(x.status),x.id);
    }
  }
});

test('frozen denominator lists supported and restricted contracts separately from exclusions',()=>{
  const all=[...ledger.apiItems,...ledger.capabilityItems,...ledger.resourceItems];
  const d=ledger.denominatorHistory.at(-1);
  assert.ok(d && d.originalSourceCount===72 && d.originalMemberCount===48);
  assert.equal(new Set(d.requiredCapabilityIds).size,d.requiredCapabilityIds.length);
  for(const id of d.requiredCapabilityIds){
    const x=all.find(x=>x.id===id);assert.ok(x,id);
    assert.ok(!['business-deferred','resource-excluded','excluded'].includes(x.scope),id);
  }
  assert.ok(d.restrictedCapabilityIds.every(id=>d.requiredCapabilityIds.includes(id)));
  assert.ok(d.excludedIds.every(id=>!d.requiredCapabilityIds.includes(id)));
  assert.equal(ledger.baselineCounts.fileRows,72);assert.equal(ledger.baselineCounts.apiItems,48);
});

test('stage0 gate cannot borrow historical design scores and product flags require their own evidence',()=>{
  const g=read('docs/framework/execution-gates.json');
  assert.equal(g.designManifestSha256,base.designManifestSha256);
  assert.notEqual(g.currentPlan?.manifestSha256,g.designManifestSha256);
  if(g.currentPlanApproved){
    for(const role of ['architect','critic']){
      const report=read(g.currentPlan.reports[role]);
      assert.equal(report.candidateManifestSha256,g.currentPlan.manifestSha256);
      assert.equal(report.verdict,'APPROVE');assert.ok(report.score>=95);
      assert.equal(report.blockers.length,0);assert.equal(report.independent,true);
    }
  }
  if(!g.backendPrototypePassed) assert.equal(g.fullImplementationReleased,false);
  if(g.frameworkFunctionalMigrationComplete){
    assert.equal(g.backendPrototypePassed,true);assert.equal(g.fullImplementationReleased,true);
    assert.ok(g.finalProductPackageSha256 && g.finalIndependentAcceptance);
    assert.ok(ledger.denominatorHistory.at(-1).requiredCapabilityIds.every(id=>
      [...ledger.apiItems,...ledger.capabilityItems,...ledger.resourceItems].find(x=>x.id===id)?.status==='independently-accepted'));
  }
});

test('stage0 manifest hashes cover frozen plan, mapping, differences, cases and inherited contracts',()=>{
  const g=read('docs/framework/execution-gates.json');
  const path=resolve(root,g.currentPlan.manifest);
  assert.ok(existsSync(path));assert.equal(hash(path),g.currentPlan.manifestSha256);
  const m=JSON.parse(readFileSync(path,'utf8'));
  for(const file of [...m.files,...m.inheritedContracts]) assert.equal(hash(file.path),file.sha256,file.path);
  assert.ok(['execution-plan.md','source-compatibility-ledger.json','compatibility-delta-v5.md','test-spec-v5.json']
    .every(name=>m.files.some(f=>f.path.endsWith('/'+name))));
});
