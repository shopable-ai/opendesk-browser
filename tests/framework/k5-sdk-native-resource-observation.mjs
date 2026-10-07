import assert from 'node:assert/strict';
import {requireResourceCounts, RESOURCE_KEYS} from './k5-controller-native-campaigns.mjs';

const TOOL_SCOPE = 'extension-tool-document';
const SDK_SCOPE = 'OpenDeskSDK';
const RELAY_SCOPE = 'relay.window';
const COMPOSED_SCOPE = 'tool-and-selected-sdk-document';
export const SDK_RESOURCE_BASELINE_CASES = Object.freeze([
  'LEGACY-APPSTORAGE-APPLOCAL-REAL-COMPLETION-PROMISES',
  'LEGACY-AXIOSX-ORIGINAL-HTTP-PARAMETERS-RESULTS-ERRORS',
  'LEGACY-FOUR-SERVICES-BRIDGE-DATA-AND-DIRECT-PROMISES',
  'LEGACY-TWO-FIXED-RESOURCES-SEVEN-ALIASES-BYTES-SHA',
  'LEGACY-SERVICE-SCHEMA-BOUNDS-REMOTE-NO-EXTERNAL-FETCH',
  'LEGACY-LOG-REAL-DUPLICATE-CONFLICT-ONE-EFFECT',
  'PERSISTENT-STRING-CONVERSION-AND-UNDEFINED-SETTLEMENT',
  'TYPED-JSON-HOP-FALSE-ZERO-OWN-NESTED-UNDEFINED',
  'NATIVE-SESSION-TYPED-VALUES',
  'HTTP-GET-POST-PUT-DELETE-BUSINESS-DATA',
  'CONFIG-REDIRECT-HTTP-ERROR-AND-UNGRANTED-METHOD',
  'REAL-RELAY-NATIVE-DUPLICATE-AND-CONFLICT',
  'NATIVE-100-CONCURRENT-SDK-PROMISES',
  'SESSION-AND-PERSISTENT-SURVIVE-SW-RESTART'
]);

const exactResourceCounts = observation => {
  const counts = requireResourceCounts(observation);
  assert.deepEqual(Object.keys(observation.counts).sort(), [...RESOURCE_KEYS].sort(),
    'Resource observation must expose exactly the six product counters');
  return counts;
};

const requireScope = (observation, scope) => {
  assert.equal(observation?.scope, scope, `Resource observation scope must be ${scope}`);
};

const requireHostTargetId = hostTargetId => {
  assert.equal(typeof hostTargetId, 'string', 'Native host target id must be a nonempty string');
  assert.notEqual(hostTargetId, '', 'Native host target id must be a nonempty string');
};

const requireHostPageTarget = (nativeTargets, hostTargetId) => {
  requireHostTargetId(hostTargetId);
  assert(nativeTargets.some(row => row?.type === 'page' && row.targetId === hostTargetId),
    'Actual native target inventory must include the observed host page target');
};

const requireSelectedDocument = selected => {
  assert(Number.isSafeInteger(selected?.tabId), 'Selected SDK tabId must be a real native tab id');
  assert(selected.tabId >= 0, 'Selected SDK tabId must be nonnegative');
  assert(Number.isSafeInteger(selected?.frameId), 'Selected SDK frameId must be a real native frame id');
  assert(selected.frameId >= 0, 'Selected SDK frameId must be nonnegative');
  assert.equal(typeof selected?.documentId, 'string', 'Selected SDK documentId must be a real native document id');
  assert.notEqual(selected.documentId, '', 'Selected SDK documentId must be present');
};

const dedicatedWorkers = nativeTargets =>
  nativeTargets.filter(row => row?.type === 'worker');

