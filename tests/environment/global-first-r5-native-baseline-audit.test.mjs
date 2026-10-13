import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectR5TaskNativeReport} from '../../scripts/global-first-r5-native-baseline-audit.mjs';

// All receipts below are SYNTHETIC UNIT TESTS. No macOS session or user action occurred.
const head='a'.repeat(64),actualPackageHash='b'.repeat(64),taskSourceHash='c'.repeat(64);
const expected={head,actualPackageHash,taskSourceHash,
  expectedTaskId:'sample.form-fill',expectedTaskVersion:'1.0.0'};
function syntheticReport(){
  return {
    status:'PASS',native:true,platform:'darwin',gitSha:head,
    package:{packageHash:actualPackageHash},taskSourceHash,
    tests:{manualTaskVerification:'PASS',verifiedInstallation:'PASS',
      actualScheduledNativeEffect:'PASS'},
    steps:[
      {name:'manual-native-receipt',result:{verifiedRunId:'synthetic-initial-run',documentId:'synthetic-document-initial'}},
      {name:'installed-trusted-task',result:{taskId:'sample.form-fill',version:'1.0.0'}},
      {name:'native-scheduled-result',result:{fireId:'synthetic-fire-001',runId:'synthetic-scheduled-run',
        resultId:'synthetic-scheduled-result',documentId:'synthetic-document-scheduled',
        retirement:'released',webEffect:{name:'Scheduled Native',done:true}}}
    ]
  };
}
test('auditor checks only report/source consistency; never certifies native origin or AI model disconnect',()=>{
  const summary=inspectR5TaskNativeReport(syntheticReport(),expected);
  assert.equal(summary.sourceConsistency,'PASS');
  assert.equal(summary.role,'STRUCTURAL_CROSSCHECK_OF_NATIVE_REPORT_AND_PHYSICAL_PACKAGE');
  assert.equal(summary.aiCreatedThisVersion,'NOT_TESTED');
  assert.equal(summary.modelDisconnectedAndSameInstalledVersionRepeatedTwice,'NOT_TESTED');
  assert.equal(summary.certifiedGlobalFirst,'NOT_APPROVED');
  assert.notEqual(summary.initialManualRunId,summary.scheduledRunId);
});
test('altered candidate SHA, physical package and native PASS fail closed',()=>{
  const report=syntheticReport();
  for(const [edit,message] of [
    [x=>{x.status='NOT_TESTED'},/did not PASS/],
    [x=>{x.package.packageHash='f'.repeat(64)},/fingerprint differ/],
    [x=>{x.taskSourceHash='d'.repeat(64)},/source bytes/],
    [x=>{x.gitSha='f'.repeat(64)},/exact CI SHA/],
    [x=>{x.native=false},/actual Chrome driver/],
    [x=>{x.platform='linux'},/macOS baseline/]
  ]){
    const candidate=structuredClone(report);edit(candidate);
    assert.throws(()=>inspectR5TaskNativeReport(candidate,expected),message);
  }
});
test('missing native result or incomplete Task installation cannot qualify a baseline',()=>{
  for(const mutate of [
    x=>{x.tests.verifiedInstallation='NOT_TESTED'},
    x=>{delete x.tests.manualTaskVerification},
    x=>{delete x.tests.actualScheduledNativeEffect},
    x=>{x.steps=x.steps.filter(y=>y.name!=='installed-trusted-task')},
    x=>{x.steps.push(x.steps.find(y=>y.name==='native-scheduled-result'))}
  ]){
    const candidate=syntheticReport();mutate(candidate);
    assert.throws(()=>inspectR5TaskNativeReport(candidate,expected));
  }
});
test('separate real Result, document, retired Worker and visible page effect all required',()=>{
  for(const mutate of [
    x=>{x.steps[2].result.runId=x.steps[0].result.verifiedRunId},
    x=>{x.steps[2].result.resultId=''},
    x=>{x.steps[2].result.documentId=''},
    x=>{x.steps[2].result.retirement='pending'},
    x=>{x.steps[2].result.webEffect.done=false},
    x=>{x.steps[1].result.taskId='different.task'},
    x=>{x.steps[1].result.version='2.0.0'}
  ]){
    const candidate=syntheticReport();mutate(candidate);
    assert.throws(()=>inspectR5TaskNativeReport(candidate,expected));
  }
});
