// Global First evidence calculator. Pure Node; never operates a browser or creates a native receipt.
// The benchmark contract and raw trials remain in the existing workstream evidence directory.
// This helper computes ONLY scoped metrics after all pre-registered natural comparators were measured.
const STATUS=Object.freeze({EMPTY:'NOT_TESTED',PARTIAL:'INCOMPLETE',COMPLETE:'SCOPED_TRIALS_COMPLETE'});
const RANK_WITHHELD='NOT_RANKED';
const sha=/^[0-9a-f]{64}$/;
function fail(message){throw new Error('R5 benchmark: '+message)}
function yes(condition,message){if(!condition)fail(message)}
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function validTrial(t,scenario,knownComparators) {
  yes(t && typeof t==='object'&&!Array.isArray(t),'invalid trial');
  yes(typeof t.trialId==='string'&&/^[a-zA-Z0-9._-]{8,100}$/.test(t.trialId),'stable trial ID required');
  yes(t.scenarioId===scenario.id,'wrong scenario: '+t.scenarioId);
  yes(knownComparators.has(t.comparatorId),'unknown comparator '+t.comparatorId);
  yes(Number.isSafeInteger(t.runNumber)&&t.runNumber>=1&&t.runNumber<=scenario.repetitions,
      'run number out of pre-registered range');
  yes(['PASS','FAIL','UNKNOWN','BLOCKED','NOT_EQUIVALENT'].includes(t.outcome),'unknown outcome');
  yes(typeof t.channel==='string'&&t.channel.length>1&&typeof t.version==='string'&&t.version.length>0,
      'real comparator version/channel required');
  yes(typeof t.observedAt==='string'&&!Number.isNaN(Date.parse(t.observedAt)),'real observation date required');
  yes(Array.isArray(t.evidenceUrls)&&t.evidenceUrls.length>0&&t.evidenceUrls.every(x=>
    typeof x==='string'&&/^(https:\/\/[^ ]+|docs\/framework\/evidence\/[^ ]+)$/.test(x)),
    'independently inspectable evidence pointers required');
  yes(t.durationMs===null||Number.isFinite(t.durationMs)&&t.durationMs>=0,'duration must be measured or null');
  yes(t.modelCalls===null||Number.isSafeInteger(t.modelCalls)&&t.modelCalls>=0,'model calls must be observed or null');
  yes(t.costMicrosUsd===null||Number.isSafeInteger(t.costMicrosUsd)&&t.costMicrosUsd>=0,
    'cost must be sourced or null');
  if(t.outcome==='PASS'){
    yes(Number.isFinite(t.durationMs),'PASS requires observed duration');
    if(t.comparatorId==='opendesk' && scenario.id==='R5-T02'){
      yes(sha.test(t.sourceHash)&&sha.test(t.manifestHash),'OpenDesk needs immutable source/manifest receipt');
      yes(typeof t.runId==='string'&&t.runId.length>3&&typeof t.resultId==='string'&&t.resultId.length>3,
         'OpenDesk requires real RunId/ResultId strings');
      yes(t.retirementState==='released','OpenDesk must end with released Worker');
      yes(t.nativeEvidenceLevel==='REAL_CHROME_RECEIPT','Node/mocks cannot count as Chrome native');
      yes(sha.test(t.packageHash),'Chrome repeat requires matching physical extension package hash');
      yes(typeof t.installationId==='string'&&t.installationId.length>=8,
        'Chrome repeat requires fixed installed identity');
      yes(Number.isSafeInteger(t.generation)&&t.generation>0,
        'Chrome repeat requires fixed installation generation');
    }
  }
  if(t.modelCalls===0 && t.modelCallMeasurement!=='DIRECT_TRACE')
    fail('zero model calls require explicit direct-trace measurement; unknown is null');
  if(t.costMicrosUsd!==null && !t.costBasisUrl)fail('cost number needs its independently verifiable source');
}
export function evaluateR5Benchmark(plan, rawTrials, {scenarioId, comparatorIds}={}){
  yes(plan?.format==='opendesk.global-first-r5-benchmark-plan.v1','unknown frozen benchmark plan');
  yes(Array.isArray(rawTrials),'rawTrials must be an array');
  const scenario=plan.objectives.find(x=>x.id===scenarioId);
  yes(scenario,'scenario must already exist in pre-registered contract');
  const known=new Set(plan.comparatorWorkflows.map(x=>x.id));
  yes(Array.isArray(comparatorIds)&&comparatorIds.length>=2&&
    new Set(comparatorIds).size===comparatorIds.length&&comparatorIds.every(x=>known.has(x)),
    'declare at least two distinct known comparators BEFORE summarizing');
  const chosen=new Set(comparatorIds),seen=new Set(),selected=[];
  for(const t of rawTrials){
    if(t.scenarioId!==scenarioId || !chosen.has(t.comparatorId))continue;
    validTrial(t,scenario,known);
    const key=t.comparatorId+':'+t.runNumber;
    yes(!seen.has(key),'duplicate comparator + trial number, cannot cherry-pick');seen.add(key);
    yes(!selected.some(x=>x.trialId===t.trialId),'duplicate stable trial ID');selected.push(t);
  }
  if(scenarioId==='R5-T02') {
    // Distinct runs of the SAME installed revision. Mixed installations cannot
    // be called twenty repetitions, even when each individually has a receipt.
    const accepted=selected.filter(t=>t.comparatorId==='opendesk'&&t.outcome==='PASS');
    const runs=new Set(),results=new Set(),identities=new Set();
    for(const t of accepted) {
      yes(!runs.has(t.runId)&&!results.has(t.resultId),
        'a repeat must produce different trusted RunId and ResultId');
      runs.add(t.runId);results.add(t.resultId);
      identities.add(JSON.stringify([t.packageHash,t.sourceHash,t.manifestHash,
        t.installationId,t.generation]));
    }
    yes(identities.size<=1,
      'repeated runs mix source, package, manifest or installation generation');
  }
  // A repeated installed run is a sequence, not a bag of independently plausible
  // receipts. Never combine older RunId/ResultId or multiple task revisions into
  // a single apparent 20-run fixed-version benchmark.
  if(scenarioId==='R5-T02'){
    const own=selected.filter(t=>t.comparatorId==='opendesk'&&t.outcome==='PASS');
    const runIds=new Set(),resultIds=new Set(),identities=new Set();
    for(const t of own){
      yes(!runIds.has(t.runId),'reused RunId in purported independent runs');
      yes(!resultIds.has(t.resultId),'reused ResultId in purported independent runs');
      runIds.add(t.runId);resultIds.add(t.resultId);
      identities.add(t.sourceHash+':'+t.manifestHash);
    }
    yes(identities.size<=1,'mixed fixed-version source/manifest identity');
  }
  const rows=comparatorIds.map(id=>{
    const mine=selected.filter(x=>x.comparatorId===id).sort((a,b)=>a.runNumber-b.runNumber);
    const complete=mine.length===scenario.repetitions &&
      mine.every(x=>['PASS','FAIL'].includes(x.outcome));
    const pass=mine.filter(x=>x.outcome==='PASS');
    const timed=pass.map(x=>x.durationMs);
    const traced=complete&&mine.every(x=>x.modelCalls!==null);
    const costed=complete&&mine.every(x=>x.costMicrosUsd!==null);
    return {id,received:mine.length,required:scenario.repetitions,
      status:mine.length===0?STATUS.EMPTY:complete?STATUS.COMPLETE:STATUS.PARTIAL,
      passed:pass.length,failed:mine.filter(x=>x.outcome==='FAIL').length,
      unknown:mine.filter(x=>!['PASS','FAIL'].includes(x.outcome)).length,
      successRate:complete?pass.length/scenario.repetitions:null,
      medianSuccessDurationMs:timed.length?median(timed):null,
      modelCallCount:traced?mine.reduce((sum,x)=>sum+x.modelCalls,0):null,
      totalCostUsd:costed?mine.reduce((sum,x)=>sum+x.costMicrosUsd,0)/1e6:null};
  });
  const fullyObserved=rows.every(x=>x.status===STATUS.COMPLETE);
  // Ranking the median of successes alone would reward a fast but often failing bot.
  // Only allow descriptive time ordering if ALL pre-registered trials succeeded.
  const completeSuccess=fullyObserved&&rows.every(x=>x.passed===scenario.repetitions);
  const costsComplete=fullyObserved&&rows.every(x=>x.totalCostUsd!==null);
  const timesComplete=completeSuccess&&rows.every(x=>x.medianSuccessDurationMs!==null);
  const rankedTimes=timesComplete?
    rows.map(x=>({comparatorId:x.id,medianMs:x.medianSuccessDurationMs}))
      .sort((a,b)=>a.medianMs-b.medianMs):[];
  return Object.freeze({scenarioId,comparedCohort:[...comparatorIds],
    status:rows.every(x=>x.status===STATUS.EMPTY)?STATUS.EMPTY:fullyObserved?STATUS.COMPLETE:STATUS.PARTIAL,
    rows,scopedTimeRanking:timesComplete?rankedTimes:RANK_WITHHELD,
    costComparison:costsComplete?'MEASURED_ALL':RANK_WITHHELD,
    failureGate:timesComplete?'ALL_SCENARIO_RUNS_SUCCEEDED':'RANKING_WITHHELD_FOR_FAILURE_OR_MISSING_EVIDENCE',
    nativeEvidenceCertified:'NOT_CERTIFIED_BY_JSON_CALCULATOR',
    globalOrRegionalFirstClaim:'NOT_APPROVED',
    caution:'A complete measured cohort supports only independently audited dated/region/version-scoped findings; never WORLD_FIRST or GLOBAL_TOP5.'});
}
