import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {PassThrough} from 'node:stream';
import {createFeasibility,feasibilityTools,parseFeasibilityArgs,serveFeasibility,TEST_URL,POLICY_VERSION} from '../../native-agent/local-dev/feasibility.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {sha256} from '../../native-agent/local-dev/snapshot.mjs';
import {canonical} from '../../src/platform/protocol.js';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {MCP_TOOLS} from '../../native-agent/local-dev/mcp.mjs';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {functionSource} from '../../src/framework/control/value.js';
import {buildPageEvaluation,readPageEvaluationResult} from '../../src/scripting/user-scripts/page-evaluator.js';
const config={registrationId:'host-one',extensionId:'a'.repeat(32),tabId:2,documentId:'doc-one'};
const name=op=>'opendesk.feasibility.'+op;
async function fixture(t,options={}){
  const calls=[];let payload,starts=0;
  const state={enabled:true,connected:true,unknown:false,denied:false,target:{origin:new URL(options.url||TEST_URL).origin,url:options.url||TEST_URL,documentId:'doc-one',windowId:1,tabId:2,frameId:0}};
  const request=async(method,params,requestId)=>{
    calls.push({method,params,requestId});await options.before?.(method,state);
    let result;
    if(!state.connected)throw Object.assign(new Error('private path secret'),{code:'E_NATIVE_NOT_READY'});
    if(method==='bridge.status')result={extensionId:config.extensionId,enabled:state.enabled,nativeConnected:true,hostRegistrations:['host-one']};
    else if(method==='target.current')result={registrationId:'host-one',target:{...state.target}};
    else if(method==='run.start'){
      starts++;payload=params;
      if(state.unknown)throw Object.assign(new Error('ACK lost secret'),{code:'E_EFFECT_UNKNOWN'});
      result={runId:'run-one',sourceKind:'draft',target:params.target,revision:{sourceHash:params.sourceHash},state:'running',secret:'must not escape'};
    }else if(method==='request.get')result={format:'opendesk.native-admission.v1',...params,state:'OUTCOME_UNKNOWN'};
    else if(method==='run.get'){
      const value=payload.params.operation==='probe'?{title:'Test Lab'}:{value:payload.params.text,matched:true};
      result={run:{runId:'run-one',revision:{sourceHash:payload.sourceHash},target:{...payload.target,allowedOrigin:payload.target.origin},resultId:'result-one',state:'completed',retirementState:'released'},results:[{tag:'controller-result',runId:'run-one',resultId:'result-one',revision:{sourceHash:payload.sourceHash},state:'completed',outcome:{ok:true,valueWire:encodeValue(value)}}],...(state.denied?{resultDeliveryDenied:['run-one']}:{})};
    }else throw new Error('unexpected '+method);
    await options.after?.(method,result);
    return {v:1,kind:'response',requestId,result};
  };
  const endpoint=await createFeasibility({...config,...options,request});t.after(()=>endpoint.close());
  return {endpoint,state,calls,starts:()=>starts};
}
test('startup requires all explicit identities and strictly parses flags',async()=>{
  for(const key of Object.keys(config))await assert.rejects(createFeasibility({...config,[key]:undefined}),{code:'E_SCHEMA'});
  assert.throws(()=>parseFeasibilityArgs(['--tab-id','2x']),{code:'E_SCHEMA'});
  assert.throws(()=>parseFeasibilityArgs(['--allow-project','/tmp']),{code:'E_SCHEMA'});
  assert.deepEqual(parseFeasibilityArgs(['--tab-id','2','--allow-write-field']),{tabId:2,allowWriteField:true});
  assert.equal(MCP_TOOLS.length,7);
});
test('minimal tools and runtime schemas reject privilege-bearing and invalid arguments',async t=>{
  const f=await fixture(t);
  assert.deepEqual(f.endpoint.tools.map(t=>t.name),[name('probe'),name('result')]);
  const annotations=feasibilityTools(true).map(tool=>tool.annotations);
  assert.deepEqual(annotations.map(value=>value.readOnlyHint),[true,true,false]);
  assert.deepEqual(annotations.map(value=>value.idempotentHint),[true,true,false],
    'intent deduplication does not make writes or page event handlers idempotent');
  for(const args of [null,[],{}, {intentId:''},{intentId:'x'.repeat(101)},{intentId:'bad space'},...['source','path','selector','origin','registrationId','tabId','documentId'].map(k=>({intentId:'ok',[k]:'evil'}))])await assert.rejects(f.endpoint.dispatch(name('probe'),args),{code:'E_SCHEMA'});
  await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'x',text:'abc'}),{code:'E_SCHEMA'});
  await assert.rejects(f.endpoint.dispatch(name('result'),{taskId:'foreign'}),{code:'E_DEV_RUN'});
  assert.equal(f.calls.length,0);
});
test('submit then durable result retains original task/run/Host without source or inventories',async t=>{
  const f=await fixture(t),a=await f.endpoint.dispatch(name('probe'),{intentId:'intent-1'});
  assert.equal(a.taskId,'intent-1');assert.equal(a.runId,'run-one');assert.equal(a.registrationId,config.registrationId);
  assert.equal(f.calls.filter(c=>c.method==='run.get').length,0,'submit never polls');
  const start=f.calls.find(c=>c.method==='run.start');assert.equal(start.requestId,a.taskId);assert.deepEqual(start.params.target,f.state.target);
  assert.equal(start.params.registrationId,config.registrationId);
  const r=await f.endpoint.dispatch(name('result'),{taskId:a.taskId});assert.deepEqual(r.value,{title:'Test Lab'});
  assert.equal(r.run.retirementState,'released');assert.doesNotMatch(JSON.stringify(r),/sourceUtf8|files|secret|projects|local-dev/);
  await f.endpoint.dispatch(name('probe'),{intentId:a.taskId});assert.equal(f.starts(),1);
  await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:a.taskId,text:'x'}));
});
test('target capture refuses wrong tab/document/URL and drift before final run payload',async t=>{
  for(const delta of [{tabId:3},{documentId:'next'},{url:TEST_URL+'?x'}, {frameId:1}]){
    const f=await fixture(t);Object.assign(f.state.target,delta);
    await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'drift'}),{code:'E_DOCUMENT_STALE'});assert.equal(f.starts(),0);
  }
  let statuses=0;const f=await fixture(t,{before(method,state){if(method==='bridge.status'&&++statuses===2)state.target.documentId='new';}});
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'late-drift'}),{code:'E_DOCUMENT_STALE'});assert.equal(f.starts(),0);
});
test('changed resolver source cannot replace startup frozen source',async t=>{
  const f=await fixture(t),original=LocalDevResolver.prototype.resolve;
  t.mock.method(LocalDevResolver.prototype,'resolve',async function(...args){const v=await original.apply(this,args);return {...v,sourceUtf8:v.sourceUtf8+'\n'};});
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'changed'}),{code:'E_DEV_HASH'});assert.equal(f.starts(),0);
});
test('frozen disk validation failure refuses final admission',async t=>{
  const f=await fixture(t);
  t.mock.method(LocalDevResolver.prototype,'validateFrozen',async()=>{throw Object.assign(new Error('input changed'),{code:'E_PROJECT_CHANGED'});});
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'changed-input'}),{code:'E_PROJECT_CHANGED'});assert.equal(f.starts(),0);
});
test('UNKNOWN and concurrent duplicate intent are never replayed, even after reconnection',async t=>{
  const f=await fixture(t);f.state.unknown=true;
  const first=f.endpoint.dispatch(name('probe'),{intentId:'once'});
  await f.endpoint.dispatch(name('probe'),{intentId:'once'});
  await assert.rejects(first,{code:'E_EFFECT_UNKNOWN',outcome:'OUTCOME_UNKNOWN'});
  f.state.connected=false;
  await assert.rejects(f.endpoint.dispatch(name('result'),{taskId:'once'}));
  f.state.connected=true;
  await assert.rejects(f.endpoint.dispatch(name('result'),{taskId:'once'}),{code:'E_EFFECT_UNKNOWN'});
  assert.equal((await f.endpoint.dispatch(name('probe'),{intentId:'once'})).state,'OUTCOME_UNKNOWN');assert.equal(f.starts(),1);
});
test('revocation and disconnect refuse new runs and denied durable results remain denied',async t=>{
  const f=await fixture(t);f.state.enabled=false;
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'revoked'}),{code:'E_PERMISSION'});assert.equal(f.starts(),0);
  f.state.enabled=true;f.state.connected=false;
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'offline'}),{code:'E_NATIVE_NOT_READY'});assert.equal(f.starts(),0);
  f.state.connected=true;await f.endpoint.dispatch(name('probe'),{intentId:'allowed'});f.state.denied=true;
  await assert.rejects(f.endpoint.dispatch(name('result'),{taskId:'allowed'}),{code:'E_PERMISSION'});assert.equal(f.starts(),1);
});
test('opt-in write validates Unicode limit and reads actual property after filling without submit',async t=>{
  const f=await fixture(t,{allowWriteField:true});
  for(const text of [1,'a'.repeat(101),'😀'.repeat(101)])await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'write',text}),{code:'E_SCHEMA'});
  await f.endpoint.dispatch(name('write_field'),{intentId:'write',text:'Alice'});
  const r=await f.endpoint.dispatch(name('result'),{taskId:'write'});assert.deepEqual(r.value,{value:'Alice',matched:true});
  await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'write',text:'Bob'}),{code:'E_REQUEST_REUSED'});assert.equal(f.starts(),1);

});
test('stdio isolates tools and EOF closes admission while status awaits',async t=>{
  let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{async before(method){if(method==='bridge.status'){entered();await gate;}}});
  const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',c=>text+=c);
  serveFeasibility(f.endpoint,{input,output});
  const send=v=>input.write(JSON.stringify({jsonrpc:'2.0',...v})+'\n');
  send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}});
  send({method:'notifications/initialized'});send({id:2,method:'tools/list'});
  send({id:3,method:'tools/call',params:{name:'opendesk.dev.run',arguments:{}}});
  send({id:4,method:'tools/call',params:{name:name('probe'),arguments:{intentId:'eof'}}});
  await waiting;input.end();await new Promise(r=>input.once('end',r));release();await new Promise(r=>setImmediate(r));
  assert.equal(f.starts(),0);await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'later'}),{code:'E_DEV_SESSION_CLOSED'});
  const messages=text.trim().split('\n').map(JSON.parse);assert.equal(messages[0].result.serverInfo.name,'opendesk-feasibility');assert.equal(messages.find(m=>m.id===2).result.tools.length,2);assert.equal(messages.find(m=>m.id===3).error.code,-32602);
});

