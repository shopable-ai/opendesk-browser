import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunContext, relayContextRequest} from '../../src/framework/context.js';
import {ChromePage, ChromeElement, Keyboard} from '../../src/framework/ChromePage.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {createWorkerPageProxy} from '../../src/scripting/sandbox/page-proxy.js';

const target = {tabId: 17, frameId: 4, documentId: 'document-A', targetVersion: 1, targetSessionId: 'target-A', allowedOrigin: 'https://a.example'};
const revision = {scriptId: 'script', revision: 1, sourceHash: '1'.repeat(64), paramsHash: '2'.repeat(64)};
const identity = {runId: 'run-A', ownerEpoch: 1, runRevision: 1, hostInstanceId: 'host-A', hostDocumentId: 'host-doc-A', target};
function fixture(handler = () => undefined, extra = {}) {
  const calls = [];
  const transport = {async request(envelope, config) { calls.push(envelope); const response = await handler(envelope, config); return {requestId: envelope.requestId, value: encodeValue(response)}; }};
  return {calls, context: createRunContext({identity, revision, target, transport, dom: null, ...extra})};
}
test('RESOURCE01-API16-LIMIT: approved script URL and executable-option refusals never dispatch',async()=>{
  const {context,calls}=fixture();
  try {
    await assert.rejects(context.page.addScriptTag({url:'https://remote/code.js'}),{code:'E_REMOTE_CODE_UNSUPPORTED'});
    await assert.rejects(context.page.addScriptTag({content:'document.title="forbidden"',onload:'code'}),{code:'E_OPTION_UNSUPPORTED'});
    await assert.rejects(context.page.addScriptTag({content:'document.title="forbidden"',type:'module'}),{code:'E_OPTION_UNSUPPORTED'});
    assert.equal(calls.length,0);assert.deepEqual(context.resourceSnapshot(),{pending:0,timers:0,subscriptions:0});
  } finally {context.dispose();}
});
test('RESOURCE01-API17: conflicting style inputs and remote resources are refused before dispatch',async()=>{
  const {context,calls}=fixture();
  try {
    for(const [options,code] of [[{content:'',url:'x'},'E_OPTION_UNSUPPORTED'],
      [{url:'https://remote/style.css'},'E_REMOTE_RESOURCE_UNSUPPORTED'],
      [{content:'@import "https://remote/style.css";'},'E_REMOTE_RESOURCE_UNSUPPORTED'],
      [{content:'#marker{background:url(https://remote/a.png)}'},'E_REMOTE_RESOURCE_UNSUPPORTED']]) {
      await assert.rejects(context.page.addStyleTag(options),{code});
      assert.equal(calls.length,0);assert.deepEqual(context.resourceSnapshot(),{pending:0,timers:0,subscriptions:0});
    }
  }finally{context.dispose();}
});

test('CMP11-API01/02/03/04: bound constructors, immutable pins and independent owners', async () => {
  assert.throws(() => new ChromePage(), {code: 'E_PAGE_CONTEXT_REQUIRED'});
  const a = fixture(e => e.target.documentId), b = fixture(e => e.target.documentId, {identity: {...identity, runId: 'run-B'}, target: {...target, tabId: 21, documentId: 'document-B'}});
  assert.equal(a.context.page.keyboard, a.context.page.keyboard); assert.equal(a.context.page.keyboard.page, a.context.page);
  assert.equal(a.context.page.environment, 'CHROME'); assert.equal(a.context.page.debug, true);
  assert.equal(new a.context.ChromePage({}).debug, undefined); assert.equal(new a.context.ChromePage({debug: false}).debug, false);
  assert.equal(await a.context.page.title(), 'document-A'); assert.equal(await b.context.page.title(), 'document-B');
  assert.throws(() => { a.context.revision.revision = 2; }, TypeError);
  assert.throws(() => { a.context.identity.runId = 'forged'; }, TypeError);
  assert.throws(() => new a.context.ChromePage({hidden: true}), {code: 'E_OPTION_UNSUPPORTED'});
  a.context.dispose(); b.context.dispose();
});

