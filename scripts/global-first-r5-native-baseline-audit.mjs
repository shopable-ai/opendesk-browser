// Cross-check a REPORT from the existing genuine macOS Chrome scheduled Task
// driver against the exact extension and task bytes. Not an authenticity oracle:
// only signed CI logs, owned launcher evidence and independent native review can
// raise a complete source-bound run to actual Chrome acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageFingerprint} from './verify-package.mjs';

const SHA=/^[a-f0-9]{64}$/;
const hash=source=>createHash('sha256').update(source).digest('hex');
const requireEvent=(steps,name)=>{
  const matches=steps.filter(x=>x?.name===name);
  assert.equal(matches.length,1,'Exactly one native report event: '+name);
  return matches[0].result;
};
export function inspectR5TaskNativeReport(report,{
  head,actualPackageHash,taskSourceHash,expectedTaskId,expectedTaskVersion,
  expectedPlatform='darwin'
}={}){
  assert.equal(report?.status,'PASS','Original native driver did not PASS');
  assert.equal(report?.native,true,'Only original actual Chrome driver report is supported');
  assert(['darwin','linux'].includes(expectedPlatform),'Only explicit macOS or Linux Chrome baseline supported');
  assert.equal(report?.platform,expectedPlatform,
    'Native report platform mismatch; Linux Chrome must never become a macOS receipt');
  if(expectedPlatform==='linux'){
    assert.match(report?.sandboxPolicy||'',/explicit isolated Linux CI --no-sandbox/,
      'Linux CI report must disclose isolation and sandbox limitation');
  }
  assert(SHA.test(head)&&report.gitSha===head,'Original report must bind its exact CI SHA');
  assert(SHA.test(actualPackageHash)&&report.package?.packageHash===actualPackageHash,
    'Loaded extension and physical package fingerprint differ');
  assert(SHA.test(taskSourceHash)&&report.taskSourceHash===taskSourceHash,
    'Actual reviewed Task source bytes do not match the fixture');
  for(const key of ['manualTaskVerification','verifiedInstallation','actualScheduledNativeEffect'])
    assert.equal(report.tests?.[key],'PASS','Original native action incomplete: '+key);
  assert(Array.isArray(report.steps)&&report.steps.length>0,'Native step events missing');
  const original=requireEvent(report.steps,'manual-native-receipt');
  const installed=requireEvent(report.steps,'installed-trusted-task');
  const scheduled=requireEvent(report.steps,'native-scheduled-result');
  assert.equal(installed.taskId,expectedTaskId,'Wrong fixed installed task');
  assert.equal(installed.version,expectedTaskVersion,'Wrong installed version');
  for(const key of ['verifiedRunId','documentId'])
    assert(typeof original[key]==='string'&&original[key].length>3,'Missing initial native '+key);
  for(const key of ['fireId','runId','resultId','documentId'])
    assert(typeof scheduled[key]==='string'&&scheduled[key].length>3,'Missing scheduled native '+key);
  assert.notEqual(original.verifiedRunId,scheduled.runId,
    'A scheduled execution must have a distinct trusted run identity');
  assert.equal(scheduled.retirement,'released','Worker has not retired');
  assert.deepEqual(scheduled.webEffect,{name:'Scheduled Native',done:true},
    'Scheduled Task did not visibly modify the owned real page');
  const reportSummary={
    format:'opendesk.global-first-r5-real-task-baseline-audit.v1',
    role:'STRUCTURAL_CROSSCHECK_OF_NATIVE_REPORT_AND_PHYSICAL_PACKAGE',
    sourceHead:head,platform:expectedPlatform,packageHash:actualPackageHash,taskSourceHash,
    taskId:installed.taskId,taskVersion:installed.version,
    initialManualRunId:original.verifiedRunId,scheduledRunId:scheduled.runId,
    scheduledResultId:scheduled.resultId,scheduledDocumentId:scheduled.documentId,
    nativeDriverStatus:report.status,
    verificationSteps:['manualTaskVerification','verifiedInstallation','actualScheduledNativeEffect'],
    sourceConsistency:'PASS',
    aiCreatedThisVersion:'NOT_TESTED',
    modelDisconnectedAndSameInstalledVersionRepeatedTwice:'NOT_TESTED',
    certifiedGlobalFirst:'NOT_APPROVED',
    caution:'Requires source-bound CI logs and raw Chrome records for independent acceptance. The report alone cannot authenticate native input or AI activity.'
  };
  return Object.freeze(reportSummary);
}

async function main(argv){
  if(argv.length!==3&&argv.length!==4)throw Error('Usage: node scripts/global-first-r5-native-baseline-audit.mjs NATIVE_REPORT.json EXTENSION_DIR EXPECTED_HEAD [--platform=linux]');
  const [reportPath,packageDir,head,option]=argv;
  if(option!==undefined&&option!=='--platform=linux')throw Error('Only explicit --platform=linux is supported');
  const expectedPlatform=option==='--platform=linux'?'linux':'darwin';
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  const pkg=JSON.parse(await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8'));
  const physical=await packageFingerprint(packageDir);
  const summary=inspectR5TaskNativeReport(report,{
    head,actualPackageHash:physical.packageHash,taskSourceHash:hash(pkg.sourceUtf8),
    expectedTaskId:pkg.manifest.taskId,expectedTaskVersion:pkg.manifest.version,expectedPlatform
  });
  const target=path.join(path.dirname(reportPath),'global-first-r5-native-task-audit.json');
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({audit:summary.sourceConsistency,status:summary.nativeDriverStatus,
    sourceHead:summary.sourceHead,platform:summary.platform,scheduledRunId:summary.scheduledRunId,
    modelIndependentAIChain:summary.modelDisconnectedAndSameInstalledVersionRepeatedTwice})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error=>{console.error(error.stack);process.exitCode=1;});