export async function observeNativeToolResources({evaluateTool, nativeTargets, hostTargetId}) {
  assert.equal(typeof evaluateTool, 'function', 'Actual tool evaluator is required');
  const lifecycle = await evaluateTool(`(async()=>{const d=globalThis.OpenDeskResourceDiagnostics;
    return d && typeof d.snapshot==='function' ? await d.snapshot() : null;})()`);
  const targets = typeof nativeTargets === 'function' ? await nativeTargets() : nativeTargets;
  assert(Array.isArray(targets), 'Actual native target inventory is required');
  requireHostPageTarget(targets, hostTargetId);
  const workers = dedicatedWorkers(targets);
  const observation = {scope: lifecycle?.scope, counts: lifecycle?.counts, lifecycle,
    nativeTargets: targets, dedicatedWorkers: workers, hostTargetId, observedAt: Date.now(),
    readPath: 'actual tool globalThis.OpenDeskResourceDiagnostics.snapshot()',
    observationMissing: lifecycle?.observationMissing || (lifecycle ? null : 'Product six-count lifecycle read is not connected')};
  const counts = exactResourceCounts(observation);
  requireScope(observation, TOOL_SCOPE);
  assert.equal(counts.workers, workers.length,
    'Tool boundary must agree with the actual native dedicated Worker inventory');
  return observation;
}

export function composeNativeSdkResources({tool, main, relay, selected}) {
  requireScope(tool, TOOL_SCOPE);
  requireScope(main, SDK_SCOPE);
  requireScope(relay, RELAY_SCOPE);
  requireSelectedDocument(selected);
  const counts = {...exactResourceCounts(tool)};
  const mainCounts = exactResourceCounts(main);
  const relayCounts = exactResourceCounts(relay);
  for (const key of RESOURCE_KEYS) counts[key] += mainCounts[key] + relayCounts[key];
  return {scope: COMPOSED_SCOPE, counts, owners: {tool, main, relay}, selected,
    nativeTargets: tool.nativeTargets, dedicatedWorkers: tool.dedicatedWorkers, observedAt: Date.now()};
}

export async function observeNativeSdkResources({observeTool, evaluateMain, evaluateRelay, readSelected, expectedSelected}) {
  for(const read of [observeTool,evaluateMain,evaluateRelay,readSelected])assert.equal(typeof read,'function','Actual native resource reader is required');
  const expected=structuredClone(expectedSelected);requireSelectedDocument(expected);
  const raw={expected,documentReads:{before:null,after:null},owners:{},readErrors:{}};
  try {
    const before=raw.documentReads.before=structuredClone(await readSelected());requireSelectedDocument(before);
    assert.deepEqual(before,expected,'Resource read must bind the installed native SDK document');
    const names=['tool','main','relay'];
    const reads=await Promise.allSettled([observeTool,evaluateMain,evaluateRelay].map(read=>Promise.resolve().then(read)));
    for(let i=0;i<names.length;i++) {
      const result=reads[i];
      if(result.status==='fulfilled')raw.owners[names[i]]=result.value;
      else {const error=result.reason;raw.readErrors[names[i]]={code:error.code,message:error.message,actual:error.actual,observation:error.observation};}
    }
    const after=raw.documentReads.after=structuredClone(await readSelected());requireSelectedDocument(after);
    assert.deepEqual(after,before,'Native SDK document changed while its realms were observed');
    const failed=reads.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    for(const owner of Object.values(raw.owners))exactResourceCounts(owner);
    return {...composeNativeSdkResources({...raw.owners,selected:before}),documentReads:raw.documentReads,
      readPaths:{tool:'actual tool OpenDeskResourceDiagnostics.snapshot()',main:'actual installed MAIN context OpenDeskSDK.diagnostics()',
        relay:'actual installed ISOLATED context __openDeskSdkRelayV1.diagnostics()'}};
  }catch(error){error.resourceObservation=raw;throw error;}
}

function requireComposedOwners(observation) {
  const composed=composeNativeSdkResources({...observation.owners,selected:observation.selected});
  assert.deepEqual(exactResourceCounts(observation),composed.counts,'Composed counts differ from actual owner observations');
}

