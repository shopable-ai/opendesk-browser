import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWorkflowResponse,parseWorkflowResponse,responsesAdapterCapabilities,
  responsePlanningObservation,assertResponseLocators} from '../../src/ui/workflow/responses.js';

const proposal={title:'填写',description:'',paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
  steps:[{stepId:'fill1',op:'fill',locatorKind:'css',selector:'#keyword',text:'给我一个亿的项目'}]};
const message=(text=JSON.stringify(proposal))=>({id:'msg_1',type:'message',role:'assistant',status:'completed',
  content:[{type:'output_text',text,annotations:[]}]});
const envelope=()=>({id:'resp_1',object:'response',status:'completed',output:[message()]});
const json=(data=envelope(),init={})=>new Response(JSON.stringify(data),{
  ...init,headers:{'Content-Type':'application/json',...init.headers}});
const options={endpoint:'https://api.openai.com/v1/responses',apiKey:'unit-test-only-key',model:'fixture-model',
  instructions:'Return a JSON object for the supplied workflow schema.',input:'{"request":"填写"}'};
const invoke=(extra={})=>requestWorkflowResponse({...options,fetchImpl:async()=>json(),...extra});
const target={windowId:1,tabId:2,frameId:0,documentId:'document-one',url:'https://example.test/form?private=local',origin:'https://example.test'};
const node={state:{visible:true},locator:{kind:'css',value:'#keyword'}};
const receipt=()=>({format:'opendesk.workflow-observation.v1',runId:'run_1',resultId:'result_1',sourceHash:'a'.repeat(64),
  summary:{kind:'semantic-dom-summary',origin:target.origin,documentId:target.documentId,nodes:[structuredClone(node)],truncated:false}});

// Synthetic HTTP fixtures: these tests never call a model or a real browser.
test('official wire uses input/instructions/text.format and not messages/temperature',async()=>{
  let sent,url;const result=await invoke({fetchImpl:async(u,o)=>{url=u;sent=o;return json();}});
  assert.equal(url,options.endpoint);assert.equal(sent.method,'POST');assert.equal(sent.redirect,'error');
  assert.equal(sent.credentials,'omit');assert.equal(sent.cache,'no-store');assert.equal(sent.referrerPolicy,'no-referrer');
  assert.equal(sent.headers.Authorization,'Bearer '+options.apiKey);
  const body=JSON.parse(sent.body);assert.deepEqual(body.text,{format:{type:'json_object'}});
  assert.equal(body.stream,false);assert.equal(body.store,false);assert.equal(body.background,false);
  assert.equal(body.model,options.model);assert.equal(body.instructions,options.instructions);
  assert.equal(body.input[0].content[0].type,'input_text');
  for(const field of ['messages','temperature','tools','previous_response_id'])assert.equal(Object.hasOwn(body,field),false);
  assert.deepEqual(result.proposal,proposal);assert.equal(result.metadata.responseId,'resp_1');
});
test('strict schema is an explicit trusted option, with no silent format fallback',async()=>{
  let body;const schema={type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false};
  await invoke({jsonSchema:{name:'workflow_fixture',schema},fetchImpl:async(_,o)=>{body=JSON.parse(o.body);return json();}});
  assert.deepEqual(body.text.format,{type:'json_schema',name:'workflow_fixture',schema,strict:true});
});
test('capabilities distinguish JSON mode, strict schema transport, local abort and confirmed remote cancel',()=>{
  const caps=responsesAdapterCapabilities();assert.equal(caps.structuredOutput,false);
  assert.equal(caps.modelCompatibility,'NOT_PROBED');assert.equal(caps.localAbort,true);assert.equal(caps.cancel,false);
  for(const key of ['streaming','observation','toolCalls','activeConversation','coldResume','background'])assert.equal(caps[key],false);
  assert.equal(responsesAdapterCapabilities({jsonSchema:{}}).structuredOutput,true);
});
for(const endpoint of ['http://127.0.0.1:8000/v1/responses','http://[::1]:8000/v1/responses','http://10.0.0.2/v1/responses',
  'http://example.test/v1/responses','https://user:key@example.test/v1/responses','https://example.test/v1/responses#x',
  'https://example.test/v1/responses?key=x','https://example.test/v1/chat/completions','https://example.test/v1/responses/'])
  test('rejects unimplemented/insecure endpoint '+endpoint,async()=>{
    let calls=0;await assert.rejects(invoke({endpoint,fetchImpl:async()=>{calls++;return json();}}),{code:'E_AI_CONFIG'});
    assert.equal(calls,0);
  });
