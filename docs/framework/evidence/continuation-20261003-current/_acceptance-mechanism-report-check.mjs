// Read-only validation of the two independent mechanism-review artifacts.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/';
const report=JSON.parse(await readFile(base+'acceptance-mechanism-review.json','utf8'));
const markdown=await readFile(base+'acceptance-mechanism-review.md','utf8');
assert.equal(report.f3Review,false);
assert.equal(report.verdict,'REQUEST CHANGES');
assert.equal(report.facts.counts.original,603);
assert.equal(report.facts.counts.additional,19);
assert.equal(report.facts.counts.accepted,0);
assert.equal(report.findings.length,11);
assert.equal(report.independentProbeEvidence.outcomes.length,48);
for(const finding of report.findings){
  assert.ok(markdown.includes(finding.id),finding.id);
  assert.ok(finding.locations.length);
  assert.ok(finding.reproduction&&finding.judgment&&finding.minimalFix);
  for(const id of finding.probeIds)assert.ok(
    report.independentProbeEvidence.outcomes.some(o=>o.id===id)||
    report.independentProbeEvidence.branchProbe.id===id||
    report.independentProbeEvidence.artifactFileProbe.id===id,id);
}
const hashes=[];
for(const snapshot of Object.values(report.deliverySnapshot || report.snapshot)){
  if(snapshot&&typeof snapshot==='object'&&snapshot.path){
    const actual=createHash('sha256').update(await readFile(snapshot.path)).digest('hex');
    assert.equal(actual,snapshot.sha256,snapshot.path);
    hashes.push({path:snapshot.path,unchanged:true});
  }
}
const actualProbeHash=createHash('sha256').update(await readFile(report.scope.temporaryProbe)).digest('hex');
assert.equal(actualProbeHash,report.snapshot.probeSha256);
console.log(JSON.stringify({reportArtifactsValid:true,findings:report.findings.length,
  nativeScenarios:'pending',snapshotHashesMatch:true,hashes},null,2));