test('CMP11-API03-ERR: invalid debug on the admitted constructor is an option error before transport', () => {
  const {context,calls}=fixture();
  try {
    for (const debug of ['yes',0,{},null]) assert.throws(()=>new context.ChromePage({debug}),{code:'E_OPTION_UNSUPPORTED'});
    assert.equal(calls.length,0); assert.deepEqual(context.resourceSnapshot(),{pending:0,timers:0,subscriptions:0});
  } finally {context.dispose();}
});
test('CMP09-API21-ERR: invalid click options are option errors before any dispatch', async () => {
  const {context, calls} = fixture(() => 'clicked');
  try {
    for (const page of [context.page, new context.ChromePage({}), new context.ChromePage({debug:false})]) {
      for (const opts of [{delay:-1},{delay:NaN},{delay:Infinity},{clickCount:0},{clickCount:101},{clickCount:1.5},{button:'invalid'}]) {
        assert.throws(() => page.click('#submit',opts), {code:'E_OPTION_UNSUPPORTED'});
      }
    }
    assert.equal(calls.length,0); assert.equal(context.resourceSnapshot().pending,0);
    assert.equal(await context.page.click('#submit',{button:'left',clickCount:2,delay:10}), 'clicked');
    assert.deepEqual(decodeValue(calls[0].operation.args), ['#submit',{button:'left',clickCount:2,delay:10}]);
    assert.deepEqual(calls[0].identity, {...identity,target}); assert.deepEqual(calls[0].revision,revision);
    assert.equal(await new context.ChromePage({}).click('#submit'), 'clicked');
    assert.deepEqual(decodeValue(calls[1].operation.args), ['#submit',{button:'left',clickCount:1,delay:0}]);
    const detached=context.page.click;
    assert.throws(() => detached('#submit'), {code:'E_PAGE_CONTEXT_REQUIRED'});
    assert.equal(calls.length,2);
  } finally { context.dispose(); }
});
test('click normalization reads getters once and retains receiver, disposal and replacement fences',async()=>{
  const a=fixture(e=>e.target.documentId),b=fixture(e=>e.target.documentId,{identity:{...identity,runId:'run-B'},target:{...target,tabId:21,documentId:'document-B'}});
  try {
    const reads={button:0,clickCount:0,delay:0},opts={get button(){reads.button++;return 'left';},get clickCount(){reads.clickCount++;return 2;},get delay(){reads.delay++;return 10;}};
    assert.equal(await a.context.page.click.call(b.context.page,'#submit',opts),'document-B');
    assert.deepEqual(reads,{button:1,clickCount:1,delay:1});assert.equal(a.calls.length,0);assert.equal(b.calls[0].identity.runId,'run-B');
    b.context.dispose();await assert.rejects(a.context.page.click.call(b.context.page,'#submit'),{code:'E_CANCELLED'});assert.equal(b.calls.length,1);
  }finally{a.context.dispose();b.context.dispose();}
  let release;const calls=[];
  const next={...target,documentId:'document-next',targetVersion:2};
  const context=createRunContext({identity,revision,target,transport:{request(envelope){
    calls.push(envelope);
    if(envelope.operation.method==='click')return new Promise(resolve=>{release=()=>resolve({requestId:envelope.requestId,value:encodeValue('clicked')});});
    return Promise.resolve({requestId:envelope.requestId,value:encodeValue(undefined),handoff:{from:target,to:next}});
  }}});
  try {
    const pending=context.page.click('#submit'),rejected=assert.rejects(pending,{code:'E_DOCUMENT_REPLACED'});
    await context.page.goto('https://a.example/next');release();await rejected;
    assert.equal(calls[0].target.documentId,target.documentId);assert.equal(context.target.documentId,next.documentId);assert.equal(context.resourceSnapshot().pending,0);
  }finally{context.dispose();}
});

test('CMP09-API22-ERR: admitted type rejects invalid delay and nonprimitive text before dispatch',async()=>{
  const {context,calls}=fixture(e=>decodeValue(e.operation.args)[1]);
  try {
    for(const page of [context.page,new context.ChromePage(),new context.ChromePage({debug:false})]) {
      for(const delay of [-1,NaN,Infinity,'10'])assert.throws(()=>page.type('#text','x',{delay}),{code:'E_OPTION_UNSUPPORTED'});
      for(const text of [{},[],new Date(),()=>{},Symbol('x'),1n])assert.throws(()=>page.type('#text',text),{code:'E_VALUE_SERIALIZATION'});
    }
    assert.equal(calls.length,0);assert.deepEqual(context.resourceSnapshot(),{pending:0,timers:0,subscriptions:0});
    for(const text of ['A','',false,0,null,undefined])assert.equal(await context.page.type('#text',text),String(text));
    assert.deepEqual(calls.map(e=>decodeValue(e.operation.args)),['A','',false,0,null,undefined].map(text=>['#text',String(text),{delay:0}]));
    for(const envelope of calls){assert.deepEqual(envelope.identity,{...identity,target});assert.deepEqual(envelope.revision,revision);}
    const detached=context.page.type;assert.throws(()=>detached('#text','x'),{code:'E_PAGE_CONTEXT_REQUIRED'});
    assert.equal(calls.length,6);
  }finally{context.dispose();}
});