export async function waitForNativeToolConnection({observe, onObservation = async () => {}, timeoutMs = 12000,
  delay = () => new Promise(resolve => setTimeout(resolve, 50))}) {
  assert.equal(typeof observe, 'function'); assert.equal(typeof onObservation, 'function');
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs >= 0);
  const deadline = Date.now() + timeoutMs; let first, attempt = 0;
  for (;;) {
    const observation = await observe();
    try {
      requireScope(observation, COMPOSED_SCOPE); requireComposedOwners(observation);
      requireHostTargetId(observation.owners.tool.hostTargetId);
      if (first) {
        assert.deepEqual(observation.selected, first.selected, 'Tool reconnect must retain the same selected document');
        assert.equal(observation.owners.tool.hostTargetId, first.hostTargetId, 'Tool reconnect owner changed');
      } else first = {selected: structuredClone(observation.selected), hostTargetId: observation.owners.tool.hostTargetId};
      const client = observation.owners.tool.lifecycle?.owners?.client;
      for (const key of ['pending', 'timers', 'subscriptions', 'ports']) {
        assert(Number.isSafeInteger(client?.[key]) && client[key] >= 0, `Actual tool client ${key} observation missing`);
        assert(client[key] <= observation.owners.tool.counts[key], `Actual tool client ${key} exceeds its owner counts`);
      }
      assert(client.ports <= 1, 'Actual tool client must own at most one connection');
      const connected = client.pending === 0 && client.timers === 0 && client.ports === 1;
      await onObservation({attempt: ++attempt, observedAt: Date.now(), connected, observation});
      if (connected) return observation;
      if (Date.now() >= deadline) throw Object.assign(new Error('Actual tool connection did not settle before the SDK resource baseline'),
        {code: 'E_NATIVE_CONNECTION_UNSETTLED'});
    } catch (error) { error.resourceObservation = observation; throw error; }
    await delay();
  }
}

export function requireIdleSdkResources(observation) {
  requireScope(observation,COMPOSED_SCOPE);requireComposedOwners(observation);
  for(const key of ['pending','timers','workers','blobs'])assert.equal(observation.counts[key],0,`SDK baseline still owns ${key}`);
  assert.equal(observation.owners.main.disposed,false,'Live SDK baseline requires its actual MAIN installation');
  assert.equal(observation.owners.relay.disposed,false,'Live SDK baseline requires its actual relay installation');
  return observation;
}

export async function runNativeSdkResourceCase({id,operation,observe,settle}) {
  assert.equal(typeof operation,'function');
  if(!SDK_RESOURCE_BASELINE_CASES.includes(id))return {actual:await operation(),resources:null};
  assert.equal(typeof observe,'function');assert.equal(typeof settle,'function');
  const resources={readyBefore:null,before:null,readyAfter:null,after:null,checked:false};let actual,completed=false,operationStarted=false,postReadyAttempted=false,postReadAttempted=false;
  try {
    resources.readyBefore=await settle();assert.equal(resources.readyBefore?.ready,true,'Actual SDK Ready must settle before its baseline');
    resources.before=await observe();requireIdleSdkResources(resources.before);
    operationStarted=true;actual=await operation();completed=true;
    postReadyAttempted=true;resources.readyAfter=await settle();assert.equal(resources.readyAfter?.ready,true,'Actual SDK Ready must settle after the operation');
    postReadAttempted=true;resources.after=await observe();requireIdleSdkResources(resources.after);
    validateNativeResourceBaseline(resources.before,resources.after);resources.checked=true;
    return {actual,resources};
  }catch(error){
    if(operationStarted) {
      resources.postFailure={};
      if(!postReadyAttempted)try {resources.readyAfter=await settle();assert.equal(resources.readyAfter?.ready,true,'Post-failure SDK Ready did not settle');}
        catch(failure){resources.postFailure.ready={code:failure.code,message:failure.message,actual:failure.actual,observation:failure.observation};}
      if(!postReadAttempted)try {
        resources.after=await observe();requireIdleSdkResources(resources.after);validateNativeResourceBaseline(resources.before,resources.after);
      }catch(failure){resources.postFailure.resources={code:failure.code,message:failure.message,actual:failure.actual,
        observation:failure.observation,resourceObservation:failure.resourceObservation};}
    }
    error.resourceObservations=resources;if(completed)error.observedFunctionResult=actual;throw error;
  }
}

