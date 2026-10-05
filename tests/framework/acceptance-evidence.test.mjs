import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateAcceptance, checkAcceptance, CRASH_POINTS, reviewInputSnapshot, SUPPLEMENTAL_CATALOG} from './verify-product-acceptance.mjs';

// Synthetic data tests only the evidence checker. Never export this fixture as
// native observations, migration PASS or a candidate acceptance manifest.
const hash = 'a'.repeat(64), raw = {path:'validator-fixture-only.json', sha256:hash};
const contractHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  const raw={path:'validator-fixture-only.json',sha256:hash};
  const environments = ['minimum', 'stable'].map(role => ({id:role, role, chromeVersion:role === 'minimum' ? '138.0.0.1' : '154.0.0.1',
    os:'validator-fixture', profile:'validator-fixture', extensionId:'validator-fixture', binarySha256:hash, binary:raw, versionEvidence:raw}));
  const cleanup = {before:{pending:0,timers:0,subscriptions:0,ports:0,workers:0,blobs:0}, after:{pending:0,timers:0,subscriptions:0,ports:0,workers:0,blobs:0}};
  const record = (id, kind) => ({id,kind,layer:'native-product',pass:true,productPackageSha256:hash,packageDrift:false,sourceDrift:false,
    sourceHashes:{'fixture-source':hash},observations:environments.map(env => ({environmentId:env.id,pass:true,preconditions:{fixture:true},
      input:0,expected:false,actual:false,evidence:[raw],cleanup:structuredClone(cleanup),
      occurrence:{resultId:id,roundId:`${id}-${env.id}`,sessionId:env.id,startMs:0,endMs:1,evidence:raw,pointer:`/${id}/${env.id}`}}))});
  const spec = {cases:[{id:'CASE-A',required:true,source:{sha256:hash}},{id:'CASE-B',required:true,source:{sha256:hash}}]};
  const supplementalSpec={cases:[{id:'EXPLICIT-ADD',required:true,expected:'frozen supplemental fixture contract',source:{sha256:hash}}]};
  const accepted = () => ({status:'independently-accepted',pass:true,productPackageSha256:hash});
  const ledger = {caseResults:{'CASE-A':accepted(),'CASE-B':accepted()},additionalCaseResults:{'EXPLICIT-ADD':accepted()},
    apiItems:[{id:'CAP',...accepted(),runtimePass:true,evidence:[raw]}],capabilityItems:[],resourceItems:[],denominatorHistory:[{requiredCapabilityIds:['CAP']}]};
  const records = [...spec.cases.map(row => ({...record(row.id),contractSha256:contractHash(row)})),
    {...record('EXPLICIT-ADD'),contractSha256:contractHash(supplementalSpec.cases[0])}];
  const campaigns = {};
  function campaign(name,count,kinds) {
    campaigns[name] = Array.from({length:count},(_,i) => `${name}-${i}`);
    records.push(...campaigns[name].map((id,i) => record(id,kinds[i % kinds.length])));
  }
  campaign('mixed',1000,['success','error','timeout','cancel','navigation']);
  campaign('reconnect',10,['host','sw']);campaign('pluginDisabled',2,['plugin-disabled']);
  campaign('sdkConcurrency',1,['sdk-concurrency']);
  for (const observation of records.at(-1).observations) observation.measurements={requests:100,controllerRuns:0,admissions:1,serviceRuns:1,operations:1,httpWrites:1};
  campaign('sdkCrashes',4,CRASH_POINTS);
  for (const row of records.slice(-4)) for (const observation of row.observations) observation.measurements={controllerRuns:0,swTerminated:true,originalIdentityPreserved:true,
    httpWrites:row.kind === 'admission-abort' ? 0 : 1,outcome:row.kind === 'write-before-receipt' ? 'E_EFFECT_UNKNOWN' : 'settled',replayed:false};
  campaign('downloads',1,['download-complete']);
  for (const observation of records.at(-1).observations) observation.download={state:'complete',sha256:hash,evidence:[raw],diskFile:raw,
    artifactId:'fixture-artifact',runId:'fixture-run',bytes:0,artifact:{artifactId:'fixture-artifact',runId:'fixture-run',bytes:0,sha256:hash,record:raw,payloadFile:raw}};
  campaign('workerTermination',1,['worker-termination']);
  for (const observation of records.at(-1).observations) observation.measurements={terminatedMs:2100,workerIdentity:'fixture-worker',targetDestroyed:true,cpuGrowingBefore:true,
    cpuStaticAfter:true,survivingHostResponsive:true,borrowedPageClosed:false};
  const reviews=['architect','critic'].map((role,i) => ({role,reviewerId:`independent-${i}`,independent:true,verdict:'APPROVE',
    productPackageSha256:hash,blockers:[],report:raw,startedAt:`2026-10-03T0${i+1}:00:00Z`,completedAt:`2026-10-03T0${i+1}:30:00Z`}));
  const data={ledger,spec,supplementalSpec,records,requiredCapabilityIds:['CAP'],historicalIds:['HIST01','R1-pointer'],candidate:{mode:'production',packageHash:hash,environments,campaigns,reviews,
    productAuthors:['product-author'],historicalClosures:{HIST01:['CASE-A'],'R1-pointer':['CASE-B']}}};
  const snapshot=reviewInputSnapshot(data);
  for (const review of reviews) {review.reviewedInputs=snapshot;review.reviewInputsSha256=contractHash(snapshot);}
  reviews[1].architectReportSha256=reviews[0].report.sha256;
  return data;
}
function rejects(change, code) {
  const data=fixture();change(data);const result=validateAcceptance(data);
  assert.equal(result.accepted,false);assert.equal(result.counts.accepted,0);
  assert.ok(result.issues.some(issue => issue.code===code),JSON.stringify({expected:code,issues:result.issues.slice(0,12),count:result.issues.length}));
}

