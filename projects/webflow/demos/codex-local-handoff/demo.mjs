#!/usr/bin/env node
// OpenDesk WebFlow -> local MCP -> Codex proof of concept; not an installed Browser SDK.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOL_DRAFT = 'opendesk.codex.open_draft';
const TOOL_RUN = 'opendesk.codex.start_turn';
const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const goodString = (s, limit) => typeof s === 'string' && s.trim().length > 0 && s.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s);
const fail = (code, message) => Object.assign(new Error(message), { code });
const LIVE = 'OPEN_DESK_DEMO_ALLOW_LIVE';

export const tools = [
  { name: TOOL_DRAFT, description: 'Open an unsent draft in official Codex Desktop. Does not start or send a turn.',
    inputSchema: {type:'object', properties:{prompt:{type:'string',maxLength:8000},originUrl:{type:'string',maxLength:300}},required:['prompt'],additionalProperties:false},
    annotations:{readOnlyHint:false,idempotentHint:false,openWorldHint:false} },
  { name: TOOL_RUN, description: 'Start one read-only Codex turn via official app-server after local server opt-in. No automatic replay on uncertain outcomes.',
    inputSchema:{type:'object',properties:{prompt:{type:'string',maxLength:8000},cwd:{type:'string',maxLength:1024}},required:['prompt','cwd'],additionalProperties:false},
    annotations:{readOnlyHint:false,idempotentHint:false,openWorldHint:false} },
];

export function validate(name, args) {
  if (!isObj(args) || (name !== TOOL_DRAFT && name !== TOOL_RUN)) throw fail('E_SCHEMA','Unknown tool or invalid arguments');
  const required = name === TOOL_DRAFT ? ['prompt'] : ['prompt','cwd'];
  const allowed = name === TOOL_DRAFT ? ['prompt','originUrl'] : required;
  if (!required.every(k=>own(args,k)) || Object.keys(args).some(k=>!allowed.includes(k)) || !goodString(args.prompt,8000))
    throw fail('E_SCHEMA','Invalid or extra tool arguments');
  if (name===TOOL_DRAFT && own(args,'originUrl')) {
    if (!goodString(args.originUrl,300) || !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.git)?$/.test(args.originUrl))
      throw fail('E_SCHEMA','originUrl must be an exact GitHub repository URL');
  }
  if (name===TOOL_RUN && (!goodString(args.cwd,1024) || !path.isAbsolute(args.cwd)))
    throw fail('E_SCHEMA','cwd must be an absolute local path');
  return args;
}

export function draftUrl(args) {
  validate(TOOL_DRAFT,args);
  const u = new URL('codex://new');
  u.searchParams.set('prompt',args.prompt);
  if (args.originUrl) u.searchParams.set('originUrl',args.originUrl);
  return u.href;
}

export function threadUrl(id) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id || '')) throw fail('E_THREAD_ID','Invalid thread ID');
  return `codex://threads/${encodeURIComponent(id)}`;
}

function spawnChecked(bin,args,opts={}) {
  return spawn(bin,args,{shell:false,stdio:['ignore','ignore','pipe'],...opts});
}

export function openDraft(args, {live=false,spawnFn=spawnChecked,platform=process.platform}={}) {
  const url = draftUrl(args);
  if (!live) return Promise.resolve({phase:'PREVIEW_ONLY',url,submitted:false});
  if (platform!=='darwin') throw fail('E_PLATFORM','Native deep link test requires macOS');
  // /usr/bin/open is a fixed executable, with a separate URL argument (no shell).
  return new Promise((resolve,reject)=>{
    const child=spawnFn('/usr/bin/open',[url]);
    child.once('error',()=>reject(fail('E_LAUNCH','macOS URL launch request failed')));
    child.once('exit',code=>code===0
      ? resolve({phase:'OPEN_REQUESTED',url,submitted:false})
      : reject(fail('E_LAUNCH','macOS URL launcher returned a nonzero code')));
  });
}