export function validateNativeResourceBaseline(before, after) {
  requireScope(before, COMPOSED_SCOPE);
  requireScope(after, COMPOSED_SCOPE);
  requireScope(before?.owners?.tool, TOOL_SCOPE);
  requireScope(after?.owners?.tool, TOOL_SCOPE);
  requireScope(before?.owners?.main, SDK_SCOPE);
  requireScope(after?.owners?.main, SDK_SCOPE);
  requireScope(before?.owners?.relay, RELAY_SCOPE);
  requireScope(after?.owners?.relay, RELAY_SCOPE);
  assert.deepEqual(after?.selected, before?.selected, 'Selected SDK document must match the baseline');
  assert.deepEqual(exactResourceCounts(after), exactResourceCounts(before),
    'Actual tool/main/relay pending/timers/subscriptions/ports/workers/blobs must return to baseline');
  for(const owner of ['tool','main','relay'])assert.deepEqual(exactResourceCounts(after.owners[owner]),exactResourceCounts(before.owners[owner]),
    `Actual ${owner} resources must return to its baseline`);
  requireComposedOwners(before);requireComposedOwners(after);
  requireHostTargetId(before.owners.tool.hostTargetId);
  requireHostTargetId(after.owners.tool.hostTargetId);
  assert.equal(before.owners.tool.hostTargetId, after.owners.tool.hostTargetId,
    'Observed native host target must match the baseline');
  return true;
}

export function validateNativeSdkDisposal(before, after) {
  requireScope(before, COMPOSED_SCOPE);requireScope(after, COMPOSED_SCOPE);
  requireScope(before?.owners?.tool, TOOL_SCOPE);requireScope(after?.owners?.tool, TOOL_SCOPE);
  requireScope(before?.owners?.main, SDK_SCOPE);requireScope(after?.owners?.main, SDK_SCOPE);
  requireScope(before?.owners?.relay, RELAY_SCOPE);requireScope(after?.owners?.relay, RELAY_SCOPE);
  requireComposedOwners(before);requireComposedOwners(after);
  requireHostTargetId(before.owners.tool.hostTargetId);requireHostTargetId(after.owners.tool.hostTargetId);
  assert.equal(after.owners.tool.hostTargetId,before.owners.tool.hostTargetId);
  assert.deepEqual(after.selected,before.selected,'Explicit SDK disposal must retain the same native document');
  assert.equal(after.owners.main.disposed,true,'The actual MAIN SDK must report disposal');
  const beforeMain=exactResourceCounts(before.owners.main),afterMain=exactResourceCounts(after.owners.main);
  assert.deepEqual(exactResourceCounts(after.owners.tool),exactResourceCounts(before.owners.tool),'SDK disposal must not alter tool resources');
  assert.deepEqual(exactResourceCounts(after.owners.relay),exactResourceCounts(before.owners.relay),'SDK disposal must not alter relay resources');
  const beforeCounts=exactResourceCounts(before),afterCounts=exactResourceCounts(after);
  for(const key of RESOURCE_KEYS) {
    assert.equal(afterMain[key],0,`Disposed SDK still owns ${key}`);
    assert.equal(afterCounts[key],beforeCounts[key]-beforeMain[key],`SDK disposal ${key} delta differs from actual MAIN ownership`);
  }
  return true;
}

export {RESOURCE_KEYS};
