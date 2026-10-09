#!/usr/bin/env node
// Standard MCP 2025-11-25 compatibility transport: newline-delimited JSON-RPC.
// No TCP/HTTP listener, shell execution, project config execution or alternate browser engine.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {LocalDevSession} from './session.mjs';
import {createLocalProjectProvider} from './provider.mjs';

const string={type:'string',minLength:1},binding={bindingId:string};
const definitions=[
  ['attach','Bind one explicitly authorized local directory or JS file; this does not execute code. For directories pass only path: package.json declares runtime and origins. runtimeKind, entryFormat and siteOrigin configure single JS files; changing an existing scope requires detach first.',{path:string,runtimeKind:{enum:['controller','page-userscript']},entryFormat:{enum:['async-main','classic-userscript']},siteOrigin:string},['path']],
  ['status','Read Native connection, attached projects and the exact browser target.',{...binding,registrationId:string},[]],
  ['run','Run current local source through OpenDesk. Requires user authorization for effects. Never automatically retry an unknown outcome; requestId must identify one intentional run.',{...binding,requestId:string,params:{type:'object'},registrationId:string,deadlineMs:{type:'integer',minimum:1000,maximum:120000}},['bindingId','requestId']],
  ['result','Read the original execution. Recover a lost ACK by admissionRequestId without rerunning source.',{runId:string,previewId:string,admissionRequestId:string},[]],
  ['stop','Stop an owned Controller through RunHost, or retire only createPageUI-managed resources of an owned Page preview. Arbitrary Page side effects are not cancelled.',{runId:string,previewId:string,admissionRequestId:string,requestId:string},[]],
  ['diagnostics','Read local source errors and original execution diagnostics.',{...binding,runId:string,previewId:string,admissionRequestId:string},[]],
  ['detach','Detach a project; existing runs retain their frozen source.',binding,['bindingId']]
];
export const MCP_TOOLS=definitions.map(([name,description,properties,required])=>({name:'opendesk.dev.'+name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:['status','result','diagnostics'].includes(name),destructiveHint:['run','stop'].includes(name),idempotentHint:['status','result','diagnostics','attach'].includes(name),openWorldHint:name==='run'}}));
for(const tool of MCP_TOOLS)if(['result','stop'].includes(tool.name.split('.').pop()))tool.inputSchema.oneOf=['runId','previewId','admissionRequestId'].map(key=>({required:[key]}));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validateArgs(tool,args){
  const schema=tool.inputSchema;
  if(!object(args)||Object.keys(args).some(k=>!Object.hasOwn(schema.properties,k))||schema.required.some(k=>!Object.hasOwn(args,k)))throw new Error('Unexpected or missing tool arguments');
  const selectors=['runId','previewId','admissionRequestId'].filter(key=>Object.hasOwn(args,key)).length;
  if(schema.oneOf&&selectors!==1||selectors>1)throw new Error('Select exactly one runId, previewId or admissionRequestId');
  for(const [key,value] of Object.entries(args)){
    const rule=schema.properties[key];
    if(rule.enum&&!rule.enum.includes(value)||rule.type==='string'&&(typeof value!=='string'||!value)||rule.type==='object'&&!object(value)||rule.type==='integer'&&(!Number.isSafeInteger(value)||value<rule.minimum||value>rule.maximum))throw new Error('Invalid tool argument: '+key);
  }
}
export function serveMcp({input=process.stdin,output=process.stdout,session}={}){
  let buffer=Buffer.alloc(0),initialized=false,ready=false,closed=false,inflight=0;
  const pending=new Set(),maxBytes=64*1024;
  const write=message=>{if(!closed)output.write(JSON.stringify(message)+'\n');};
  const rpcError=(id,code,message)=>write({jsonrpc:'2.0',id,error:{code,message}});
  async function handle(message){
    if(!object(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return rpcError(null,-32600,'Invalid JSON-RPC request');
    const hasId=Object.hasOwn(message,'id');
    if(hasId&&!(typeof message.id==='string'||Number.isSafeInteger(message.id)))return rpcError(null,-32600,'Invalid request ID');
    if(!hasId){if(message.method==='notifications/initialized'&&initialized)ready=true;return;}
    const id=message.id;
    if(pending.has(id))return rpcError(id,-32600,'Duplicate in-flight request ID');
    if(inflight>=8)return rpcError(id,-32000,'Too many in-flight requests');
    pending.add(id);inflight++;
    try{
      if(message.method==='initialize'){
        if(initialized)return rpcError(id,-32600,'Already initialized');
        if(!object(message.params)||typeof message.params.protocolVersion!=='string'||!object(message.params.capabilities)||!object(message.params.clientInfo)||typeof message.params.clientInfo.name!=='string'||typeof message.params.clientInfo.version!=='string')return rpcError(id,-32602,'Invalid initialization parameters');
        initialized=true;
        return write({jsonrpc:'2.0',id,result:{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'opendesk-local-dev',version:'1.0.0'},instructions:'Use only explicitly authorized project roots. Native/RunHost permissions remain authoritative. Unknown effects must never be automatically replayed.'}});
      }
      if(message.method==='ping')return write({jsonrpc:'2.0',id,result:{}});
      if(!ready)return rpcError(id,-32002,'Initialize the MCP session first');
      if(message.method==='tools/list')return write({jsonrpc:'2.0',id,result:{tools:MCP_TOOLS}});
      if(message.method!=='tools/call')return rpcError(id,-32601,'Method not found');
      const tool=MCP_TOOLS.find(row=>row.name===message.params?.name);
      if(!tool)return rpcError(id,-32602,'Unknown tool');
      const args=message.params.arguments||{};
      let data,isError=false;
      try{try{validateArgs(tool,args);}catch(error){error.code='E_SCHEMA';throw error;}data=await session[tool.name.split('.').pop()](args);}
      catch(error){isError=true;data={error:{code:error.code||'E_DEV',message:error.message,phase:error.phase||'local-dev',...(error.location?{location:error.location}:{}),...(error.requestId?{requestId:error.requestId}:{}),...(error.admissionRequestId?{admissionRequestId:error.admissionRequestId}:{}),...(error.runId?{runId:error.runId}:{}),...(error.previewId?{previewId:error.previewId}:{}),outcome:error.outcome||(error.code==='E_EFFECT_UNKNOWN'?'OUTCOME_UNKNOWN':'NOT_DISPATCHED')}};}
      write({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(isError?{isError:true}:{})}});
    }finally{pending.delete(id);inflight--;}
  }
  const onData=chunk=>{
    buffer=Buffer.concat([buffer,chunk]);let index;
    while((index=buffer.indexOf(10))>=0){
      const line=buffer.subarray(0,index);buffer=buffer.subarray(index+1);
      if(line.length>maxBytes){rpcError(null,-32600,'MCP request exceeds 64 KiB');continue;}
      let message;try{message=JSON.parse(line.toString('utf8'));}catch{rpcError(null,-32700,'Parse error');continue;}
      handle(message).catch(()=>rpcError(message?.id??null,-32603,'Internal error'));
    }
    if(buffer.length>maxBytes){rpcError(null,-32600,'MCP request exceeds 64 KiB');buffer=Buffer.alloc(0);close();input.destroy();}
  };
  // EOF never replays or blindly cancels browser operations that may have effects.
  const close=()=>{if(closed)return;closed=true;input.off('data',onData);session.close?.();};
  input.on('data',onData);input.once('end',close);input.once('error',close);
  return {close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const args=process.argv.slice(2),allowedPaths=[];
    for(let index=0;index<args.length;index+=2){if(args[index]!=='--allow-project'||!args[index+1])throw new Error('Usage: node native-agent/local-dev/mcp.mjs --allow-project /absolute/project');allowedPaths.push(args[index+1]);}
    if(!allowedPaths.length)throw new Error('At least one explicit --allow-project is required');
    const session=new LocalDevSession({allowedPaths});
    // Explicit CLI directory authorization is reusable across MCP restarts.
    // Single files still require attach(runtimeKind, siteOrigin).
    for(const project of allowedPaths)if(fs.statSync(project).isDirectory())session.attach({path:path.resolve(project)});
    session.provider=createLocalProjectProvider({session});
    serveMcp({session});
  }catch(error){process.stderr.write((error.code||'E_DEV_CONFIG')+': '+error.message+'\n');process.exitCode=1;}
}