test('extension identity and Host registration mismatch fail closed',async t=>{
  for(const mutation of [{extensionId:'b'.repeat(32)},{hostRegistrations:['other-host']}]){
    const f=await fixture(t,{after(method,result){if(method==='bridge.status')Object.assign(result,mutation);}});
    await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'scope'}),{code:'E_PERMISSION'});assert.equal(f.starts(),0);
  }
});
test('real fixed-file resolver detects changed disk bytes without executing them',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-feasibility-'));
  const file=path.join(root,'fixed.mjs');fs.writeFileSync(file,'async function main(){return 1}');
  const resolver=new LocalDevResolver({allowedPaths:[file]});t.after(()=>{resolver.close();fs.rmSync(root,{recursive:true,force:true});});
  const {bindingId}=resolver.attach({path:file,runtimeKind:'controller',siteOrigin:new URL(TEST_URL).origin});
  const frozen=await resolver.resolve(bindingId);fs.writeFileSync(file,'async function main(){return 2}');
  await assert.rejects(resolver.validateFrozen(bindingId,frozen),{code:'E_PROJECT_CHANGED'});
});
test('Native throw after handoff preserves UNKNOWN and duplicate does not resend',async t=>{
  const f=await fixture(t,{before(method){if(method==='run.start')throw Object.assign(new Error('disconnected'),{code:'E_NATIVE_NOT_READY'});}});
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'lost'}),{code:'E_EFFECT_UNKNOWN',outcome:'OUTCOME_UNKNOWN'});
  assert.equal((await f.endpoint.dispatch(name('probe'),{intentId:'lost'})).state,'OUTCOME_UNKNOWN');
  assert.equal(f.calls.filter(c=>c.method==='run.start').length,1);
});