// Codex app-server uses newline-delimited JSON-RPC without jsonrpc header.
// Never auto-grant server-initiated permission or tool requests.
export function startTurn(args, {live=false,spawnFn=spawn,bin='codex',argv=['app-server'],timeoutMs=90000}={}) {
  validate(TOOL_RUN,args);
  if (!live) return Promise.resolve({phase:'PREVIEW_ONLY',submitted:false,cwd:args.cwd});
  if (!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>600000) throw fail('E_SCHEMA','Invalid deadline');
  return new Promise((resolve,reject)=>{
    let child;
    try { child=spawnFn(bin,argv,{shell:false,stdio:['pipe','pipe','pipe'],cwd:args.cwd}); }
    catch { reject(fail('E_SPAWN','Could not start Codex app-server')); return; }
    let settled=false, threadId=null, turnId=null, completion=null, timer;
    let phase='initialize', nextId=1, buffered=0, turnStartSent=false, turnAcknowledged=false;
    const answers=new Map(), deltas=new Map();
    const rl=createInterface({input:child.stdout,crlfDelay:Infinity});
    child.stderr?.resume(); // Drain diagnostics without exposing paths, tokens or prompts.
    const receiptError=(code,message)=>{
      const error=fail(code,message);
      error.phase=phase;
      error.threadId=threadId;
      error.turnId=turnId;
      error.threadUrl=threadId?threadUrl(threadId):null;
      error.submissionState=turnAcknowledged?'ADMITTED':(turnStartSent?'OUTCOME_UNKNOWN':'NOT_DISPATCHED');
      error.outcome=turnStartSent?'OUTCOME_UNKNOWN':'NOT_DISPATCHED';
      return error;
    };
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      rl.close();
      // The Demo owns this app-server process, but killing it does not undo a dispatched turn.
      if(child.exitCode===null&&!child.killed)child.kill('SIGTERM');
      if(error)reject(error);else resolve(value);
    };
    const abort=(code,message)=>finish(receiptError(code,message));
    const send=(message)=>{
      if(settled)return;
      try{child.stdin.write(JSON.stringify(message)+'\n');}
      catch{abort('E_IO_UNKNOWN','Codex transport may have accepted the request; do not replay');}
    };
    const request=(method,params)=>{
      if(method==='turn/start')turnStartSent=true; // A write attempt is NOT an acceptance ACK.
      send({id:nextId++,method,params});
    };
    const matchingTurn=(event)=>isObj(event)&&
      (event.threadId===undefined||event.threadId===threadId)&&
      (event.turnId===undefined||!turnId||event.turnId===turnId);
    const recordAnswer=(item)=>{
      if(!isObj(item)||item.type!=='agentMessage'||typeof item.text!=='string'||!item.text.trim())return;
      if(Buffer.byteLength(item.text,'utf8')>65536){abort('E_RESULT_TOO_LARGE','Codex answer exceeds the 64 KiB response budget');return;}
      const key=typeof item.id==='string'?item.id:'final-'+answers.size;
      answers.set(key,item.text);
    };
    const maybeFinish=()=>{
      if(!completion||!turnId||completion.threadId!==threadId||completion.turn?.id!==turnId)return;
      const status=completion.turn.status;
      if(!['completed','failed','interrupted'].includes(status)){
        abort('E_PROTOCOL','Codex turn terminal status is not recognized');return;
      }
      const fromTurnSnapshot=!answers.size&&Array.isArray(completion.turn.items);
      if(fromTurnSnapshot){
        for(const item of completion.turn.items)recordAnswer(item);
      }
      if(settled)return;
      let answerText=answers.size?[...answers.values()].at(-1):null;
      let answerSource=answerText?(fromTurnSnapshot?'turn/completed':'item/completed'):null;
      if(!answerText&&deltas.size){
        answerText=[...deltas.values()].at(-1)||null;
        answerSource=answerText?'delta-only-unverified':null;
      }
      finish(null,{phase:'TURN_TERMINAL',submitted:true,submissionState:'ADMITTED',threadId,turnId,
        status,threadUrl:threadUrl(threadId),answerText,answerSource,
        answerAvailable:answerSource==='item/completed'||answerSource==='turn/completed',
        businessSuccess:null,taskVerified:false});
    };
    timer=setTimeout(()=>abort('E_OUTCOME_UNKNOWN','Codex may still be running; inspect the original thread, never auto-retry'),timeoutMs);
    child.on('error',()=>abort('E_SPAWN','Codex executable could not be started'));
    child.on('exit',()=>{if(!settled)abort('E_OUTCOME_UNKNOWN','Codex app-server exited without a verified terminal event');});
    child.stdin?.on('error',()=>abort('E_IO_UNKNOWN','Codex stdin failed; outcome unknown if a turn was sent'));
    rl.on('error',()=>abort('E_IO_UNKNOWN','Codex output stream failed'));
    rl.on('line',line=>{
      if(settled)return;
      buffered+=Buffer.byteLength(line);
      if(buffered>4_000_000||Buffer.byteLength(line)>1_000_000){abort('E_PROTOCOL','Codex response budget exceeded');return;}
      let m;try{m=JSON.parse(line);}catch{abort('E_PROTOCOL','Invalid JSONL received');return;}
      if(!isObj(m))return;
      if(own(m,'method')&&own(m,'id')){
        // Never reply allow, approve or success to server-initiated requests.
        abort('E_APPROVAL_REQUIRED','Codex requires an interactive decision; inspect the original thread');return;
      }
      if(m.method==='item/agentMessage/delta'&&matchingTurn(m.params)){
        const {itemId,delta}=m.params;
        if(typeof itemId==='string'&&typeof delta==='string'){
          const value=(deltas.get(itemId)||'')+delta;
          if(Buffer.byteLength(value,'utf8')>65536){abort('E_RESULT_TOO_LARGE','Codex answer stream exceeds 64 KiB');return;}
          deltas.set(itemId,value);
        }
        return;
      }
      if(m.method==='item/completed'&&matchingTurn(m.params)){
        recordAnswer(m.params.item);return;
      }
      if(m.method==='turn/completed'){
        if(matchingTurn(m.params)){completion=m.params;maybeFinish();}
        return;
      }
      if(!own(m,'id'))return;
      if(m.error){abort('E_CODEX_RPC',`Codex rejected ${phase}`);return;}
      if(m.id===1&&phase==='initialize'){
        phase='thread/start';send({method:'initialized',params:{}});
        request('thread/start',{cwd:args.cwd,approvalPolicy:'never',sandbox:'read-only'});return;
      }
      if(m.id===2&&phase==='thread/start'){
        threadId=m.result?.thread?.id;
        if(typeof threadId!=='string'){abort('E_PROTOCOL','thread/start response has no thread.id');return;}
        try{threadUrl(threadId);}catch{abort('E_PROTOCOL','thread/start returned invalid thread.id');return;}
        phase='turn/start';
        request('turn/start',{threadId,input:[{type:'text',text:args.prompt}],cwd:args.cwd,
          approvalPolicy:'never',sandboxPolicy:{type:'readOnly'}});return;
      }
      if(m.id===3&&phase==='turn/start'){
        turnId=m.result?.turn?.id;
        if(typeof turnId!=='string'||!turnId){abort('E_PROTOCOL','turn/start response has no turn.id');return;}
        turnAcknowledged=true;
        phase='turn-running';maybeFinish();
      }
    });
    request('initialize',{clientInfo:{name:'opendesk-webflow-codex-demo',title:'OpenDesk WebFlow Codex Demo',version:'0.1.0'},capabilities:{}});
  });
}