for(const [field,value] of Object.entries({tools:[],stream:true,previous_response_id:'resp_other',store:true,background:true,
  conversation:'conv_other',temperature:0,tool_choice:'auto'}))
  test('unsupported request field is rejected, not ignored: '+field,async()=>{
    await assert.rejects(invoke({[field]:value}),{code:'E_AI_UNSUPPORTED'});
  });
for(const status of ['failed','incomplete','cancelled','queued','in_progress',undefined])
  test('never admits noncompleted response '+status,()=>{
    assert.throws(()=>parseWorkflowResponse({...envelope(),status}),
      {code:status==='incomplete'?'E_AI_INCOMPLETE':'E_AI_PROVIDER'});
  });
test('completed response with an error still fails',()=>{
  assert.throws(()=>parseWorkflowResponse({...envelope(),error:{message:'PRIVATE UPSTREAM ERROR'}}),{code:'E_AI_PROVIDER'});
});
test('completed response with incomplete details still fails',()=>{
  assert.throws(()=>parseWorkflowResponse({...envelope(),incomplete_details:{reason:'max_output_tokens'}}),{code:'E_AI_PROVIDER'});
});
test('ignores SDK-only output_text convenience property',()=>{
  assert.throws(()=>parseWorkflowResponse({...envelope(),output:[],output_text:JSON.stringify(proposal)}),{code:'E_AI_RESPONSE'});
});
test('ignores reasoning while parsing final typed message; never returns hidden reasoning',()=>{
  const result=parseWorkflowResponse({...envelope(),output:[{type:'reasoning',summary:[{text:'NEVER_REPLAY'}]},message()]});
  assert.deepEqual(result.proposal,proposal);assert.equal(JSON.stringify(result).includes('NEVER_REPLAY'),false);
});
test('joins fragments of one output message without assuming output[0]',()=>{
  const m=message();const str=m.content[0].text;
  m.content=[{type:'output_text',text:str.slice(0,37)},{type:'output_text',text:str.slice(37)}];
  assert.deepEqual(parseWorkflowResponse({...envelope(),output:[{type:'reasoning'},m]}).proposal,proposal);
});
for(const type of ['function_call','computer_call','web_search_call','local_shell_call','future_unknown_type'])
  test('does not impersonate caller-managed tools: '+type,()=>{
    assert.throws(()=>parseWorkflowResponse({...envelope(),output:[message(),{type}]}),{code:'E_AI_UNSUPPORTED'});
  });
test('refusal is terminal and not a usable proposal',()=>{
  const m=message();m.content.push({type:'refusal',refusal:'not allowed'});
  assert.throws(()=>parseWorkflowResponse({...envelope(),output:[m]}),{code:'E_AI_REFUSAL'});
});
for(const patch of [{status:'incomplete'},{role:'user'},{phase:'commentary'},{phase:'future_unknown_phase'}])
  test('rejects incomplete/nonfinal/nonassistant message '+JSON.stringify(patch),()=>{
    assert.throws(()=>parseWorkflowResponse({...envelope(),output:[{...message(),...patch}]}),{code:'E_AI_PROTOCOL'});
  });
for(const text of ['```json\n{}\n```','[]','null','not json',''])
  test('rejects nonobject or malformed final JSON '+JSON.stringify(text),()=>{
    assert.throws(()=>parseWorkflowResponse({...envelope(),output:[message(text)]}),{code:'E_AI_RESPONSE'});
  });
