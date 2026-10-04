// Independent mechanism probe only. No browser, build, product candidate, or
// acceptance writes. The fixture stays in memory and is never native evidence.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root = '/Users/shopme/Documents/workspace/opendesk-browser';
const checkerPath = resolve(root, 'tests/framework/verify-product-acceptance.mjs');
const testPath = resolve(root, 'tests/framework/acceptance-evidence.test.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = await readFile(checkerPath);
const testBefore = await readFile(testPath);
const {validateAcceptance, checkAcceptance, CRASH_POINTS} = await import(checkerPath);
// Read the supplied fixture definitions, not the tests or test runner.
const source = testBefore.toString();
const start = source.indexOf("const hash = ");
const end = source.indexOf('\nfunction rejects(');
if (start < 0 || end < start) throw new Error('Fixture extraction boundary changed');
const fixture = new Function('createHash', 'CRASH_POINTS', source.slice(start, end) + '\nreturn fixture;')(createHash, CRASH_POINTS);
const outcomes = [];
function probe(id, mutation, details) {
  const data = fixture();
  mutation(data);
  try {
    const result = validateAcceptance(data);
    outcomes.push({id, target:'validateAcceptance (pure in-memory)', details,
      accepted:result.accepted, counts:result.counts, issueCount:result.issues.length,
      issueCodes:[...new Set(result.issues.map(i=>i.code))],issues:result.issues.slice(0,3)});
  } catch (error) {outcomes.push({id, details, threw:error.message});}
}
probe('baseline', () => {}, 'Supplied synthetic fixture, not product evidence');
probe('campaign-one-environment', d => {
  const ids = new Set(Object.values(d.candidate.campaigns).flat());
  d.records.filter(r => ids.has(r.id)).forEach(r => r.observations.splice(1));
}, 'Every campaign lacks stable observations; regular cases retain both');
probe('campaign-repeat-one-raw-round', d => {
  const template = structuredClone(d.records.find(r => r.id === 'mixed-0'));
  d.records.filter(r => d.candidate.campaigns.mixed.includes(r.id)).forEach(r => {
    const {id, kind} = r;
    Object.assign(r, structuredClone(template), {id, kind});
    r.observations.forEach(o => {o.roundId='same-physical-round';o.startedAt='2026-10-03T00:00:00Z';o.endedAt=o.startedAt;});
  });
}, '1000 unique result IDs share one raw reference and physical round identity');
probe('sdk-per-environment-contradiction', d => {
  d.records.find(r => r.kind === 'sdk-concurrency').observations.forEach(o => {
    o.measurements={requests:1,controllerRuns:9,admissions:2,serviceRuns:2,operations:2,httpWrites:2};
  });
}, 'Top-level SDK success counters contradict both environments');
probe('crash-per-environment-replayed', d => {
  d.records.find(r => r.kind === 'write-before-receipt').observations.forEach(o => {
    o.measurements={controllerRuns:1,swTerminated:false,originalIdentityPreserved:false,httpWrites:2,outcome:'settled',replayed:true};
  });
}, 'Top-level unknown/no-replay contradicts both environment observations');
probe('termination-per-environment-failed', d => {
  d.records.find(r => r.kind === 'worker-termination').observations.forEach(o => {
    o.measurements={terminatedMs:60000,targetDestroyed:false,cpuGrowingBefore:false,cpuStaticAfter:false,survivingHostResponsive:false,borrowedPageClosed:true};
  });
}, 'Both environments deny physical stop and preserve top-level happy measurements');
probe('module-evidence-relabeled-native', d => {
  d.records.forEach(r => r.observations.forEach(o => {
    o.preconditions={runner:'node module fixture',browserStarted:false,nativeExecution:false};
    o.actual={execution:'module-only',nativeExecution:false};o.expected={execution:'native-product',nativeExecution:true};
  }));
}, 'Only layer/pass labels claim native; actual/preconditions explicitly say module-only');
probe('source-hash-path-swapped', d => {
  d.records[0].sourceHashes={'unrelated-or-nonexistent-path':'a'.repeat(64),'forged-product-input':'b'.repeat(64)};
}, 'Contract source SHA appears under unrelated key; extra product source hash is unbound');
probe('control-contract-source-path-rejected',d=>{
  d.spec.cases[0].source.path='actual-source.js';
  d.records[0].contractSha256=sha(JSON.stringify(d.spec.cases[0]));
  d.records[0].sourceHashes={'other-path':'a'.repeat(64)};
}, 'A contract with a frozen source.path must bind that exact key, not merely the SHA value');
probe('additional-no-contract', d => {
  delete d.records[2].contractSha256;
  d.records[2].observations.forEach(o => {o.expected={contract:'changed'};o.actual={contract:'contradictory'};});
}, 'Additional case has no frozen contract and arbitrary contradictory expectation');
probe('additional-removable-after-first16', d => {
  const supplemental=structuredClone(d.records[2]);supplemental.id='EXPLICIT-ADD-019';
  d.ledger.additionalCaseResults[supplemental.id]=structuredClone(d.ledger.additionalCaseResults['EXPLICIT-ADD']);
  d.records.push(supplemental);
  delete d.ledger.additionalCaseResults[supplemental.id];d.records=d.records.filter(r=>r.id!==supplemental.id);
}, 'New supplemental denominator entry disappears with no frozen supplementary catalog check');
probe('capability-denominator-erased', d => {
  d.ledger.denominatorHistory.push({requiredCapabilityIds:[]});
  d.ledger.apiItems=[];
}, 'Latest live history removes all required capabilities');
probe('capability-evidence-unhashed', d => {
  d.ledger.apiItems[0].evidence=['not-a-file-reference'];
}, 'Capability requires length only, not a raw native evidence reference');
probe('historical-unrelated-one-case', d => {
  Object.keys(d.candidate.historicalClosures).forEach(id => d.candidate.historicalClosures[id]=['CASE-A']);
}, 'Every historical failure mapped to the same existing unrelated case');
probe('critic-completes-before-start', d => {
  d.candidate.reviews[1].completedAt='2026-10-03T00:00:00Z';
}, 'Critic completion precedes own start and Architect completion');
probe('architect-start-invalid', d => {
  d.candidate.reviews[0].startedAt='invalid';
}, 'Architect start is not validated');
probe('reviews-unbound-evidence-union', d => {
  d.candidate.reviews.forEach(r => {r.reviewedEvidenceSha256='b'.repeat(64);r.reviewedSpecSha256='b'.repeat(64);r.reviewedSourceSha256='b'.repeat(64);});
}, 'Reviews claim another evidence/spec/source union; only productPackageSha256 is checked');
probe('missing-author-declaration', d => {
  d.candidate.productAuthors=['someone-else'];
  d.candidate.reviews[0].reviewerId='product-author';
}, 'Candidate omits true author from self-declared author list');
probe('review-object-identity-bypass',d=>{
  d.candidate.reviews.forEach(r=>{r.reviewerId=['product-author'];});
}, 'Reviewer arrays represent author identity; includes and === compare distinct references');
probe('duplicate-authoritative-review', d => {
  d.candidate.reviews.push({...d.candidate.reviews[0],verdict:'REQUEST CHANGES',blockers:['open-native-blocker']});
}, 'find() takes first APPROVE and ignores duplicate authoritative blocker');
probe('environment-same-binary-version', d => {
  d.candidate.environments[1].chromeVersion=d.candidate.environments[0].chromeVersion;
}, 'Same 138 version and binary declared for minimum and stable');
probe('cleanup-positive-leak-baseline', d => {
  d.records.forEach(r => r.observations.forEach(o => {
    Object.keys(o.cleanup.before).forEach(key=>{o.cleanup.before[key]=999;o.cleanup.after[key]=999;});
  }));
}, 'Arbitrary preexisting resource counts pass without approved baseline/owner/borrowed-page identity');
probe('termination-empty-identity',d=>{
  d.records.find(r=>r.kind==='worker-termination').observations.forEach(o=>{o.measurements.workerIdentity={};});
}, 'An empty object satisfies workerIdentity; no run/target/timeline/CPU sample correlation exists');
probe('download-evidence-contradiction', d => {
  d.records.find(r=>r.kind==='download-complete').observations.forEach(o=>{o.actual={downloadState:'interrupted'};o.expected={downloadState:'complete'};});
}, 'Top-level download complete contradicts both environment actuals');
probe('additional-overlaps-original',d=>{
  d.ledger.additionalCaseResults['CASE-A']={status:'not-tested',pass:false};
}, 'Same original result counts twice and hides failing additional row');
probe('artifact-download-two-hash-mismatch',d=>{
  d.records.find(r=>r.kind==='download-complete').observations.forEach(o=>{
    o.download.artifactSha256='b'.repeat(64);
    o.download.artifact={artifactId:'fixture-artifact',runId:'fixture-run',sha256:'b'.repeat(64),byteLength:123};
  });
}, 'Downloaded disk hash matches download.sha256 but contradicts recorded source artifact hash');
for(const [id,mutation] of [
  ['null-evidence-reference',d=>{d.records[0].observations[0].evidence=[null];}],
  ['null-observation',d=>{d.records[0].observations[0]=null;}],
  ['null-environment',d=>{d.candidate.environments[0]=null;}],
  ['null-review',d=>{d.candidate.reviews[0]=null;}],
  ['null-download-disk-reference',d=>{d.records.find(r=>r.kind==='download-complete').observations[0].download.diskFile=null;}],
  ['ref-path-object',d=>{d.records[0].observations[0].evidence[0]={path:{bad:true},sha256:'a'.repeat(64)};}],
  ['ref-hash-array',d=>{d.records[0].observations[0].evidence[0]={path:'fixture.json',sha256:['a'.repeat(64)]};}],
  ['capability-malformed-evidence-container',d=>{d.ledger.apiItems[0].evidence={length:1};}],
  ['minimum-version-evidence-hash-only',d=>{d.candidate.environments[0].versionEvidence={sha256:'a'.repeat(64)};}],
  ['stable-version-evidence-hash-only',d=>{d.candidate.environments[1].versionEvidence={sha256:'a'.repeat(64)};}]
])probe(id,mutation,id);
// Known negative controls demonstrate that the checker does reject these fields.
probe('control-module-label-rejected', d=>{d.records[0].layer='module';}, 'Honest module label');
probe('control-foreign-package-rejected', d=>{d.records[0].productPackageSha256='b'.repeat(64);}, 'Foreign product hash label');
probe('control-original-denominator-rejected', d=>{delete d.ledger.caseResults['CASE-A'];}, 'Original case key missing');
probe('control-unknown-replay-rejected', d=>{d.records.find(r=>r.kind==='write-before-receipt').observations[0].measurements.replayed=true;}, 'Environment replay true');
probe('control-termination-3001-rejected', d=>{d.records.find(r=>r.kind==='worker-termination').observations[0].measurements.terminatedMs=3001;}, 'Environment physical deadline greater than 3000');
probe('control-borrowed-page-close-rejected', d=>{d.records.find(r=>r.kind==='worker-termination').observations[1].measurements.borrowedPageClosed=true;}, 'Environment borrowed-page close true');
probe('control-cross-campaign-reuse-rejected', d=>{d.candidate.campaigns.reconnect[0]=d.candidate.campaigns.mixed[0];}, 'Same record ID in two campaigns');
probe('control-case-campaign-reuse-rejected', d=>{d.candidate.campaigns.mixed[0]='CASE-A';}, 'Original case counted as campaign');
probe('sdk-bad-record-masked-by-one-good', d=>{
  const row=structuredClone(d.records.find(r=>r.kind==='sdk-concurrency'));
  row.id='sdk-concurrency-bad';row.observations.forEach(o=>{o.measurements.httpWrites=2;o.measurements.controllerRuns=1;});
  d.records.push(row);d.candidate.campaigns.sdkConcurrency.push(row.id);
}, 'One passing SDK record hides another record with controller use and duplicate writes');
probe('unknown-replay-masked-by-one-good', d=>{
  const row=structuredClone(d.records.find(r=>r.kind==='write-before-receipt'));
  row.id='sdk-crashes-unknown-replayed';row.observations.forEach(o=>{o.measurements.replayed=true;o.measurements.httpWrites=2;});
  d.records.push(row);d.candidate.campaigns.sdkCrashes.push(row.id);
}, 'One no-replay row hides another unknown-effect replay');
probe('termination-failure-masked-by-one-good', d=>{
  const row=structuredClone(d.records.find(r=>r.kind==='worker-termination'));
  row.id='termination-failed';row.observations.forEach(o=>{o.measurements.terminatedMs=60000;o.measurements.borrowedPageClosed=true;});
  d.records.push(row);d.candidate.campaigns.workerTermination.push(row.id);
}, 'One passing stop hides another 60-second stop and borrowed page closure');
probe('download-failure-masked-by-one-good', d=>{
  const row=structuredClone(d.records.find(r=>r.kind==='download-complete'));
  row.id='download-interrupted';row.observations.forEach(o=>{o.download.state='interrupted';});
  d.records.push(row);d.candidate.campaigns.downloads.push(row.id);
}, 'One passing download hides another interrupted download labeled pass');
// Execute only the current review report checking branch, with a memory reader.
// No report or product candidate is written, and no final F3 check is invoked.
const checkerText=before.toString();
const reviewStart=checkerText.indexOf('  for (const review of candidate.reviews || []) {');
const reviewEnd=checkerText.indexOf('\n  const result = validateAcceptance(',reviewStart);
if(reviewStart<0||reviewEnd<reviewStart)throw new Error('Review branch changed');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const reviewBranch=new AsyncFunction('candidate','reference','add',checkerText.slice(reviewStart,reviewEnd));
const reviewData=fixture(), reviewIssues=[], reviewReads=[];
const memoryReports=new Map();
reviewData.candidate.reviews.forEach(r=>{
  const doc={...r,evidence:[{path:'missing-review-input.json',sha256:'a'.repeat(64)}]};
  const bytes=Buffer.from(JSON.stringify(doc));
  r.report={path:`memory-${r.role}-review.json`,sha256:sha(bytes)};
  memoryReports.set(r.report.path,bytes);
});
await reviewBranch(reviewData.candidate,async ref=>{
  reviewReads.push(ref.path);const bytes=memoryReports.get(ref.path);
  if(!bytes){reviewIssues.push({code:'EVIDENCE_FILE_MISSING',subject:ref.path});return;}
  if(sha(bytes)!==ref.sha256){reviewIssues.push({code:'EVIDENCE_HASH_MISMATCH',subject:ref.path});return;}
  return bytes;
},(code,subject)=>reviewIssues.push({code,subject}));
const branchProbe={id:'review-nested-reference-not-read',target:'exact extracted current review-report branch with memory reference()',
  issues:reviewIssues,reads:reviewReads,missingNestedReferenceVisited:reviewReads.includes('missing-review-input.json')};
// Check the exact file-reference function using this probe's own existing bytes.
const referenceStart=checkerText.indexOf('  async function reference(ref) {');
const referenceEnd=checkerText.indexOf('\n  for (const ref of candidate.resultReports',referenceStart);
const referenceBody=checkerText.slice(referenceStart,referenceEnd);
const strictIssues=[],strictReads=[];
const factory=new AsyncFunction('projectRoot','readFile','resolve','hashPattern','sha','add',
  'const checked=new Map();\n'+referenceBody+'\nreturn {reference,checked};');
const strict=await factory(root,async path=>{strictReads.push(path);return readFile(path);},resolve,/^[a-f0-9]{64}$/,sha,
  (code,subject)=>strictIssues.push({code,subject}));
const selfPath=new URL(import.meta.url).pathname,selfBytes=await readFile(selfPath),selfHash=sha(selfBytes);
const fileProbes=[];
async function fileProbe(id,ref){const count=strictIssues.length;try{
  const bytes=await strict.reference(ref);fileProbes.push({id,returnedBytes:!!bytes,issues:strictIssues.slice(count)});
}catch(error){fileProbes.push({id,threw:error.message,issues:strictIssues.slice(count)});}}
await fileProbe('strict-exact-self-file',{path:selfPath,sha256:selfHash});
await fileProbe('strict-wrong-byte-hash',{path:selfPath,sha256:'b'.repeat(64)});
await fileProbe('strict-hash-array',{path:selfPath,sha256:[selfHash]});
await fileProbe('strict-null-reference',null);
await fileProbe('strict-path-object',{path:{bad:true},sha256:selfHash});
await fileProbe('strict-missing-path',{sha256:selfHash});
await fileProbe('strict-dotdot-alias',{path:resolve(root,'docs/framework/evidence/continuation-20261003-current')+'/../continuation-20261003-current/_acceptance-mechanism-probe.mjs',sha256:selfHash});
// Real file hash succeeds despite a contradictory source artifact hash.
const artifactData=fixture();
artifactData.records.find(r=>r.kind==='download-complete').observations.forEach(o=>{
  o.download.sha256=selfHash;o.download.diskFile={path:selfPath,sha256:selfHash};
  o.download.artifactSha256='b'.repeat(64);
});
const artifactFileProbe={id:'artifact-real-file-hash-contradiction',downloadFileHashVerified:!!await strict.reference({path:selfPath,sha256:selfHash}),
  helperAccepted:validateAcceptance(artifactData).accepted,artifactHash:'b'.repeat(64),downloadHash:selfHash,
  note:'File reference + helper only, not full candidate or native download'};
// Validate the current ZIP descriptor algorithm using only in-memory archives.
// Adapt the file operand to BytesIO; no ZIP is written or extracted.
const pythonLiteral=checkerText.match(/const python = ('[^\n]+');/)?.[1];
if(!pythonLiteral)throw new Error('Archive inspection program changed');
const pythonCode=new Function('return '+pythonLiteral)();
const pythonProbe=`import io,json,zipfile,hashlib,contextlib\nalgorithm=${JSON.stringify(pythonCode)}\nalgorithm=algorithm.replace('zipfile.ZipFile(sys.argv[1])','zipfile.ZipFile(io.BytesIO(archive))')\nexpected=[{'path':'probe.txt','bytes':2,'sha256':hashlib.sha256(b'ok').hexdigest()}]\nvariants={'exact':[('probe.txt',b'ok')],'changed-byte':[('probe.txt',b'NO')],'extra':[('probe.txt',b'ok'),('extra.txt',b'!')],'missing':[],'duplicate':[('probe.txt',b'ok'),('probe.txt',b'ok')]}\nresults=[]\nfor name,items in variants.items():\n b=io.BytesIO()\n with zipfile.ZipFile(b,'w') as z:\n  for path,content in items:z.writestr(path,content)\n archive=b.getvalue()\n capture=io.StringIO()\n with contextlib.redirect_stdout(capture):exec(algorithm,globals())\n actual=json.loads(capture.getvalue())\n results.append({'variant':name,'closureMatches':actual==expected,'archiveSha256':hashlib.sha256(archive).hexdigest()})\nprint(json.dumps(results))\n`;
const zipResult=await promisify(execFile)('python3',['-c',pythonProbe],{maxBuffer:1024*1024});
const zipProbes=JSON.parse(zipResult.stdout);
const readiness = await checkAcceptance(); // Read-only; no candidate mode.
const ledger = JSON.parse(await readFile(resolve(root,'docs/framework/source-compatibility-ledger.json')));
const gates = JSON.parse(await readFile(resolve(root,'docs/framework/execution-gates.json')));
const manifestBytes=await readFile(resolve(root,gates.currentPlan.manifest));
const manifest=JSON.parse(manifestBytes);
const specRef=manifest.files.find(r=>r.path.endsWith('/test-spec-v5.json'));
const frozenSpec=JSON.parse(await readFile(specRef.path));
const mapping=JSON.parse(await readFile(resolve(root,'docs/framework/historical-failure-mapping.json')));
const workflowPath=resolve(root,'docs/framework/product-acceptance-workflow-20261003.md');
const workflowBytes=await readFile(workflowPath);
const after=await readFile(checkerPath);
const testAfter=await readFile(testPath);
console.log(JSON.stringify({kind:'mechanism-only',nativeScenarios:'pending',
  checker:{path:checkerPath,sha256:sha(before),sha256After:sha(after),unchangedDuringProbe:sha(before)===sha(after),lines:before.toString().split('\n').length-1},
  test:{path:testPath,sha256:sha(testBefore),sha256After:sha(testAfter),unchangedDuringProbe:sha(testBefore)===sha(testAfter)},
  observations:{counts:readiness.counts,accepted:readiness.accepted,mode:readiness.mode,issueCount:readiness.issues.length,
    gate:{currentPlanApproved:gates.currentPlanApproved,currentPlanManifest:gates.currentPlan.manifest,currentPlanManifestSha256:sha(manifestBytes),frameworkFunctionalMigrationComplete:gates.frameworkFunctionalMigrationComplete},
    spec:{total:frozenSpec.cases.length,required:frozenSpec.cases.filter(c=>c.required).length,uniqueIds:new Set(frozenSpec.cases.map(c=>c.id)).size,sourcePathCount:frozenSpec.cases.filter(c=>c.source?.path).length},
    ledger:{originalKeys:Object.keys(ledger.caseResults).length,additionalIds:Object.keys(ledger.additionalCaseResults),lastDenominator:{version:ledger.denominatorHistory.at(-1).version,requiredCapabilityCount:ledger.denominatorHistory.at(-1).requiredCapabilityIds.length}},
    mapping:{R1_R8:mapping.R1_R8.length,historical17:mapping.historical17.length}},
  workflow:{path:workflowPath,sha256:sha(workflowBytes)},outcomes,branchProbe,fileProbes,artifactFileProbe,zipProbes},null,2));