test('custom stdio dispatch enforces its schema and permits the valid empty write value',async t=>{
  const f=await fixture(t,{allowWriteField:true});
  const input=new PassThrough(),output=new PassThrough();t.after(()=>input.end());
  const messages=[];let resolveWrite;const written=new Promise(r=>resolveWrite=r);
  output.on('data',chunk=>{for(const line of chunk.toString().trim().split('\n')){const m=JSON.parse(line);messages.push(m);if(m.id===3)resolveWrite(m);}});
  serveFeasibility(f.endpoint,{input,output});
  const send=v=>input.write(JSON.stringify({jsonrpc:'2.0',...v})+'\n');
  send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}});
  send({method:'notifications/initialized'});
  send({id:2,method:'tools/call',params:{name:name('write_field'),arguments:{intentId:'invalid',text:'a'.repeat(101)}}});
  send({id:3,method:'tools/call',params:{name:name('write_field'),arguments:{intentId:'clear',text:''}}});
  const result=await written;assert.equal(result.result.isError,undefined);assert.equal(result.result.structuredContent.taskId,'clear');
  assert.equal(messages.find(m=>m.id===2).result.structuredContent.error.code,'E_SCHEMA');assert.equal(f.starts(),1);
});

test('local URL/selector configuration is exact, bounded, opt-in and frozen into final params',async t=>{
  const url='https://dev.example.test/forms?case=one',selector='textarea[data-test="notes"]';
  assert.deepEqual(parseFeasibilityArgs(['--url',url,'--selector',selector,'--allow-write-field']),{url,selector,allowWriteField:true});
  for(const invalid of ['file:///tmp/page','javascript:alert(1)','https://user:secret@example.test/',' https://example.test/','https://example.test',42])await assert.rejects(createFeasibility({...config,url:invalid}),{code:'E_SCHEMA'});
  for(const invalid of ['', ' ', '\n#name', '#x\x00', 'x'.repeat(513),42])await assert.rejects(createFeasibility({...config,selector:invalid}),{code:'E_SCHEMA'});
  const f=await fixture(t,{url,selector,allowWriteField:true});
  const result=await f.endpoint.dispatch(name('write_field'),{intentId:'custom',text:'notes'});
  const payload=f.calls.find(c=>c.method==='run.start').params;
  assert.deepEqual(payload.params,{operation:'write_field',text:'notes',policyDigest:result.policyDigest,
    policy:{version:POLICY_VERSION,url,selector,allowWriteField:true,...config}});
  assert.equal(result.policyVersion,POLICY_VERSION);
  assert.equal(result.policyDigest,sha256(canonical(payload.params.policy)));
  assert.equal(Object.isFrozen(payload.params),true);assert.equal(Object.isFrozen(payload.params.policy),true);
  assert.equal(payload.target.url,url);
  const other=await fixture(t,{url:'http://127.0.0.1:43111/another.html',selector:'#other'});
  const otherResult=await other.endpoint.dispatch(name('probe'),{intentId:'another'});
  assert.equal(result.sourceHash,otherResult.sourceHash,'local config never templates Controller source');
  assert.notEqual(result.policyDigest,otherResult.policyDigest);
  for(const property of ['url','selector','source','policy','policyDigest','registrationId','extensionId'])await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'override',text:'x',[property]:'evil'}),{code:'E_SCHEMA'});
});
test('final Native handoff refuses changed complete params, even with unchanged source hash',async t=>{
  const original=LocalDevSession.prototype.call;let tamper;
  t.mock.method(LocalDevSession.prototype,'call',function(method,params,...rest){
    if(method==='run.start')tamper(params);
    return original.call(this,method,params,...rest);
  });
  const mutations=[
    p=>{p.params={...p.params,text:'changed'};},
    p=>{p.params={...p.params,operation:'probe'};},
    p=>{p.params={...p.params,policyDigest:'0'.repeat(64)};},
    ...['url','selector','version','allowWriteField','registrationId','tabId'].map(key=>p=>{p.params={...p.params,policy:{...p.params.policy,[key]:'evil'}};}),
    p=>{p.params={...p.params,extra:true};},
    p=>{p.deadlineMs=120000;}
  ];
  for(tamper of mutations){
    const f=await fixture(t,{allowWriteField:true});
    await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'tampered',text:'intended'}),{code:'E_POLICY'});
    assert.equal(f.starts(),0);
  }
});
test('params are rechecked after awaited frozen-file validation and remote args are captured before awaits',async t=>{
  const originalCall=LocalDevSession.prototype.call,originalValidate=LocalDevResolver.prototype.validateFrozen;let finalPayload;
  t.mock.method(LocalDevSession.prototype,'call',function(method,params,...rest){if(method==='run.start')finalPayload=params;return originalCall.call(this,method,params,...rest);});
  t.mock.method(LocalDevResolver.prototype,'validateFrozen',async function(...args){await originalValidate.apply(this,args);finalPayload.params={...finalPayload.params,text:'late change'};});
  const f=await fixture(t,{allowWriteField:true});
  await assert.rejects(f.endpoint.dispatch(name('write_field'),{intentId:'late',text:'correct'}),{code:'E_POLICY'});assert.equal(f.starts(),0);
  t.mock.restoreAll();
  let mutated=false;const args={intentId:'captured',text:'original'};
  const g=await fixture(t,{allowWriteField:true,before(method){if(method==='bridge.status'&&!mutated){args.text='external mutation';mutated=true;}}});
  await g.endpoint.dispatch(name('write_field'),args);
  assert.equal(g.calls.find(c=>c.method==='run.start').params.params.text,'original');
});
test('custom URL target drift still refuses dispatch and result delivery',async t=>{
  const url='https://dev.example.test/custom',f=await fixture(t,{url,selector:'#notes'});
  await f.endpoint.dispatch(name('probe'),{intentId:'pinned'});
  f.state.target.url=url+'?changed';
  await assert.rejects(f.endpoint.dispatch(name('result'),{taskId:'pinned'}),{code:'E_DOCUMENT_STALE'});
  await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'drifted'}),{code:'E_DOCUMENT_STALE'});
  assert.equal(f.starts(),1);
});