test('rejects a proposal split across separate complete messages',()=>{
  assert.throws(()=>parseWorkflowResponse({...envelope(),output:[message('{'),message('}')]}),{code:'E_AI_RESPONSE'});
});
test('does not invent usage; preserves real usage only when present',()=>{
  assert.equal(Object.hasOwn(parseWorkflowResponse(envelope()).metadata,'usage'),false);
  const usage={input_tokens:4,output_tokens:2,total_tokens:6,input_tokens_details:{cached_tokens:0}};
  assert.deepEqual(parseWorkflowResponse({...envelope(),usage}).metadata.usage,usage);
  assert.throws(()=>parseWorkflowResponse({...envelope(),usage:{total_tokens:0}}),{code:'E_AI_PROTOCOL'});
});
test('retains upstream request id separately from response id',async()=>{
  const result=await invoke({fetchImpl:async()=>json(envelope(),{headers:{'x-request-id':'req_123'}})});
  assert.equal(result.metadata.upstreamRequestId,'req_123');assert.equal(result.metadata.responseId,'resp_1');
});
test('HTTP failure exposes status but not upstream secrets and never retries',async()=>{
  let calls=0;
  await assert.rejects(invoke({fetchImpl:async()=>{calls++;return new Response('SECRET',{status:429});}}),e=>{
    assert.equal(e.code,'E_AI_PROVIDER');assert.equal(e.httpStatus,429);assert.equal(e.message.includes('SECRET'),false);return true;
  });assert.equal(calls,1);
});
test('HTTP 200 invalid JSON is rejected',async()=>{
  await assert.rejects(invoke({fetchImpl:async()=>new Response('{broken',{headers:{'Content-Type':'application/json'}})}),{code:'E_AI_RESPONSE'});
});
for(const type of ['text/event-stream','text/html','text/plain'])
  test('non-JSON media type is rejected: '+type,async()=>{
    await assert.rejects(invoke({fetchImpl:async()=>new Response('{}',{headers:{'Content-Type':type}})}),{code:'E_AI_PROTOCOL'});
  });
