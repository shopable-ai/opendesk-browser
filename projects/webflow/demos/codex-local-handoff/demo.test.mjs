import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { draftUrl, threadUrl, validate, dispatch, openDraft, startTurn, mcpServer } from './demo.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const input={prompt:'中文参数 & ? #'};

test('draft deep link is encoded, round-trips Unicode, and never sends',async()=>{
 const url=draftUrl(input);
 const parsed=new URL(url);
 assert.equal(parsed.protocol,'codex:');
 assert.equal(parsed.searchParams.get('prompt'),input.prompt);
 assert.equal(parsed.pathname,'');
 assert.equal((await dispatch('opendesk.codex.open_draft',input,{live:false})).submitted,false);
 assert.equal(threadUrl('thread12345678'),'codex://threads/thread12345678');
});

test('MCP inputs fail closed on extra fields, shell metacharacters in origins, or relative cwd',()=>{
 assert.throws(()=>validate('opendesk.codex.open_draft',{prompt:'a',extra:true}),/Invalid or extra/);
 assert.throws(()=>validate('opendesk.codex.open_draft',{prompt:'a',originUrl:'javascript:alert(1)'}),/originUrl/);
 assert.throws(()=>validate('opendesk.codex.start_turn',{prompt:'a',cwd:'~/repo'}),/absolute/);
 assert.throws(()=>validate('opendesk.codex.start_turn',{prompt:'a',cwd:'/tmp',command:'rm -rf /'}),/Invalid/);
 assert.throws(()=>validate('opendesk.codex.start_turn',{prompt:'\u0000',cwd:'/tmp'}),/Invalid/);
});

test('native draft launch is a fixed argv call, not shell interpolation',async()=>{
 let call;
 const spawnFn=(bin,argv)=>{
   call={bin,argv};
   const p=new EventEmitter();
   queueMicrotask(()=>p.emit('exit',0));
   return p;
 };
 const result=await openDraft({prompt:'test; $(whoami)'},{live:true,platform:'darwin',spawnFn});
 assert.equal(call.bin,'/usr/bin/open');
 assert.equal(call.argv.length,1);
 assert.equal(new URL(call.argv[0]).searchParams.get('prompt'),'test; $(whoami)');
 assert.equal(result.phase,'OPEN_REQUESTED');
 assert.equal(result.submitted,false);
});

test('Codex app-server complete chain uses handshake, thread/start and turn/start in read-only mode',async()=>{
 const r=await startTurn({prompt:'Test Codex MCP bridge',cwd:'/tmp'},{live:true,
   bin:process.execPath,argv:[path.join(dir,'mock-app-server.mjs')],timeoutMs:10000});
 assert.equal(r.threadId,'thread12345678');
 assert.equal(r.turnId,'turn1234');
 assert.equal(r.status,'completed');
 assert.equal(r.businessSuccess,null);
 assert.equal(r.taskVerified,false);
 assert.equal(r.answerText,'README 描述了 OpenDesk 的自动化能力。');
 assert.equal(r.answerSource,'item/completed');
 assert.equal(r.answerAvailable,true);
 assert.equal(r.submissionState,'ADMITTED');
 assert.equal(r.threadUrl,'codex://threads/thread12345678');
});

test('Codex server-initiated approval fails closed instead of being auto-approved',async()=>{
 await assert.rejects(startTurn({prompt:'Test Codex MCP bridge',cwd:'/tmp'},
   {live:true,timeoutMs:10000,spawnFn:(bin,argv,opts)=>spawn(process.execPath,[path.join(dir,'mock-app-server.mjs')],{
      ...opts,env:{...process.env,MOCK_APPROVAL:'1'}})}),error=>{
        assert.equal(error.code,'E_APPROVAL_REQUIRED');
        assert.equal(error.threadId,'thread12345678');
        assert.equal(error.turnId,'turn1234');
        assert.equal(error.submissionState,'ADMITTED');
        assert.equal(error.outcome,'OUTCOME_UNKNOWN');
        return true;
      });
});

test('local demo MCP server returns a real tools/call envelope; execution disabled by default',async()=>{
 const stdin=new PassThrough(),stdout=new PassThrough();
 const lines=[];stdout.on('data',chunk=>{
  for(const str of chunk.toString().trim().split('\n'))if(str)lines.push(JSON.parse(str));
 });
 const rl=mcpServer({input:stdin,output:stdout,dispatcher:(name,args)=>dispatch(name,args,{live:false})});
 stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}})+'\n');
 stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
 stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'opendesk.codex.open_draft',arguments:{prompt:'中文测试'}}})+'\n');
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(lines.find(x=>x.id===1)?.result?.protocolVersion,'2025-06-18');
 assert.equal(lines.find(x=>x.id===2)?.result?.tools?.length,2);
 const reply=lines.find(x=>x.id===3);
 assert.equal(reply?.result?.isError,false);
 assert.equal(JSON.parse(reply?.result?.content[0]?.text).phase,'PREVIEW_ONLY');
 rl.close();stdin.destroy();stdout.destroy();
});

test('CLI simulated WebFlow -> MCP stdio -> planned Codex draft is executable offline',async()=>{
 const p=spawn(process.execPath,[path.join(dir,'trigger.mjs'),'draft','--prompt','WebFlow proof'],{
   env:{...process.env,OPEN_DESK_DEMO_ALLOW_LIVE:'0'}});
 let out='';for await (const chunk of p.stdout)out+=chunk;
 const code=await new Promise(resolve=>p.on('close',resolve));
 assert.equal(code,0);
 assert.equal(JSON.parse(out).phase,'PREVIEW_ONLY');
});