// VM executes only the frozen Controller against a tiny DOM/Page substitute.
// No browser, Native request or actual form is opened or written by these tests.
const controllerSource=fs.readFileSync(new URL('../../native-agent/local-dev/feasibility-controller.mjs',import.meta.url),'utf8');
function controllerFixture({tag='input',type='text',text='hello',url='https://dev.example.test/form',selector='#notes',...flags}={}){
  const events=[];let writes=0,reads=0,current='old',field,fields;
  class Input{
    constructor(){Object.assign(this,{type,isConnected:true,disabled:false,readOnly:false},flags);}
    get value(){reads++;return current;}
    set value(v){writes++;current=v;}
    getAttribute(key){return key==='autocomplete'?this.autocomplete||'':null;}
    matches(){return Boolean(this.fieldsetDisabled);}
    closest(){return this.hidden||this.inert?{}:null;}
    getClientRects(){return this.noRects?[]:[{}];}
    dispatchEvent(event){events.push(event.type);flags.onEvent?.(event.type,this,v=>{current=v;});return true;}
  }
  class Textarea extends Input{}
  // Use separate native-like value descriptors on both constructors.
  Object.defineProperty(Textarea.prototype,'value',Object.getOwnPropertyDescriptor(Input.prototype,'value'));
  field=tag==='textarea'?new Textarea():tag==='input'?new Input():{};
  fields=Array.from({length:flags.count??1},()=>field);
  const policy={version:POLICY_VERSION,url,selector,allowWriteField:true,...config};
  const context=vm.createContext({params:{operation:'write_field',policy,policyDigest:sha256(canonical(policy)),text},
    location:{href:url},HTMLInputElement:Input,HTMLTextAreaElement:Textarea,
    Event:class{constructor(type){this.type=type;}},
    getComputedStyle:()=>({visibility:flags.visibility||'visible'}),
    document:{querySelectorAll(s){assert.equal(s,selector);return fields;},querySelector(s){assert.equal(s,selector);return fields[0];}},
    page:{url:async()=>url,title:async()=>'configured title',evaluate:async(fn,...args)=>fn(...args)}});
  return {context,field,events,writes:()=>writes,reads:()=>reads,run:()=>vm.runInContext(controllerSource+'\nmain()',context)};
}
test('fixed Controller writes only allowed text/search inputs and textarea, then reads after both events',async()=>{
  for(const opts of [{type:'text'},{type:'search'},{tag:'textarea'}]){
    const f=controllerFixture({...opts,text:'😀'.repeat(100)}),r=await f.run();
    assert.equal(r.value,'😀'.repeat(100));assert.equal(r.matched,true);assert.equal(f.writes(),1);assert.equal(f.reads(),1);assert.deepEqual(f.events,['input','change']);
  }
  const clear=controllerFixture({text:''});assert.equal((await clear.run()).value,'');
  const transformed=controllerFixture({onEvent(type,field,set){if(type==='input')set('transformed');}});
  assert.equal((await transformed.run()).matched,false);
});
test('dangerous/noneditable/hidden/multiple fields are refused before any write or read',async()=>{
  for(const opts of [
    ...['password','file','hidden','email','tel','url','number','date','checkbox','radio','submit','button','range','color'].map(type=>({type})),
    {disabled:true},{readOnly:true},{fieldsetDisabled:true},{hidden:true},{inert:true},{noRects:true},{visibility:'hidden'},{visibility:'collapse'},{isConnected:false},{tag:'div'},
    ...['current-password','new-password','one-time-code','cc-number','section-one cc-csc','transaction-amount'].map(autocomplete=>({autocomplete})),
    {count:0},{count:2}
  ]){
    const f=controllerFixture(opts);await assert.rejects(f.run(),/E_FIELD_(UNSAFE|SCOPE)/,JSON.stringify(opts));
    assert.equal(f.writes(),0,JSON.stringify(opts));assert.equal(f.reads(),0);assert.deepEqual(f.events,[]);
  }
});
test('Controller rejects location drift, write without opt-in and fields repurposed by event handlers',async()=>{
  const drift=controllerFixture();drift.context.location.href+='?new';await assert.rejects(drift.run(),/E_DOCUMENT_STALE/);assert.equal(drift.writes(),0);
  const noWrite=controllerFixture();noWrite.context.params.policy.allowWriteField=false;await assert.rejects(noWrite.run(),/E_SCHEMA/);assert.equal(noWrite.writes(),0);
  const many=controllerFixture({text:'x'.repeat(101)});await assert.rejects(many.run(),/E_SCHEMA/);assert.equal(many.writes(),0);
  for(const event of ['input','change']){
    const changed=controllerFixture({onEvent(type,field){if(type===event)field.type='password';}});
    await assert.rejects(changed.run(),/E_FIELD_CHANGED/);assert.equal(changed.writes(),1);assert.equal(changed.reads(),0,'do not read back a newly sensitive field');
  }
  const probe=controllerFixture();probe.context.params.operation='probe';assert.equal((await probe.run()).title,'configured title');assert.equal(probe.writes(),0);assert.equal(probe.reads(),0);
});

