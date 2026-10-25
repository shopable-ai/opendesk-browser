import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {serveMcp} from '../../native-agent/local-dev/mcp.mjs';

test('ChatGPT and Codex Tunnel discovery retain the session across client capability advertisements',async()=>{
  const input=new PassThrough(),output=new PassThrough(),responses=[];
  let calls=0,closes=0;
  output.on('data',chunk=>responses.push(...chunk.toString().trim().split('\n').map(JSON.parse)));
  const tools=[{name:'test.result',inputSchema:{type:'object'}}];
  const server=serveMcp({input,output,session:{close(){closes++;}},tools,dispatch:async()=>({calls:++calls})});
  const send=(id,method,params)=>input.write(JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,...(params===undefined?{}:{params})})+'\n');
  const params={protocolVersion:'2025-11-25',clientInfo:{name:'openai-mcp',version:'1.0.0'},capabilities:{experimental:{'openai/visibility':{enabled:true}}}};
  send('discover','server/discover');
  send(1,'initialize',params);
  send(0,'initialize',{capabilities:params.capabilities,clientInfo:{version:'1.0.0',name:'openai-mcp'},protocolVersion:params.protocolVersion});
  send(undefined,'notifications/initialized');
  send(2,'tools/list');
  send(3,'tools/call',{name:'test.result',arguments:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(responses.find(row=>row.id===0).result,responses.find(row=>row.id===1).result);
  assert.deepEqual(responses.find(row=>row.id===2).result.tools,tools);
  assert.equal(responses.find(row=>row.id===3).result.structuredContent.calls,1);
  send(4,'initialize',params);
  send(5,'initialize',{...params,clientInfo:{name:'openai-mcp (Codex)',version:'1'},
    capabilities:{...params.capabilities,extensions:{'openai/form':{},'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app','text/html+skybridge']}}}});
  send(6,'tools/call',{name:'test.result',arguments:{}});
  send(7,'initialize',{...params,protocolVersion:'different-protocol'});
  send(8,'tools/list');
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(responses.find(row=>row.id===4).result);
  assert.deepEqual(responses.find(row=>row.id===5).result,responses.find(row=>row.id===1).result);
  assert.equal(responses.find(row=>row.id===6).result.structuredContent.calls,2);
  assert.equal(responses.find(row=>row.id===7).error.code,-32600);
  assert.deepEqual(responses.find(row=>row.id===8).result.tools,tools);
  assert.equal(closes,0);
  server.close();assert.equal(closes,1);
});
