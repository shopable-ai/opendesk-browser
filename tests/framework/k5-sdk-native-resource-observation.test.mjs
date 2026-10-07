import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  observeNativeToolResources,
  observeNativeSdkResources,
  composeNativeSdkResources,
  validateNativeResourceBaseline,
  validateNativeSdkDisposal,
  waitForNativeToolConnection,
  RESOURCE_KEYS
} from './k5-sdk-native-resource-observation.mjs';
import {runNativeSdkResourceCase,SDK_RESOURCE_BASELINE_CASES} from './k5-sdk-native-resource-observation.mjs';

const zeroCounts = () => Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0]));
const counts = values => ({...zeroCounts(), ...values});
const toolObservation = overrides => ({
  scope: 'extension-tool-document',
  counts: counts({subscriptions: 3, ports: 1}),
  owners: {shell: {subscriptions: 1}},
  nativeTargets: [],
  hostTargetId: 'tool-target',
  ...overrides
});
const mainObservation = overrides => ({
  scope: 'OpenDeskSDK',
  pending: 0,
  disposed: false,
  counts: counts({subscriptions: 2}),
  resources: [],
  observationMissing: null,
  ...overrides
});
const relayObservation = overrides => ({
  scope: 'relay.window',
  pending: 0,
  subscriptions: 5,
  disposed: false,
  counts: counts({subscriptions: 5}),
  observationMissing: null,
  ...overrides
});
const selectedDocument = overrides => ({tabId: 7, frameId: 0, documentId: 'document-1', ...overrides});

test('SDK ready does not admit a disconnected tool baseline; preserve the real reconnect observations', async () => {
  const observation = client => composeNativeSdkResources({
    tool: toolObservation({counts: counts({subscriptions: 3, ...client}), lifecycle: {owners: {client: {subscriptions: 2, ...client}}}}),
    main: mainObservation(), relay: relayObservation(), selected: selectedDocument()
  });
  const disconnected = observation({pending: 0, timers: 1, ports: 0});
  const connected = observation({pending: 0, timers: 0, ports: 1});
  const samples = [], reads = [disconnected, connected];
  const settled = await waitForNativeToolConnection({observe: async () => reads.shift(),
    onObservation: async sample => samples.push(sample), delay: async () => {}});
  assert.equal(settled, connected);
  assert.equal(samples.length, 2);
  assert.deepEqual(samples.map(sample => sample.observation.owners.tool.lifecycle.owners.client.timers), [1, 0]);
  assert.deepEqual(samples.map(sample => sample.connected), [false, true]);
  await assert.rejects(waitForNativeToolConnection({observe: async () => disconnected, timeoutMs: 0}),
    error => error.code === 'E_NATIVE_CONNECTION_UNSETTLED' && error.resourceObservation === disconnected);
});

test('tool connection observer rejects missing counters and owner/document changes instead of waiting them away', async () => {
  const observation = (client, selected = selectedDocument()) => composeNativeSdkResources({
    tool: toolObservation({counts: counts({subscriptions: 3, pending: client?.pending ?? 0, timers: client?.timers ?? 0,
      ports: client?.ports ?? 1}), lifecycle: {owners: {client}}}), main: mainObservation(), relay: relayObservation(), selected
  });
  for (const client of [undefined, {pending: 0, timers: 0, ports: 1}, {pending: 0, timers: -1, subscriptions: 2, ports: 1},
    {pending: 0, timers: '0', subscriptions: 2, ports: 1}, {pending: 0, timers: 0, subscriptions: 2, ports: 2}]) {
    await assert.rejects(waitForNativeToolConnection({observe: async () => observation(client)}));
  }
  for (const change of [x => x.selected.documentId = 'replacement-document', x => x.owners.tool.hostTargetId = 'replacement-tool']) {
    const before = observation({pending: 0, timers: 1, subscriptions: 2, ports: 0});
    const after = observation({pending: 0, timers: 0, subscriptions: 2, ports: 1}); change(after);
    const reads = [before, after];
    await assert.rejects(waitForNativeToolConnection({observe: async () => reads.shift(), delay: async () => {}}), /same|changed|match/i);
  }
  const leaked = observation({pending: 0, timers: 0, subscriptions: 2, ports: 1});
  leaked.owners.main.counts.timers = 1; leaked.counts.timers = 1;
  const stable = await waitForNativeToolConnection({observe: async () => leaked});
  await assert.rejects(runNativeSdkResourceCase({id: 'SESSION-AND-PERSISTENT-SURVIVE-SW-RESTART',
    settle: async () => ({ready: true}), observe: async () => stable,
    operation: async () => {throw new Error('Must not execute with a leaked MAIN timer');}}), /baseline still owns timers/);
});

