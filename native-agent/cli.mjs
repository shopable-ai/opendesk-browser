#!/usr/bin/env node
// Thin Codex CLI adapter for the optional local Chrome Native Messaging connection.
// No alternate DOM executor. No implicit retry for any mutation or unknown result.
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import {setup,doctor,cleanup,loadInstall} from './install.mjs';
import {LineDecoder,WireError,writeLine,requestShape} from './wire.mjs';

export async function requestAgent(method,params={},requestId=crypto.randomUUID(),timeoutMs=145000) {
  const installation=loadInstall(),envelope=requestShape({v:1,kind:'request',method,params,requestId});
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(installation.socketPath),decoder=new LineDecoder();
    let authenticated=false,finished=false,sent=false;
    const timer=setTimeout(()=>fail(new WireError('E_EFFECT_UNKNOWN','IPC timed out; check durable run by ID, never automatically replay')),timeoutMs);
    function complete(reply,error) {
      if(finished)return;
      finished=true;clearTimeout(timer);socket.end();
      if(error)reject(error);else resolve(reply);
    }
    function fail(error) {complete(null,error);}
    socket.on('connect',()=>writeLine(socket,{v:1,kind:'auth',credential:installation.clientCredential}));
    socket.on('data',chunk=>{
      try {for(const message of decoder.push(chunk)){
        if(message.kind==='authenticated' && !authenticated) {
          authenticated=true;
          if(!message.browserReady)throw new WireError('E_NATIVE_NOT_READY','Chrome extension handshake is not ready');
          sent=true;writeLine(socket,envelope);continue;
        }
        if(message.kind==='response' && authenticated && message.requestId===requestId) {
          complete(message);return;
        }
        throw new WireError('E_SCHEMA','Native Host returned unexpected response');
      }} catch(error){fail(error);}
    });
    socket.on('error',error=>fail(new WireError(sent?'E_EFFECT_UNKNOWN':'E_NATIVE_NOT_READY',error.message)));
    socket.on('close',()=>{if(!finished)fail(new WireError(sent?'E_EFFECT_UNKNOWN':'E_NATIVE_NOT_READY','Native connection closed'));});
  });
}
async function main(args) {
  const [command,...rest]=args;
  if(command==='setup'||command==='update') {
    const idx=rest.indexOf('--extension-id');
    if(idx<0)throw new WireError('E_EXTENSION_ID','Usage: setup --extension-id <actual Chrome ID>');
    return setup(rest[idx+1]);
  }
  if(command==='cleanup'||command==='uninstall')return cleanup();
  if(command==='doctor') {
    const local=doctor();
    if(!local.installed||!local.socketExists)return {local,connected:false};
    try {
      const response=await requestAgent('bridge.status',{},crypto.randomUUID(),3000);
      return {local,connected:!response.error,response};
    }catch(error){return {local,connected:false,error:{code:error.code||'E_NATIVE_NOT_READY'}};}
  }
  if(!['bridge.status','target.current','script.save','run.start','run.get','run.stop'].includes(command))
    throw new WireError('E_CAPABILITY','Usage: [setup|update|doctor|cleanup|bridge.status|target.current|script.save|run.start|run.get|run.stop]');
  const index=rest.indexOf('--file');
  const json=index>=0?JSON.parse(fs.readFileSync(rest[index+1],'utf8')):{};
  if(json===null||typeof json!=='object'||Array.isArray(json))throw new WireError('E_SCHEMA','Request file must contain JSON object');
  const {requestId,...params}=json;
  const identity=rest.indexOf('--request-id'),chosen=identity>=0?rest[identity+1]:requestId||crypto.randomUUID();
  return requestAgent(command,params,chosen);
}
if(process.argv[1] && process.argv[1].endsWith('/cli.mjs')){
  main(process.argv.slice(2)).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result?.error||result?.connected===false)process.exitCode=1;
  }).catch(error=>{
    process.stderr.write(JSON.stringify({code:error.code||'E_NATIVE_ERROR',message:error.message})+'\n');
    process.exitCode=1;
  });
}