test('complete synthetic checker fixture passes, including false/0 values; not a product test',()=>{
  const result=validateAcceptance(fixture());assert.equal(result.accepted,true);assert.equal(result.counts.accepted,3);
});
test('missing original case and missing explicit additional case cannot be hidden',()=>{
  rejects(d=>d.records.splice(0,1),'NATIVE_RESULT_MISSING_OR_STALE');
  rejects(d=>d.records.splice(2,1),'NATIVE_RESULT_MISSING_OR_STALE');
});
test('dropping or replacing the original ledger denominator rejects',()=>{
  rejects(d=>delete d.ledger.caseResults['CASE-A'],'DENOMINATOR_CHANGED');
  rejects(d=>d.ledger.denominatorHistory[0].requiredCapabilityIds=[],'CAPABILITY_DENOMINATOR_CHANGED');
  rejects(d=>d.ledger.apiItems[0].evidence=[{path:'unhashed',sha256:'invalid'}],'CAPABILITY_NOT_ACCEPTED');
});
test('component/prototype pass and a foreign package cannot count as native acceptance',()=>{
  rejects(d=>d.records[0].layer='component','NATIVE_RESULT_MISSING_OR_STALE');
  rejects(d=>d.records[0].productPackageSha256='b'.repeat(64),'NATIVE_RESULT_MISSING_OR_STALE');
});
test('source/package drift and changed per-case expected contract reject',()=>{
  rejects(d=>d.records[0].sourceDrift=true,'NATIVE_RESULT_MISSING_OR_STALE');
  rejects(d=>d.records[0].packageDrift=true,'NATIVE_RESULT_MISSING_OR_STALE');
  rejects(d=>d.records[0].contractSha256='b'.repeat(64),'CASE_CONTRACT_MISMATCH');
  rejects(d=>d.records[0].sourceHashes={other:'b'.repeat(64)},'SOURCE_BINDING_MISSING');
  rejects(d=>d.spec.cases[0].source.path='actual-source.js','SOURCE_BINDING_MISSING');
});
test('accepted marker alone, skipped result and missing raw evidence reject',()=>{
  rejects(d=>d.records[0].pass='skip','NATIVE_RESULT_MISSING_OR_STALE');
  rejects(d=>d.records[0].observations[0].evidence=[],'OBSERVATION_INCOMPLETE');
  rejects(d=>d.ledger.caseResults['CASE-A'].status='tested','LEDGER_NOT_ACCEPTED');
});
test('missing or duplicate environment observation and unbound browser binary reject',()=>{
  rejects(d=>d.records[0].observations.pop(),'OBSERVATION_MATRIX_MISSING');
  rejects(d=>d.records[0].observations[1].environmentId='minimum','OBSERVATION_MATRIX_MISSING');
  rejects(d=>delete d.candidate.environments[0].binary,'ENVIRONMENT_INCOMPLETE');
});
test('each cleanup counter must return to an explicit resource baseline',()=>{
  rejects(d=>d.records[0].observations[0].cleanup.after.blobs=1,'OBSERVATION_INCOMPLETE');
  rejects(d=>delete d.records[0].observations[0].cleanup.before.ports,'OBSERVATION_INCOMPLETE');
});
test('1000 unique mixed rounds, all five outcomes, reconnects and disabled plugins are required',()=>{
  rejects(d=>d.candidate.campaigns.mixed.pop(),'CAMPAIGN_INCOMPLETE');
  rejects(d=>d.candidate.campaigns.mixed[1]=d.candidate.campaigns.mixed[0],'CAMPAIGN_INCOMPLETE');
  rejects(d=>d.records.filter(r=>r.kind==='navigation').forEach(r=>r.kind='success'),'CAMPAIGN_KIND_MISSING');
  rejects(d=>d.candidate.campaigns.reconnect.pop(),'CAMPAIGN_INCOMPLETE');
  rejects(d=>d.candidate.campaigns.pluginDisabled.pop(),'CAMPAIGN_INCOMPLETE');
  rejects(d=>d.candidate.campaigns.reconnect[0]=d.candidate.campaigns.mixed[0],'CAMPAIGN_RESULT_REUSED');
  rejects(d=>d.records.find(r=>r.id==='mixed-0').observations.pop(),'OBSERVATION_MATRIX_MISSING');
});
test('B05 requires 100 calls with one admission/run/op/HTTP write and no controller',()=>{
  rejects(d=>d.records.find(r=>r.kind==='sdk-concurrency').observations[0].measurements.httpWrites=2,'SDK_100_NOT_PROVEN');
  rejects(d=>d.records.find(r=>r.kind==='sdk-concurrency').observations[1].measurements.controllerRuns=1,'SDK_100_NOT_PROVEN');
});
test('all four crash points preserve identity; unknown effects cannot be replayed',()=>{
  rejects(d=>d.candidate.campaigns.sdkCrashes.pop(),'CAMPAIGN_INCOMPLETE');
  rejects(d=>d.records.find(r=>r.kind==='write-before-receipt').observations[0].measurements.replayed=true,'SDK_CRASH_NOT_PROVEN');
});
test('download accepted is insufficient without complete and an actual disk hash reference',()=>{
  rejects(d=>d.records.find(r=>r.kind==='download-complete').observations[0].download.state='accepted','DISK_DOWNLOAD_NOT_PROVEN');
  rejects(d=>delete d.records.find(r=>r.kind==='download-complete').observations[1].download.diskFile.path,'DISK_DOWNLOAD_NOT_PROVEN');
});
test('Worker termination evidence must meet approved3s and preserve borrowed pages',()=>{
  rejects(d=>d.records.find(r=>r.kind==='worker-termination').observations[0].measurements.terminatedMs=3001,'WORKER_TERMINATION_NOT_PROVEN');
  rejects(d=>d.records.find(r=>r.kind==='worker-termination').observations[1].measurements.borrowedPageClosed=true,'WORKER_TERMINATION_NOT_PROVEN');
});
test('historical failures remain open without case evidence; self-review or reversed review order rejects',()=>{
  rejects(d=>delete d.candidate.historicalClosures.HIST01,'HISTORICAL_REGRESSION_OPEN');
  rejects(d=>d.candidate.reviews[0].reviewerId='product-author','INDEPENDENT_REVIEW_MISSING');
  rejects(d=>d.candidate.reviews[1].startedAt='2026-10-03T00:00:00Z','REVIEW_SEQUENCE_OR_IDENTITY');
  rejects(d=>d.candidate.reviews[0].startedAt='2026-10-03T09:00:00Z','INDEPENDENT_REVIEW_MISSING');
});
test('current real ledger readiness preserves original603 and every current explicit additional case without changing gate state',async()=>{
  const ledger=JSON.parse(await readFile(new URL('../../docs/framework/source-compatibility-ledger.json',import.meta.url),'utf8'));
  const report=await checkAcceptance();assert.equal(report.accepted,false);
  assert.equal(report.counts.original,603);assert.equal(report.counts.additional,Object.keys(ledger.additionalCaseResults).length);assert.ok(report.counts.additional>=16);assert.equal(report.counts.accepted,0);
  assert.equal(report.mode,'readiness');
});