test('actual SDK runner rejects missing or conflicting lanes and absent receipts before native startup', () => {
  const runner=fileURLToPath(new URL('./k5-sdk-native.mjs',import.meta.url));
  for(const args of [[],['--native','--contract-check'],['--native'],['--contract-check']]) {
    const result=spawnSync(process.execPath,[runner,...args],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,1);
    assert.match(result.stderr,args.length===1?/frozen candidate --rebuild-receipt/:/exactly one explicit/);
    assert.equal(result.stdout,'');
    assert.equal(result.error,undefined);
  }
});

test('intentional SDK disposal validates actual released MAIN counters while preserving live tool/relay owners', () => {
  const selected=selectedDocument();
  const before=composeNativeSdkResources({tool:toolObservation(),main:mainObservation(),relay:relayObservation(),selected});
  const after=composeNativeSdkResources({tool:toolObservation(),main:mainObservation({disposed:true,counts:zeroCounts()}),relay:relayObservation(),selected});
  assert.equal(validateNativeSdkDisposal(before,after),true);
  assert.throws(()=>validateNativeResourceBaseline(before,after),/baseline/);
  for(const change of [x=>x.owners.main.disposed=false,x=>x.owners.main.counts.timers=1,x=>x.owners.relay.counts.subscriptions=0,
    x=>x.owners.tool.counts.ports=0,x=>x.selected.documentId='another-document',x=>x.counts.subscriptions+=1]) {
    const invalid=structuredClone(after);change(invalid);assert.throws(()=>validateNativeSdkDisposal(before,invalid));
  }
});

test('observeNativeToolResources reads actual tool diagnostic global and native dedicated Worker inventory', async () => {
  const nativeTargets = [{targetId: 'host', type: 'page'}, {targetId: 'worker-1', type: 'worker'}];
  let expression;
  const result = await observeNativeToolResources({
    hostTargetId: 'host',
    nativeTargets,
    evaluateTool: async value => {
      expression = value;
      return {scope: 'extension-tool-document', counts: counts({workers: 1}), owners: {tool: true}};
    }
  });
  assert.match(expression, /globalThis\.OpenDeskResourceDiagnostics/);
  assert.doesNotMatch(expression, /OpenDeskSDK|__openDeskSdkRelayV1|dispose|cancel/i);
  assert.equal(result.counts.workers, 1);
  assert.deepEqual(result.dedicatedWorkers, [nativeTargets[1]]);
  assert.equal(result.readPath, 'actual tool globalThis.OpenDeskResourceDiagnostics.snapshot()');
});

test('missing or incomplete observer fails closed instead of fabricating zero counts', async () => {
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: 'host',
      nativeTargets: [{type: 'page', targetId: 'host'}],
      evaluateTool: async () => null
    }),
    error => error.code === 'E_CAMPAIGN_OBSERVATION_MISSING' &&
      error.actual.observationMissing === 'Product six-count lifecycle read is not connected'
  );
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: 'host',
      nativeTargets: [{type: 'page', targetId: 'host'}],
      evaluateTool: async () => ({scope: 'extension-tool-document', counts: counts({pending: undefined})})
    }),
    error => error.code === 'E_CAMPAIGN_OBSERVATION_MISSING'
  );
});