const mock = (mode, timeoutMs=10000) => startTurn({prompt:'Test Codex MCP bridge',cwd:'/tmp'}, {
  live:true,timeoutMs,spawnFn:(bin,argv,opts)=>spawn(process.execPath,[path.join(dir,'mock-app-server.mjs')], {
    ...opts,env:{...process.env,...mode}
  })
});

test('a completed turn without an answer does not imply business success',async()=>{
 const r=await mock({MOCK_NO_ANSWER:'1'});
 assert.equal(r.status,'completed');
 assert.equal(r.answerAvailable,false);
 assert.equal(r.answerText,null);
 assert.equal(r.businessSuccess,null);
 assert.equal(r.taskVerified,false);
});

test('delta-only output is diagnostic, not an authoritative completed answer',async()=>{
 const r=await mock({MOCK_DELTA_ONLY:'1'});
 assert.equal(r.answerText,'README 描述了 OpenDesk 的自动化能力。');
 assert.equal(r.answerSource,'delta-only-unverified');
 assert.equal(r.answerAvailable,false);
});

test('turn-completed snapshot can supply authoritative final message',async()=>{
 const r=await mock({MOCK_TURN_ITEMS:'1'});
 assert.equal(r.answerSource,'turn/completed');
 assert.equal(r.answerAvailable,true);
});

test('failed Codex turn is a terminal failure, not task success',async()=>{
 const r=await mock({MOCK_FAILED:'1'});
 assert.equal(r.status,'failed');
 assert.equal(r.businessSuccess,null);
 assert.equal(r.taskVerified,false);
});

test('Codex child crash preserves known original thread and turn IDs',async()=>{
 await assert.rejects(mock({MOCK_EXIT:'1'}),error=>{
   assert.equal(error.code,'E_OUTCOME_UNKNOWN');
   assert.equal(error.threadId,'thread12345678');
   assert.equal(error.turnId,'turn1234');
   assert.equal(error.threadUrl,'codex://threads/thread12345678');
   assert.equal(error.outcome,'OUTCOME_UNKNOWN');
   return true;
 });
});

test('Codex timeout is unknown, no automatic retry, preserves correlation IDs',async()=>{
 await assert.rejects(mock({MOCK_WAIT:'1'},200),error=>{
   assert.equal(error.code,'E_OUTCOME_UNKNOWN');
   assert.equal(error.threadId,'thread12345678');
   assert.equal(error.turnId,'turn1234');
   assert.equal(error.submissionState,'ADMITTED');
   return true;
 });
});

test('MCP error response preserves safe correlation fields and does not expose stack',async()=>{
 const input=new PassThrough(),output=new PassThrough(),lines=[];
 output.on('data',chunk=>{
  for(const line of chunk.toString().trim().split('\n'))if(line)lines.push(JSON.parse(line));
 });
 const rl=mcpServer({input,output,dispatcher:()=>mock({MOCK_EXIT:'1'})});
 input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}})+'\n');
 input.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'opendesk.codex.start_turn',arguments:{prompt:'Test Codex MCP bridge',cwd:'/tmp'}}})+'\n');
 for(let i=0;i<30&&!lines.some(x=>x.id===2);i++)await new Promise(r=>setTimeout(r,20));
 const error=JSON.parse(lines.find(x=>x.id===2)?.result?.content?.[0]?.text);
 assert.equal(error.threadId,'thread12345678');
 assert.equal(error.turnId,'turn1234');
 assert.equal(error.code,'E_OUTCOME_UNKNOWN');
 assert.ok(!Object.hasOwn(error,'stack'));
 rl.close();input.destroy();output.destroy();
});

test('MCP concurrent live tool calls retain original single-operation gate',async()=>{
 const input=new PassThrough(),output=new PassThrough(),lines=[];
 output.on('data',chunk=>{
   for(const line of chunk.toString().trim().split('\n'))if(line)lines.push(JSON.parse(line));
 });
 let release;
 const pending=new Promise(resolve=>{release=resolve});
 let admissions=0;
 const rl=mcpServer({input,output,dispatcher:async()=>{admissions++;await pending;return {phase:'PREVIEW_ONLY'};}});
 input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}})+'\n');
 input.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'opendesk.codex.open_draft',arguments:{prompt:'a'}}})+'\n');
 input.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'opendesk.codex.open_draft',arguments:{prompt:'a'}}})+'\n');
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(admissions,1);
 const blocked=JSON.parse(lines.find(x=>x.id===3)?.result?.content?.[0]?.text);
 assert.equal(blocked.code,'E_BUSY');
 release();await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(lines.find(x=>x.id===2)?.result?.isError,false);
 rl.close();input.destroy();output.destroy();
});

test('CLI refuses unexpected flags instead of silently dropping user parameters',async()=>{
 const p=spawn(process.execPath,[path.join(dir,'trigger.mjs'),'run','--cwd','/tmp','--prompt','test','--origin-url','https://github.com/acme/repo'],{
    env:{...process.env,OPEN_DESK_DEMO_ALLOW_LIVE:'0'}});
 const code=await new Promise(resolve=>p.on('close',resolve));
 assert.equal(code,2);
});