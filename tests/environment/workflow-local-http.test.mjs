import test from 'node:test';
import assert from 'node:assert/strict';
import {localHTTPAdapterCapabilities,requestLocalHTTPWorkflowResponse} from '../../src/ui/workflow/local-http.js';

const endpoint='http://127.0.0.1:45111/v1/responses';
const bearerToken='x'.repeat(48);
const schema={name:'workflow',schema:{type:'object',properties:{title:{type:'string'}},
  required:['title'],additionalProperties:false}};
const args={endpoint,bearerToken,model:'gpt-6',instructions:'Only return a workflow JSON',
  input:'Fill the search field with a user-supplied literal',jsonSchema:schema};
function response(proposal={title:'Example'},extra={}) {
  return new Response(JSON.stringify({id:'resp_local_example',object:'response',status:'completed',
    store:false,background:false,output:[{type:'message',role:'assistant',status:'completed',
      content:[{type:'output_text',text:JSON.stringify(proposal)}]}],...extra}),
    {status:200,headers:{'content-type':'application/json'}});
}

test('local HTTP advertises no pairing, tool calling, server cancel, or cold resume',()=>{
  const caps=localHTTPAdapterCapabilities();
  assert.equal(caps.pairingReady,false);
  for(const field of ['streaming','toolCalls','cancel','coldResume','usage','store','background'])
    assert.equal(caps[field],false);
});

test('loopback, high entropy credentials, and schema are checked before dispatch',async()=>{
  let dispatched=0;
  const fetchImpl=()=>{dispatched++;return response();};
  for(const values of [
    {endpoint:'http://localhost:45111/v1/responses'},
    {endpoint:'http://192.168.1.1:45111/v1/responses'},
    {endpoint:'https://127.0.0.1:45111/v1/responses'},
    {endpoint:'http://127.0.0.1:45111/v1/responses?secret=1'},
    {bearerToken:'weak'},
    {jsonSchema:{name:'workflow',schema:{type:'object',additionalProperties:true}}},
    {previous_response_id:'resp_prior'},
    {stream:true}
  ]) {
    await assert.rejects(requestLocalHTTPWorkflowResponse({...args,fetchImpl,...values}),
      error=>['E_AI_CONFIG','E_AI_UNSUPPORTED'].includes(error.code));
  }
  assert.equal(dispatched,0,'unsupported inputs must not reach an HTTP listener');
});

test('sends only the Go audited non-streaming Responses subset',async()=>{
  let calls=0;
  const result=await requestLocalHTTPWorkflowResponse({...args,fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,endpoint);
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'omit');
    assert.equal(options.headers.Authorization,'Bearer '+bearerToken);
    const body=JSON.parse(options.body);
    assert.deepEqual({stream:body.stream,store:body.store,background:body.background},
      {stream:false,store:false,background:false});
    assert.deepEqual(body.text.format,{type:'json_schema',name:'workflow',schema:schema.schema,strict:true});
    assert.equal(body.input.length,1);
    assert.equal(body.input[0].role,'user');
    assert.equal(body.input[0].content[0].type,'input_text');
    return response();
  }});
  assert.equal(calls,1);
  assert.deepEqual(result.proposal,{title:'Example'});
  assert.equal(result.metadata.provider,'local_http');
  assert.equal(result.metadata.responseId,'resp_local_example');
  assert.equal(result.metadata.usage,null);
});

test('json_object mode is an explicit supported subset',async()=>{
  await requestLocalHTTPWorkflowResponse({...args,jsonSchema:null,
    fetchImpl:async(_url,options)=>{
      assert.deepEqual(JSON.parse(options.body).text.format,{type:'json_object'});
      return response();
    }});
});

test('refuses fabricated local usage, server state, or incomplete model turns',async()=>{
  for(const payload of [{usage:{input_tokens:0,output_tokens:0,total_tokens:0}},
    {background:true},{store:true},{status:'incomplete'}]) {
    await assert.rejects(requestLocalHTTPWorkflowResponse({...args,
      fetchImpl:async()=>response({title:'Example'},payload)}),
      error=>['E_AI_PROTOCOL','E_AI_INCOMPLETE','E_AI_PROVIDER'].includes(error.code));
  }
});

test('gateway auth errors and unconfirmed network effects never trigger retry',async()=>{
  let calls=0;
  await assert.rejects(requestLocalHTTPWorkflowResponse({...args,
    fetchImpl:async()=>{calls++;return new Response('',{status:403});}}),
    error=>error.code==='E_AI_GATEWAY_AUTH');
  await assert.rejects(requestLocalHTTPWorkflowResponse({...args,
    fetchImpl:async()=>{calls++;throw new Error('network unavailable');}}),
    error=>error.code==='E_AI_OUTCOME_UNKNOWN'&&error.upstreamTermination==='NOT_CONFIRMED');
  assert.equal(calls,2);
});