test('observer rejects invalid tool scope and dedicated Worker count disagreement', async () => {
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: '',
      nativeTargets: [{type: 'page', targetId: 'host'}],
      evaluateTool: async () => ({scope: 'extension-tool-document', counts: counts({})})
    }),
    /host target id/
  );
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: 'missing-host',
      nativeTargets: [{type: 'page', targetId: 'host'}],
      evaluateTool: async () => ({scope: 'extension-tool-document', counts: counts({})})
    }),
    /host page target/
  );
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: 'host',
      nativeTargets: [{type: 'page', targetId: 'host'}],
      evaluateTool: async () => ({scope: 'wrong.scope', counts: counts({})})
    }),
    /extension-tool-document/
  );
  await assert.rejects(
    observeNativeToolResources({
      hostTargetId: 'host',
      nativeTargets: [{type: 'page', targetId: 'host'}, {type: 'worker', targetId: 'worker-1'}, {type: 'worker', targetId: 'worker-2'}],
      evaluateTool: async () => ({scope: 'extension-tool-document', counts: counts({workers: 1})})
    }),
    /dedicated Worker inventory/
  );
});

test('composeNativeSdkResources preserves owners and sums shared owner counters once without mutation', () => {
  const tool = toolObservation({counts: counts({subscriptions: 3, ports: 1, workers: 1})});
  const main = mainObservation({counts: counts({pending: 2, timers: 2, subscriptions: 4})});
  const relay = relayObservation({counts: counts({pending: 1, timers: 1, subscriptions: 5})});
  const selected = selectedDocument();
  const before = structuredClone({tool, main, relay, selected});
  const result = composeNativeSdkResources({tool, main, relay, selected});
  assert.deepEqual(result.counts, counts({pending: 3, timers: 3, subscriptions: 12, ports: 1, workers: 1}));
  assert.equal(result.owners.tool, tool);
  assert.equal(result.owners.main, main);
  assert.equal(result.owners.relay, relay);
  assert.deepEqual({tool, main, relay, selected}, before);
});

test('composeNativeSdkResources rejects invalid SDK scopes, selected document shape, and non-exact counters', () => {
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation(),
    main: mainObservation({scope: 'wrong'}),
    relay: relayObservation(),
    selected: selectedDocument()
  }), /OpenDeskSDK/);
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation(),
    main: mainObservation(),
    relay: relayObservation({scope: 'wrong'}),
    selected: selectedDocument()
  }), /relay.window/);
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation(),
    main: mainObservation(),
    relay: relayObservation(),
    selected: selectedDocument({documentId: ''})
  }), /documentId/);
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation(),
    main: mainObservation(),
    relay: relayObservation(),
    selected: selectedDocument({tabId: -1})
  }), /tabId/);
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation(),
    main: mainObservation(),
    relay: relayObservation(),
    selected: selectedDocument({frameId: -1})
  }), /frameId/);
  assert.throws(() => composeNativeSdkResources({
    tool: toolObservation({counts: {...counts({}), extra: 1}}),
    main: mainObservation(),
    relay: relayObservation(),
    selected: selectedDocument()
  }), /exactly the six product counters/);
});