test('Controller evaluate uses the public function/variadic argument codec and serialized result contract',async()=>{
  const text='quote\" and backslash\\ <script> 😀',f=controllerFixture({text,selector:'textarea[data-field="notes"]',tag:'textarea'});
  const documentWorld=vm.createContext(Object.fromEntries(['document','location','HTMLInputElement','HTMLTextAreaElement','Event','getComputedStyle'].map(key=>[key,f.context[key]])));
  documentWorld.TextEncoder=TextEncoder;
  let evaluations=0;
  f.context.page.evaluate=async(fn,...args)=>{
    evaluations++;assert.equal(args.length,2);assert.equal(args[0].selector,'textarea[data-field="notes"]');assert.equal(args[1],text);
    const evaluation=buildPageEvaluation('evaluate',[{mode:'function',source:functionSource(fn)},args],{operationId:'feasibility-eval',runId:'feasibility-run'});
    assert.equal(evaluation.world,'USER_SCRIPT');
    const reply=await vm.runInContext(evaluation.code,documentWorld);
    return readPageEvaluationResult(JSON.parse(JSON.stringify(reply)));
  };
  assert.deepEqual(await f.run(),{value:text,matched:true});
  assert.equal(evaluations,1);assert.equal(f.writes(),1);assert.equal(f.reads(),1);assert.deepEqual(f.events,['input','change']);
  assert.equal('params' in documentWorld,false,'serialized callback cannot capture Controller params');
});

