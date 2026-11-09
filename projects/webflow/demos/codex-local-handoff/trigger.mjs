#!/usr/bin/env node
// Local CLI stand-in for the future trusted WebFlow Host adapter.
// This file is not injected into websites or the Sidebar sandbox.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const command=process.argv[2];
const flags={};
for(let i=3;i<process.argv.length;i+=2){
 const key=process.argv[i];
 if(!key?.startsWith('--')||i+1>=process.argv.length||Object.hasOwn(flags,key)){
   console.error('Invalid flags');process.exit(2);
 }
 flags[key]=process.argv[i+1];
}
const name=command==='draft'?'opendesk.codex.open_draft':command==='run'?'opendesk.codex.start_turn':null;
if(!name||!flags['--prompt']||(command==='run'&&!flags['--cwd'])){
 console.error('Usage: node trigger.mjs draft --prompt TEXT [--origin-url https://github.com/org/repo]');
 console.error('   or: node trigger.mjs run --cwd /absolute/workspace --prompt TEXT');
 console.error('Set OPEN_DESK_DEMO_ALLOW_LIVE=1 for real macOS launch / real Codex execution.');
 process.exit(2);
}
const args=command==='draft'?{prompt:flags['--prompt'],...(flags['--origin-url']?{originUrl:flags['--origin-url']}:{})}:{cwd:flags['--cwd'],prompt:flags['--prompt']};
const srv=spawn(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),'demo.mjs'),'mcp'],{stdio:['pipe','pipe','inherit'],env:process.env});
const rl=createInterface({input:srv.stdout});
let done=false;
const timeout=setTimeout(()=>{if(!done){console.error('MCP timeout: outcome unknown, do not replay a live operation');srv.kill();process.exitCode=3;}},120000);
function send(msg){srv.stdin.write(JSON.stringify(msg)+'\n');}
function end(ok,value){
 if(done)return;done=true;clearTimeout(timeout);
 console.log(JSON.stringify(value,null,2));
 process.exitCode=ok?0:1;
 srv.stdin.end();srv.kill();
}
rl.on('line',line=>{
 let msg;try{msg=JSON.parse(line)}catch{return end(false,{error:'Malformed MCP reply'})}
 if(msg.id===1){
   if(msg.error)return end(false,msg.error);
   send({jsonrpc:'2.0',method:'notifications/initialized'});
   send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}});
 }else if(msg.id===2){
   if(msg.error)return end(false,msg.error);
   const content=msg.result?.content?.[0]?.text;
   let parsed;try{parsed=JSON.parse(content)}catch{parsed={text:content}}
   end(msg.result?.isError!==true,parsed);
 }
});
srv.on('error',()=>end(false,{error:'Local demo MCP process could not start'}));
srv.on('exit',()=>{if(!done)end(false,{error:'Local demo MCP process exited before reply; do not replay'});});
send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'webflow-demo-trigger',version:'0.1.0'}}});