test('type delay normalization reads its getter once and keeps receiver and disposal fences',async()=>{
  const a=fixture(e=>e.target.documentId),b=fixture(e=>e.target.documentId,{identity:{...identity,runId:'run-B'},target:{...target,tabId:21,documentId:'document-B'}});
  try {
    let reads=0;const opts={get delay(){reads++;return reads===1?10:-1;}};
    assert.equal(await a.context.page.type.call(b.context.page,'#text','literal',opts),'document-B');
    assert.equal(reads,1);assert.equal(a.calls.length,0);assert.equal(b.calls[0].identity.runId,'run-B');
    assert.deepEqual(decodeValue(b.calls[0].operation.args),['#text','literal',{delay:10}]);
    b.context.dispose();await assert.rejects(a.context.page.type.call(b.context.page,'#text','literal'),{code:'E_CANCELLED'});
    assert.equal(b.calls.length,1);
  }finally{a.context.dispose();b.context.dispose();}
});
test('CMP10-API05/06 and CMP01-API36: raw callbacks and raw execute never dispatch', () => {
  const {context, calls} = fixture();
  assert.throws(() => context.page.handleMessage({action: 'operationCompleted'}, {}, () => {}), {code: 'E_CALLBACK_UNAUTHORIZED'});
  assert.throws(() => context.page.operationCompleted('live', '{"PageBrigeCode":0}'), {code: 'E_CALLBACK_UNAUTHORIZED'});
  assert.throws(() => context.page._execute('alert(1)', 'live'), {code: 'E_INTERNAL_API_ONLY'});
  assert.equal(calls.length, 0); context.dispose();
});
test('CMP10-API35: typed values and statement ignored args before registration', async () => {
  const {context, calls} = fixture(e => decodeValue(e.operation.args));
  for (const value of [false, 0, '', null, undefined, -0, {PageBrigeCode: 1, message: 'domain'}]) assert.deepEqual(decodeValue(JSON.parse(JSON.stringify(encodeValue(value)))), value);
  for (const value of [NaN, Infinity, 1n, () => {}, new Date()]) await assert.rejects(context.page.evaluate(x => x, value), {code: 'E_VALUE_SERIALIZATION'});
  const cycle = {}; cycle.self = cycle; await assert.rejects(context.page.evaluate(x => x, cycle), {code: 'E_VALUE_SERIALIZATION'});
  assert.throws(() => context.page.evaluate(Math.abs), {code: 'E_FUNCTION_SOURCE_UNSUPPORTED'});
  await context.page.evaluate('document.title="s"', 1n);
  assert.equal(calls.length, 1); assert.deepEqual(decodeValue(calls[0].operation.args), [{mode: 'legacy-statement', source: 'document.title="s"'}, []]);
  await context.page.evaluate(x => x, undefined); assert.equal(decodeValue(calls[1].operation.args)[1][0], undefined);
  context.dispose();
});
test('CMP03-API34 and CORE-EVALUATE-EXPRESSION: explicit modes and no extra parameters', async () => {
  const {context, calls} = fixture();
  assert.throws(() => context.page.eval('1+2'), {code: 'E_LEGACY_AMBIGUOUS_EXECUTION'});
  assert.throws(() => context.page.eval('1+2', {mode: 'guess'}), {code: 'E_OPTION_UNSUPPORTED'});
  assert.throws(() => context.page.evaluateExpression('false', 0), {code: 'E_ARGUMENT_TYPE'});
  assert.throws(() => context.page.evaluateExpression(' '), {code: 'E_ARGUMENT_TYPE'});
  assert.equal(calls.length, 0);
  await context.page.eval('1===1', {mode: 'expression'}); await context.page.evaluateExpression('Promise.resolve(3)');
  assert.equal(calls.every(e => e.operation.kind === 'user-script'), true); context.dispose();
});
test('CMP02-API12/13-LIMIT: Worker DOM snapshots reject; serialized alternatives preserve null/[]', async () => {
  const {context, calls} = fixture(e => e.operation.method === 'snapshot' ? null : []);
  await assert.rejects(context.page.$('#missing'), {code: 'E_DOM_SNAPSHOT_CONTEXT'});
  await assert.rejects(context.page.$$('.missing'), {code: 'E_DOM_SNAPSHOT_CONTEXT'}); assert.equal(calls.length, 0);
  assert.equal(await context.page.snapshot('#missing'), null); assert.deepEqual(await context.page.snapshots('.missing'), []); context.dispose();
});
test('NAV01 + ChromeElement: only attested navigation advances root; old element/keyboard sequence stay bound', async () => {
  const calls = [], to = {...target, documentId: 'document-next', targetVersion: 2};
  const transport = {async request(e) { calls.push(e); return {requestId: e.requestId, value: encodeValue(undefined), ...(e.operation.method === 'goto' ? {handoff: {from: e.target, to}} : {})}; }};
  const context = createRunContext({identity, revision, target, transport, dom: null});
  const element = new ChromeElement(context.page, '#name');
  assert.equal(element.page, context.page); assert.equal(element.selector, '#name'); assert.equal(new Keyboard(context.page).page, context.page);
  await context.page.goto('https://a.example/next', {timeout: 0, waitUntil: 'domcontentloaded'});
  assert.equal(context.target.documentId, 'document-next');
  await assert.rejects(element.click(), {code: 'E_DOCUMENT_REPLACED'});
  await assert.rejects(element.type('x'), {code: 'E_DOCUMENT_REPLACED'});
  assert.throws(() => element.uploadFile(new ArrayBuffer(0)), {code: 'E_DOCUMENT_REPLACED'});
  await context.page.title(); assert.equal(calls.at(-1).identity.target.documentId, 'document-next'); context.dispose();
});
test('CTRL owner fencing: stop/deadline/host-close settle pending once; stale request never rebinds new ctx', async () => {
  for (const code of ['E_CANCELLED', 'E_TIMEOUT', 'E_HOST_CLOSED']) {
    let resume; const {context, calls} = fixture(() => new Promise(resolve => { resume = resolve; }));
    const pending = context.page.title(); await Promise.resolve(); context.dispose(code); await assert.rejects(pending, {code});
    const fresh = fixture(() => 'fresh', {identity: {...identity, runId: 'run-next'}, target: {...target, tabId: 23}});
    resume('late'); await Promise.resolve(); assert.equal(await fresh.context.page.title(), 'fresh');
    assert.equal(calls[0].identity.runId, 'run-A'); assert.equal(calls[0].target.tabId, 17);
    await assert.rejects(context.page.title(), {code}); assert.equal(context.snapshot().pending, 0); fresh.context.dispose();
  }
  const expired = fixture(undefined, {deadline: performance.now() - 1}); await assert.rejects(expired.context.page.title(), {code: 'E_TIMEOUT'});
  assert.equal(expired.calls.length, 0);
});
test('Private Worker port: global fake peer, wrong owner, wrong correlation and reply replay cannot settle', async () => {
  const channel = new MessageChannel(); const proxy = createWorkerPageProxy({port: channel.port1, identity, revision, target});
  let operation; channel.port2.onmessage = ({data}) => { operation = data; }; channel.port2.start();
  let settled = 0; const request = proxy.page.title().then(v => { settled++; return v; });
  while (!operation) await new Promise(resolve => setTimeout(resolve, 1));
  for (const data of [
    {...operation, kind: 'reply', runId: 'forged', reply: {requestId: operation.envelope.requestId, value: encodeValue('fake')}},
    {...operation, kind: 'reply', ownerEpoch: 2, reply: {requestId: operation.envelope.requestId, value: encodeValue('fake')}},
    {...operation, kind: 'reply', reply: {requestId: 'wrong', value: encodeValue('fake')}}
  ]) channel.port2.postMessage(data);
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(settled, 0);
  const reply = {kind: 'reply', runId: identity.runId, ownerEpoch: 1, id: operation.id, reply: {requestId: operation.envelope.requestId, value: encodeValue('real')}};
  channel.port2.postMessage(reply); assert.equal(await request, 'real'); channel.port2.postMessage(reply); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(settled, 1);
  proxy.dispose(); channel.port2.close(); assert.equal(proxy.snapshot().pending, 0);
});
test('Host relay rejects cross-owner/old revision/old target before the shared transport', async () => {
  const {context, calls} = fixture(); const good = {requestId: 'op', identity, revision, target, operation: {kind: 'packaged', method: 'title', args: encodeValue([])}};
  for (const e of [{...good, identity: {...identity, hostInstanceId: 'other'}}, {...good, revision: {...revision, revision: 2}}, {...good, target: {...target, documentId: 'old'}}]) await assert.rejects(relayContextRequest(context, e));
  assert.equal(calls.length, 0); await relayContextRequest(context, good); assert.equal(calls.length, 1); context.dispose();
});