test('reserved intents remain ADMISSION_PENDING during status and source admission; duplicates and result never execute',async t=>{
  for(const phase of ['status','resolve']){
    let entered,release;
    const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
    t.after(()=>release());
    const f=await fixture(t,{async before(method){if(phase==='status'&&method==='bridge.status'){entered();await gate;}}});
    const original=LocalDevResolver.prototype.resolve;
    if(phase==='resolve')t.mock.method(LocalDevResolver.prototype,'resolve',async function(...args){entered();await gate;return original.apply(this,args);});
    const first=f.endpoint.dispatch(name('probe'),{intentId:'gated'});
    await waiting;
    const count=f.calls.length;
    for(const [operation,args] of [['probe',{intentId:'gated'}],['result',{taskId:'gated'}]]){
      const projected=await f.endpoint.dispatch(name(operation),args);
      assert.equal(projected.taskId,'gated');assert.equal(projected.state,'ADMISSION_PENDING');
      assert.equal(projected.runId,undefined);assert.equal(projected.error,undefined);
    }
    assert.equal(f.calls.length,count,'pending projections perform no additional Native calls');
    assert.equal(f.starts(),0);release();
    assert.equal((await first).state,'ACKNOWLEDGED');
    assert.equal((await f.endpoint.dispatch(name('result'),{taskId:'gated'})).run.state,'completed');
    assert.equal(f.starts(),1,'one intent causes exactly one run.start');
    t.mock.restoreAll();
  }
});
test('confirmed pre-admission failures stay queryable as NOT_DISPATCHED with safe refusal errors',async t=>{
  for(const reason of ['offline','revoked']){
    const f=await fixture(t);f.state.connected=reason!=='offline';f.state.enabled=reason!=='revoked';
    const expectedCode=reason==='offline'?'E_NATIVE_NOT_READY':'E_PERMISSION';
    await assert.rejects(f.endpoint.dispatch(name('probe'),{intentId:'refused'}),{code:expectedCode,outcome:'NOT_DISPATCHED'});
    const count=f.calls.length;
    for(const [operation,args] of [['result',{taskId:'refused'}],['probe',{intentId:'refused'}]]){
      const projected=await f.endpoint.dispatch(name(operation),args);
      assert.equal(projected.taskId,'refused');assert.equal(projected.state,'NOT_DISPATCHED');
      assert.deepEqual(projected.error,{code:expectedCode,message:'Feasibility admission refused',outcome:'NOT_DISPATCHED'});
      assert.equal(projected.runId,undefined);
      assert.doesNotMatch(JSON.stringify(projected),/private path|secret/);
    }
    assert.equal(f.calls.length,count,'refusal lookup works even while Native remains unavailable');
    assert.equal(f.starts(),0);
  }
});