test('declared Content-Length over the cap is rejected before buffering',async()=>{
  await assert.rejects(invoke({maxResponseBytes:100,fetchImpl:async()=>json(envelope(),{headers:{'Content-Length':'10000'}})}),{code:'E_AI_RESPONSE'});
});
test('UTF-8 byte cap rejects Chinese body without Content-Length',async()=>{
  await assert.rejects(invoke({maxResponseBytes:80,fetchImpl:async()=>json({x:'汉'.repeat(40)})}),{code:'E_AI_RESPONSE'});
});
test('incremental body crossing cap cancels its stream',async()=>{
  let cancelled=false,count=0;
  const stream=new ReadableStream({pull(c){count++;c.enqueue(new Uint8Array(60));},cancel(){cancelled=true;}});
  await assert.rejects(invoke({maxResponseBytes:100,fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})}),{code:'E_AI_RESPONSE'});
  assert.equal(cancelled,true);assert.ok(count<6);
});
test('request budget is UTF-8 bounded before fetch',async()=>{
  let calls=0;await assert.rejects(invoke({input:'汉'.repeat(25000),fetchImpl:async()=>{calls++;return json();}}),{code:'E_AI_INPUT_LIMIT'});
  assert.equal(calls,0);
});
test('already aborted request never sends network traffic',async()=>{
  const abort=new AbortController();abort.abort();let calls=0;
  await assert.rejects(invoke({signal:abort.signal,fetchImpl:async()=>{calls++;return json();}}),{code:'E_CANCELLED'});
  assert.equal(calls,0);
});
test('abort prevents late success even when fetch ignores AbortSignal',async()=>{
  let release;const abort=new AbortController();
  const pending=invoke({signal:abort.signal,fetchImpl:()=>new Promise(resolve=>{release=resolve;})});
  abort.abort();await assert.rejects(pending,e=>e.code==='E_CANCELLED'&&e.upstreamTermination==='NOT_CONFIRMED');
  release(json());await new Promise(resolve=>setTimeout(resolve,0));
});
test('timeout with uncooperative fetch returns unknown outcome without retry',async()=>{
  let calls=0;await assert.rejects(invoke({timeoutMs:8,fetchImpl:()=>{calls++;return new Promise(()=>{});}}),e=>
    e.code==='E_AI_OUTCOME_UNKNOWN'&&e.upstreamTermination==='NOT_CONFIRMED');
  assert.equal(calls,1);
});
test('abort while HTTP body is stalled cancels reading',async()=>{
  let cancelled=false;const abort=new AbortController();
  const stream=new ReadableStream({cancel(){cancelled=true;}});
  const pending=invoke({signal:abort.signal,fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})});
  await new Promise(resolve=>setTimeout(resolve,0));abort.abort();
  await assert.rejects(pending,{code:'E_CANCELLED'});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(cancelled,true);
});
test('network error is sanitized, unknown and not automatically retried',async()=>{
  let calls=0;await assert.rejects(invoke({fetchImpl:async()=>{calls++;throw Error('secret token');}}),e=>{
    assert.equal(e.code,'E_AI_OUTCOME_UNKNOWN');assert.equal(e.message.includes('secret'),false);return true;
  });assert.equal(calls,1);
});
test('adapter rejects a followed redirect even with a custom fetch implementation',async()=>{
  const response=json();Object.defineProperty(response,'redirected',{value:true});
  await assert.rejects(invoke({fetchImpl:async()=>response}),{code:'E_AI_PROTOCOL'});
});
test('observation projection omits unrelated URL/history and receipt ids',()=>{
  const proof=receipt();proof.history='DO_NOT_SEND';proof.url=target.url;
  const summary=responsePlanningObservation(proof,target);
  assert.equal(Object.hasOwn(summary,'url'),false);assert.equal(Object.hasOwn(summary,'runId'),false);
  assert.equal(JSON.stringify(summary).includes('DO_NOT_SEND'),false);
  proof.summary.nodes[0].locator.value='#changed';assert.equal(summary.nodes[0].locator.value,'#keyword');
});
for(const [name,modify] of [
  ['missing receipt',()=>null],['wrong document',p=>{p.summary.documentId='other';return p;}],
  ['wrong origin',p=>{p.summary.origin='https://other.test';return p;}],
  ['missing durable result',p=>{delete p.resultId;return p;}],
  ['bad source hash',p=>{p.sourceHash='bad';return p;}],['no nodes',p=>{p.summary.nodes=[];return p;}],
  ['too many nodes',p=>{p.summary.nodes=Array.from({length:25},()=>node);return p;}],
  ['over byte budget',p=>{p.summary.nodes[0].text='汉'.repeat(5000);return p;}]
])test('rejects unbound/oversized observation: '+name,()=>{
  assert.throws(()=>responsePlanningObservation(modify(receipt()),target),{code:'E_AI_OBSERVATION_REQUIRED'});
});
for(const patch of [{frameId:1},{tabId:'2'},{tabId:-1},{windowId:-1},{documentId:''},{url:'https://evil.test/form'}])
  test('rejects invalid target identity '+JSON.stringify(patch),()=>{
    assert.throws(()=>responsePlanningObservation(receipt(),{...target,...patch}),{code:'E_DOCUMENT_STALE'});
  });
test('only exact approved visible fill/click locators are accepted',()=>{
  const summary=responsePlanningObservation(receipt(),target);
  assert.deepEqual(assertResponseLocators(proposal,summary),proposal);
  for(const op of ['fill','click','wait','extract','assert'])assert.throws(()=>assertResponseLocators({steps:[{
    stepId:'a',op,locatorKind:'css',selector:'#invented'}]},summary),{code:'E_AI_LOCATOR_UNOBSERVED'});
});
for(const patch of [{state:{visible:false}},{locator:{kind:'css',value:'#keyword',index:0}},
  {locator:{kind:'css',value:'#keyword',parent:{kind:'css',value:'body'}}}])
  test('fill rejects hidden or scoped/indexed targets '+JSON.stringify(patch),()=>{
    assert.throws(()=>assertResponseLocators(proposal,{nodes:[{...node,...patch}]}),{code:'E_AI_LOCATOR_UNOBSERVED'});
  });
test('role locator must retain exact accessible name',()=>{
  const workflow={steps:[{stepId:'click1',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]};
  const summary={nodes:[{state:{visible:true},locator:{kind:'role',value:'button',name:'搜索'}}]};
  assertResponseLocators(workflow,summary);workflow.steps[0].roleName='删除';
  assert.throws(()=>assertResponseLocators(workflow,summary),{code:'E_AI_LOCATOR_UNOBSERVED'});
});