// Filesystem fixtures are isolated temporary data, never native acceptance.
async function checkerProject(t) {
  const projectRoot=await mkdtemp(join(tmpdir(),'opendesk-checker-only-'));
  t.after(()=>rm(projectRoot,{recursive:true,force:true}));
  async function save(path,value) {
    const target=join(projectRoot,path);await mkdir(join(target,'..'),{recursive:true});
    const bytes=typeof value==='string'?value:JSON.stringify(value);
    await writeFile(target,bytes);return {path:target,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const spec={cases:Array.from({length:603},(_,i)=>({id:`CASE-${i}`,required:true}))};
  const ids=Array.from({length:191},(_,i)=>`CAP-${i}`);
  const ledger={caseResults:Object.fromEntries(spec.cases.map(c=>[c.id,{status:'not-tested'}])),
    additionalCaseResults:Object.fromEntries(Array.from({length:19},(_,i)=>[`F2-K2-SDK-${String(i+1).padStart(3,'0')}`,{status:'not-tested'}])),
    apiItems:[],capabilityItems:ids.map(id=>({id,status:'not-tested'})),resourceItems:[],denominatorHistory:[{requiredCapabilityIds:ids}]};
  const specRef=await save('frozen/test-spec-v5.json',spec), ledgerRef=await save('frozen/source-compatibility-ledger.json',ledger);
  const manifest=await save('frozen/manifest.json',{files:[specRef,ledgerRef]});
  await save('docs/framework/source-compatibility-ledger.json',ledger);
  await save('docs/framework/execution-gates.json',{currentPlan:{manifest:manifest.path,manifestSha256:manifest.sha256}});
  await save('docs/framework/historical-failure-mapping.json',{R1_R8:Array.from({length:8},(_,i)=>({id:`R${i+1}`})),historical17:Array.from({length:17},(_,i)=>({id:`H${i+1}`}))});
  const supplementalCatalog=await save(SUPPLEMENTAL_CATALOG,await readFile(new URL(`../../${SUPPLEMENTAL_CATALOG}`,import.meta.url),'utf8'));
  const raw=await save('raw.json',{fixtureOnly:true});
  const reports=await save('results.json',{results:[]});
  const paths=['src/source.js','manifest.json','wxt.config.mjs','scripts/build.mjs','scripts/verify-package.mjs',
    'scripts/build-contract.mjs','scripts/check-source.mjs','scripts/pack.mjs','scripts/wxt-checkpoint.mjs','scripts/zip-package.py',
    'package.json','package-lock.json','docs/contracts/licenses/todo-user-vue-MIT.txt'].sort();
  const sourceInputs=[];
  for (const path of paths) {const ref=await save(path,'fixture-only');sourceInputs.push({path,bytes:Buffer.byteLength('fixture-only'),sha256:ref.sha256});}
  const build=await save('build.json',{mode:'production',status:'passed',sourceInputs,sourceDriftDuringBuild:[],report:{packageHash:hash}});
  const candidate={...fixture().candidate,packageDirectory:'dist/development',resultReports:[reports],buildReport:build,reviews:[],raw,supplementalCatalog};
  for (const env of candidate.environments) {env.binary=raw;env.binarySha256=raw.sha256;env.versionEvidence=raw;}
  const candidateRef=await save('candidate.json',candidate);
  return {projectRoot,save,specRef,raw,candidate,candidatePath:candidateRef.path};
}
test('WXT build closure accepts all source/tooling inputs without requiring webpack',async t=>{
  const f=await checkerProject(t), result=await checkAcceptance(f);
  assert.equal(result.accepted,false); // This isolated fixture has no native evidence.
  assert.ok(!result.issues.some(i=>['BUILD_SOURCE_CLOSURE_CHANGED','BUILD_NOT_FROZEN','EVIDENCE_HASH_MISMATCH'].includes(i.code)));
});
test('WXT build closure rejects omitted, extra or duplicate input paths and reported build drift',async t=>{
  for (const [name,change,code] of [
    ['omitted packaging helper',b=>{b.sourceInputs=b.sourceInputs.filter(i=>i.path!=='scripts/zip-package.py');},'BUILD_SOURCE_CLOSURE_CHANGED'],
    ['extra webpack entry',b=>{b.sourceInputs.push({...b.sourceInputs[0],path:'webpack.config.cjs'});},'BUILD_SOURCE_CLOSURE_CHANGED'],
    ['duplicate source entry',b=>{b.sourceInputs.push({...b.sourceInputs[0]});},'BUILD_SOURCE_CLOSURE_CHANGED'],
    ['during-build drift',b=>{b.sourceDriftDuringBuild.push(b.sourceInputs[0]);},'BUILD_NOT_FROZEN']]) {
    await t.test(name,async t=>{
      const f=await checkerProject(t), build=JSON.parse(await readFile(f.candidate.buildReport.path,'utf8'));
      change(build);f.candidate.buildReport=await f.save('build.json',build);
      await f.save('candidate.json',f.candidate);
      assert.ok((await checkAcceptance(f)).issues.some(i=>i.code===code));
    });
  }
});
test('WXT build closure rereads current source, config and packaging bytes against frozen SHA and lengths',async t=>{
  for (const path of ['src/source.js','wxt.config.mjs','scripts/zip-package.py']) await t.test(path,async t=>{
    const f=await checkerProject(t);await writeFile(join(f.projectRoot,path),'changed-byte-content');
    assert.ok((await checkAcceptance(f)).issues.some(i=>i.code==='EVIDENCE_HASH_MISMATCH'&&i.subject===path));
  });
  await t.test('declared byte length',async t=>{
    const f=await checkerProject(t), build=JSON.parse(await readFile(f.candidate.buildReport.path,'utf8'));
    const input=build.sourceInputs.find(i=>i.path==='scripts/zip-package.py');input.bytes++;
    f.candidate.buildReport=await f.save('build.json',build);await f.save('candidate.json',f.candidate);
    assert.ok((await checkAcceptance(f)).issues.some(i=>i.code==='EVIDENCE_HASH_MISMATCH'&&i.subject===input.path));
  });
});
test('read-only filesystem check rejects actual raw evidence and declared source tampering',async t=>{
  const f=await checkerProject(t);
  const before=await checkAcceptance(f);assert.equal(before.accepted,false);
  assert.ok(!before.issues.some(i=>i.code==='EVIDENCE_HASH_MISMATCH'));
  await writeFile(f.raw.path,'tampered-evidence');
  await writeFile(join(f.projectRoot,'src/source.js'),'changed-source');
  const after=await checkAcceptance(f);
  assert.ok(after.issues.some(i=>i.code==='EVIDENCE_HASH_MISMATCH'&&i.subject===f.raw.path));
  assert.ok(after.issues.some(i=>i.code==='EVIDENCE_HASH_MISMATCH'&&i.subject==='src/source.js'));
});
test('read-only filesystem check rejects tampering with the approved603 specification',async t=>{
  const f=await checkerProject(t);await writeFile(f.specRef.path,'{"cases":[]}');
  await assert.rejects(checkAcceptance(f),/Approved case specification integrity failure/);
});

test('each successful campaign observation must satisfy its predicate; one good result cannot hide failure',()=>{
  for (const [name,change,code] of [
    ['sdkConcurrency',o=>o.measurements.httpWrites=2,'SDK_100_NOT_PROVEN'],
    ['sdkCrashes',o=>o.measurements.replayed=true,'SDK_CRASH_NOT_PROVEN'],
    ['workerTermination',o=>o.measurements.terminatedMs=60000,'WORKER_TERMINATION_NOT_PROVEN'],
    ['downloads',o=>o.download.state='interrupted','DISK_DOWNLOAD_NOT_PROVEN']]) {
    rejects(d=>{const id=name==='sdkCrashes'?d.candidate.campaigns[name][2]:d.candidate.campaigns[name][0];
      const bad=structuredClone(d.records.find(r=>r.id===id));bad.id+='-bad';
      for (const o of bad.observations) {o.occurrence.resultId=bad.id;o.occurrence.roundId+='-bad';o.occurrence.pointer+='-bad';change(o);}
      d.records.push(bad);d.candidate.campaigns[name].push(bad.id);},code);
  }
});
test('renaming records cannot duplicate one physical campaign occurrence',()=>{
  rejects(d=>{const row=d.records.find(r=>r.id==='mixed-1'),source=d.records.find(r=>r.id==='mixed-0');
    row.observations=structuredClone(source.observations);row.observations.forEach(o=>o.occurrence.resultId=row.id);},'CAMPAIGN_OCCURRENCE_REUSED');
  rejects(d=>delete d.records.find(r=>r.id==='mixed-0').observations[0].occurrence,'CAMPAIGN_OCCURRENCE_MISSING');
});
test('supplemental contracts are required and original/additional IDs cannot overlap',()=>{
  rejects(d=>delete d.records[2].contractSha256,'CASE_CONTRACT_MISMATCH');
  rejects(d=>d.supplementalSpec.cases[0].expected='changed-after-test','CASE_CONTRACT_MISMATCH');
  rejects(d=>d.ledger.additionalCaseResults['CASE-A']={status:'not-tested'},'OVERLAPPING_CASE_DENOMINATOR');
});
test('reviews bind the entire evidence snapshot, predecessor report and normalized identity with one role each',()=>{
  rejects(d=>d.records[0].observations[0].actual='different-evidence','REVIEW_INPUT_SNAPSHOT_MISMATCH');
  rejects(d=>d.candidate.reviews[1].architectReportSha256='b'.repeat(64),'CRITIC_ARCHITECT_BINDING_MISSING');
  rejects(d=>d.candidate.reviews[0].reviewerId=['product-author'],'INDEPENDENT_REVIEW_MISSING');
  rejects(d=>d.candidate.reviews[0].reviewerId=' PRODUCT-AUTHOR ','INDEPENDENT_REVIEW_MISSING');
  rejects(d=>d.candidate.reviews.push({...d.candidate.reviews[0],verdict:'REQUEST CHANGES'}),'REVIEW_CARDINALITY_INVALID');
});
test('artifact payload/descriptor and disk hashes, lengths and run identity must agree',()=>{
  rejects(d=>d.records.find(r=>r.kind==='download-complete').observations[0].download.artifact.sha256='b'.repeat(64),'DISK_DOWNLOAD_NOT_PROVEN');
  rejects(d=>d.records.find(r=>r.kind==='download-complete').observations[0].download.artifact.runId='other-run','DISK_DOWNLOAD_NOT_PROVEN');
  rejects(d=>d.records.find(r=>r.kind==='download-complete').observations[0].download.artifact.bytes=123,'DISK_DOWNLOAD_NOT_PROVEN');
  rejects(d=>d.records.find(r=>r.kind==='worker-termination').observations[0].measurements.workerIdentity={},'WORKER_TERMINATION_NOT_PROVEN');
});
test('malformed nullable references, observations, environments and reviews yield structured rejection',()=>{
  rejects(d=>d.records[0].observations[0].evidence=[null],'OBSERVATION_INCOMPLETE');
  rejects(d=>d.records[0].observations[0]=null,'OBSERVATION_MATRIX_MISSING');
  rejects(d=>d.candidate.environments[0]=null,'INVALID_ENVIRONMENTS');
  rejects(d=>d.candidate.reviews[0]=null,'REVIEW_CARDINALITY_INVALID');
  rejects(d=>d.records.find(r=>r.kind==='download-complete').observations[0].download.diskFile=null,'DISK_DOWNLOAD_NOT_PROVEN');
  rejects(d=>d.records[0].observations[0].evidence[0]={path:'fixture',sha256:[hash]},'OBSERVATION_INCOMPLETE');
  rejects(d=>d.candidate.environments[1].versionEvidence={sha256:hash},'VERSION_MATRIX_MISSING');
});
test('parsed review reports cannot hide missing nested evidence references',async t=>{
  const f=await checkerProject(t),review={role:'architect',evidence:[{path:'missing-review-input.json',sha256:hash}]};
  review.report=await f.save('review.json',review);f.candidate.reviews=[review];
  await f.save('candidate.json',f.candidate);
  const result=await checkAcceptance(f);
  assert.ok(result.issues.some(i=>i.code==='EVIDENCE_FILE_MISSING'&&i.subject==='missing-review-input.json'));
});