test('baseline rejects owner leaks hidden by aggregate offsets and detached aggregate counts',()=>{
  const selected=selectedDocument();
  const before=composeNativeSdkResources({tool:toolObservation(),main:mainObservation(),relay:relayObservation(),selected});
  const offset=composeNativeSdkResources({tool:toolObservation(),main:mainObservation({counts:counts({subscriptions:3})}),
    relay:relayObservation({counts:counts({subscriptions:4})}),selected});
  assert.deepEqual(offset.counts,before.counts);
  assert.throws(()=>validateNativeResourceBaseline(before,offset),/baseline|owner/);
  const detached=structuredClone(before);detached.owners.main.counts.subscriptions++;
  assert.throws(()=>validateNativeResourceBaseline(detached,structuredClone(before)),/baseline|owner|composed/i);
});
test('native SDK observation reads existing owners between two exact native document checks',async()=>{
  const order=[],selected=selectedDocument();
  const readers={expectedSelected:selected,readSelected:async()=>{order.push('document');return selected;},
    observeTool:async()=>{order.push('tool');return toolObservation();},evaluateMain:async()=>{order.push('main');return mainObservation();},
    evaluateRelay:async()=>{order.push('relay');return relayObservation();}};
  const observation=await observeNativeSdkResources(readers);
  assert.deepEqual(order,['document','tool','main','relay','document']);
  assert.deepEqual(observation.documentReads,{before:selected,after:selected});
  assert.deepEqual(observation.counts,counts({subscriptions:10,ports:1}));
  for(const replacement of [undefined,{...selected,documentId:'wrong-document'}]){
    let ownerReads=0;
    await assert.rejects(observeNativeSdkResources({...readers,readSelected:async()=>replacement,observeTool:async()=>{ownerReads++;return toolObservation();}}));
    assert.equal(ownerReads,0);
  }
  let reads=0;
  await assert.rejects(observeNativeSdkResources({...readers,readSelected:async()=>++reads===1?selected:{...selected,documentId:'replaced'}}),/document changed/);
  for(const evaluateMain of [async()=>null,async()=>mainObservation({counts:null,observationMissing:'unavailable'}),async()=>mainObservation({counts:{pending:0}})])
    await assert.rejects(observeNativeSdkResources({...readers,evaluateMain}));
});
test('native case gate observes exact idle owners around one original operation and preserves leaked evidence',async()=>{
  const selected=selectedDocument(),observation=()=>composeNativeSdkResources({tool:toolObservation(),main:mainObservation(),relay:relayObservation(),selected});
  const id='NATIVE-100-CONCURRENT-SDK-PROMISES',order=[];let effects=0;
  const options={id,settle:async()=>{order.push('ready');return {ready:true};},observe:async()=>{order.push('observe');return observation();},
    operation:async()=>{order.push('operation');effects++;return {marker:'original-result'};}};
  assert(SDK_RESOURCE_BASELINE_CASES.includes(id));assert(SDK_RESOURCE_BASELINE_CASES.includes('SESSION-AND-PERSISTENT-SURVIVE-SW-RESTART'));
  const result=await runNativeSdkResourceCase(options);
  assert.deepEqual(order,['ready','observe','operation','ready','observe']);assert.equal(effects,1);assert.equal(result.resources.checked,true);
  assert.deepEqual(result.actual,{marker:'original-result'});
  let observations=0;
  await assert.rejects(runNativeSdkResourceCase({...options,observe:async()=>{
    const value=observation();if(++observations===2){value.owners.main.counts.timers=1;value.counts.timers=1;}return value;
  }}),error=>{assert.equal(error.observedFunctionResult.marker,'original-result');assert.equal(error.resourceObservations.after.counts.timers,1);assert.equal(error.resourceObservations.checked,false);return true;});
  assert.equal(effects,2,'A failed resource verdict must not repeat the original operation');
  let called=false;
  await assert.rejects(runNativeSdkResourceCase({...options,observe:async()=>({scope:'tool-and-selected-sdk-document',counts:null}),operation:async()=>{called=true;}}));
  assert.equal(called,false,'Missing baseline must stop before executing its dependent function');
  const original=new Error('original-error');
  await assert.rejects(runNativeSdkResourceCase({...options,operation:async()=>{throw original;}}),error=>error===original&&error.resourceObservations.before!==null&&error.resourceObservations.checked===false);
  const independent=await runNativeSdkResourceCase({id:'NATIVE-NAVIGATION-INVALIDATES-OLD-DOCUMENT',operation:async()=>42,
    observe:()=>{throw new Error('Wrong document baseline');},settle:()=>{throw new Error('Wrong admission');}});
  assert.deepEqual(independent,{actual:42,resources:null});
});
test('validateNativeResourceBaseline requires exact matching owner scopes and six-count baseline', () => {
  const selected = selectedDocument();
  const before = composeNativeSdkResources({
    tool: toolObservation({counts: counts({ports: 1})}),
    main: mainObservation({counts: counts({subscriptions: 1})}),
    relay: relayObservation({counts: counts({subscriptions: 5})}),
    selected
  });
  const after = composeNativeSdkResources({
    tool: toolObservation({counts: counts({ports: 1})}),
    main: mainObservation({counts: counts({subscriptions: 1})}),
    relay: relayObservation({counts: counts({subscriptions: 5})}),
    selected
  });
  assert.equal(validateNativeResourceBaseline(before, after), true);
  assert.throws(() => validateNativeResourceBaseline(before, {...after, counts: counts({pending: 1, ports: 1, subscriptions: 6})}),
    /must return to baseline/);
  assert.throws(() => validateNativeResourceBaseline(before, {
    ...after,
    owners: {...after.owners, relay: {...after.owners.relay, scope: 'wrong'}}
  }), /relay.window/);
  const withoutHostBefore = {...before, owners: {...before.owners, tool: {...before.owners.tool, hostTargetId: undefined}}};
  const withoutHostAfter = {...after, owners: {...after.owners, tool: {...after.owners.tool, hostTargetId: undefined}}};
  assert.throws(() => validateNativeResourceBaseline(withoutHostBefore, withoutHostAfter), /host target id/);
});