export async function dispatch(name,args,{live=process.env[LIVE]==='1',...deps}={}) {
  validate(name,args);
  if(name===TOOL_DRAFT)return openDraft(args,{live,...deps});
  return startTurn(args,{live,...deps});
}

export function mcpServer({input=process.stdin,output=process.stdout,dispatcher=dispatch}={}) {
  const rl=createInterface({input,crlfDelay:Infinity});
  let initialized=false, busy=false;
  const respond=obj=>{output.write(JSON.stringify(obj)+'\n');};
  rl.on('line',async line=>{
    let q; try{q=JSON.parse(line);}catch{return respond({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
    if(!isObj(q)||q.jsonrpc!=='2.0'||typeof q.method!=='string')return respond({jsonrpc:'2.0',id:q?.id??null,error:{code:-32600,message:'Invalid Request'}});
    if(!own(q,'id')){
      if(q.method==='notifications/initialized' && initialized) return;
      return;
    }
    if(q.method==='initialize'){
      if(initialized)return respond({jsonrpc:'2.0',id:q.id,error:{code:-32600,message:'Already initialized'}});
      initialized=true;
      return respond({jsonrpc:'2.0',id:q.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'opendesk-codex-local-poc',version:'0.1.0'}}});
    }
    if(!initialized)return respond({jsonrpc:'2.0',id:q.id,error:{code:-32002,message:'Not initialized'}});
    if(q.method==='ping')return respond({jsonrpc:'2.0',id:q.id,result:{}});
    if(q.method==='tools/list')return respond({jsonrpc:'2.0',id:q.id,result:{tools}});
    if(q.method!=='tools/call')return respond({jsonrpc:'2.0',id:q.id,error:{code:-32601,message:'Method not found'}});
    const name=q.params?.name,args=q.params?.arguments;
    if(busy)return respond({jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify({code:'E_BUSY',message:'A previous operation is in progress'})}],isError:true}});
    busy=true;
    try{
      const result=await dispatcher(name,args);
      respond({jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify(result)}],isError:false}});
    }catch(error){
      const reason={code:error?.code||'E_INTERNAL',message:error?.message||'Operation failed'};
      for(const field of ['phase','threadId','turnId','threadUrl','submissionState','outcome']){
        if(own(error,field))reason[field]=error[field];
      }
      respond({jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify(reason)}],isError:true}});
    }finally{busy=false;}
  });
  return rl;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if(process.argv[2]==='mcp')mcpServer();
  else if(process.argv[2]==='draft-url') console.log(draftUrl({prompt:process.argv.slice(3).join(' ')}));
  else {console.error('Usage: node demo.mjs mcp | node demo.mjs draft-url <prompt>');process.exitCode=2;}
}