test('failed original operation retains its exception and attempts both post-ready and read-only resource evidence',async()=>{
  const selected=selectedDocument(),snapshot=()=>composeNativeSdkResources({tool:toolObservation(),main:mainObservation(),relay:relayObservation(),selected});
  const original=new Error('original-operation-failed'),readyFailure=new Error('post-ready-unavailable');
  let reads=0,settles=0,effects=0;
  await assert.rejects(runNativeSdkResourceCase({id:'NATIVE-100-CONCURRENT-SDK-PROMISES',
    operation:async()=>{effects++;throw original;},settle:async()=>{if(++settles===2)throw readyFailure;return {ready:true};},
    observe:async()=>{reads++;return snapshot();}}),error=>{
    assert.equal(error,original);assert.equal(error.resourceObservations.after.counts.pending,0);
    assert.equal(error.resourceObservations.postFailure.ready.message,readyFailure.message);
    assert.equal(error.resourceObservations.checked,false);return true;
  });
  assert.equal(effects,1);assert.equal(settles,2);assert.equal(reads,2);
});

test('failed realm read preserves every completed owner and the original missing-count diagnostics',async()=>{
  const selected=selectedDocument(),actual={scope:'OpenDeskSDK',counts:{pending:0},observationMissing:'missing timers'};
  const original=Object.assign(new Error('partial MAIN counters'),{code:'E_CAMPAIGN_OBSERVATION_MISSING',actual});
  let documentReads=0;
  await assert.rejects(observeNativeSdkResources({expectedSelected:selected,readSelected:async()=>{documentReads++;return selected;},
    observeTool:async()=>toolObservation(),evaluateMain:async()=>{throw original;},evaluateRelay:async()=>relayObservation()}),error=>{
    assert.equal(error,original);assert.deepEqual(error.actual,actual);
    assert.deepEqual(error.resourceObservation.owners.tool,toolObservation());
    assert.deepEqual(error.resourceObservation.owners.relay,relayObservation());
    assert.deepEqual(error.resourceObservation.readErrors.main.actual,actual);
    assert.deepEqual(error.resourceObservation.documentReads.after,selected);return true;
  });
  assert.equal(documentReads,2);
});
