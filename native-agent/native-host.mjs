#!/usr/bin/env node
// Chrome-launched Native Messaging transport ONLY. All browser effects remain in
// the extension's existing Service Worker -> Sidebar RunHost -> Controller chain.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NativeDecoder, LineDecoder, WireError, HOST_NAME, MAX_BYTES,
  MAX_INFLIGHT, frame, requestShape, writeLine} from './wire.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ID = /^[a-p]{32}$/;
const REQUEST_ID = /^[a-zA-Z0-9._:-]{1,100}$/;
const MAX_CLIENTS = 8;
const HANDSHAKE_TIMEOUT_MS = 10000;
const AUTH_TIMEOUT_MS = 3000;
const NATIVE_TIMEOUT_MS = 138000; // SW times out at 135s; CLI at 145s.

function restricted(file, directory=false) {
  const stat=fs.lstatSync(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid!==process.getuid()))
    throw new WireError('E_INSTALL_PERMISSIONS');
  return stat;
}

// Only the installed immutable snapshot is trusted. Do not use env credentials.
export function readInstalledConfiguration() {
  const home=os.homedir();
  const expectedRoot=path.join(home,'.opendesk-browser','native-agent-r1');
  if (ROOT!==expectedRoot) throw new WireError('E_INSTALL_INVALID');
  restricted(ROOT,true);
  const infoPath=path.join(ROOT,'install.json');
  restricted(infoPath);
  const info=JSON.parse(fs.readFileSync(infoPath,'utf8'));
  if (info.name!==HOST_NAME || info.installRoot!==ROOT ||
      info.socketPath!==path.join(ROOT,'agent.sock') || !EXTENSION_ID.test(info.extensionId) ||
      !/^[a-f0-9]{64}$/.test(info.clientCredential)) throw new WireError('E_INSTALL_INVALID');
  restricted(path.join(ROOT,'wire.mjs'));
  restricted(path.join(ROOT,'native-host.mjs'));
  const manifestFile=path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts',HOST_NAME+'.json');
  if (fs.lstatSync(manifestFile).isSymbolicLink()) throw new WireError('E_MANIFEST_CONFLICT');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if (manifest.name!==HOST_NAME || manifest.type!=='stdio' ||
      manifest.path!==path.join(ROOT,'native-host') ||
      JSON.stringify(manifest.allowed_origins)!==JSON.stringify(['chrome-extension://'+info.extensionId+'/']))
    throw new WireError('E_MANIFEST_CONFLICT');
  return info;
}

function credentialMatches(expected,actual) {
  if (typeof actual!=='string' || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected,'ascii'),Buffer.from(actual,'ascii'));
}

// Testable using fake stdio + an isolated private Unix socket; no Controller here.
export function createNativeHost({installation,origin,input=process.stdin,output=process.stdout,
  handshakeTimeoutMs=HANDSHAKE_TIMEOUT_MS,nativeTimeoutMs=NATIVE_TIMEOUT_MS}={}) {
  if (!installation || installation.name!==HOST_NAME || !EXTENSION_ID.test(installation.extensionId) ||
      !/^[a-f0-9]{64}$/.test(installation.clientCredential) ||
      !path.isAbsolute(installation.socketPath) ||
      origin!=='chrome-extension://'+installation.extensionId+'/')
    throw new WireError('E_EXTENSION_ID');

  const clients=new Set(),pending=new Map(),decoder=new NativeDecoder();
  let server=null,ownSocket=null,ready=false,closed=false,handshakeTimer=null;
  function sendNative(value) {
    const bytes=frame(value);
    if (closed || output.destroyed || output.writableLength+bytes.length > MAX_BYTES*2)
      throw new WireError('E_BACKPRESSURE');
    output.write(bytes);
  }
  function sendLocal(socket,value) {
    if (!socket.destroyed) writeLine(socket,value);
  }
  function localError(socket,id,code,outcome='NOT_DISPATCHED') {
    try {sendLocal(socket,{v:1,kind:'response',requestId:id,
      error:{code,message:code,outcome}});}catch {socket.destroy();}
  }
  function failPending(code='E_EFFECT_UNKNOWN') {
    for (const [id,item] of pending) {
      clearTimeout(item.timer);
      localError(item.socket,id,code,'OUTCOME_UNKNOWN');
      pending.delete(id);
    }
  }
  function unlinkOwned() {
    if (!ownSocket) return;
    try {
      const now=fs.lstatSync(installation.socketPath);
      if (now.isSocket() && now.ino===ownSocket.ino && now.dev===ownSocket.dev)
        fs.unlinkSync(installation.socketPath);
    }catch(e) {if (e.code!=='ENOENT') {/* fail closed; never delete another inode */}}
    ownSocket=null;
  }
  function close() {
    if (closed) return;
    closed=true;ready=false;clearTimeout(handshakeTimer);
    input.off('data',onNativeData);input.off('end',close);input.off('error',close);
    failPending();
    for (const item of clients) {clearTimeout(item.authTimer);item.socket.destroy();}
    clients.clear();
    if (server) server.close(unlinkOwned); else unlinkOwned();
  }
  function onNativeData(bytes) {
    try {
      for (const message of decoder.push(bytes)) {
        if (!ready) {
          if (message?.v!==1 || message.kind!=='welcome' ||
              message.extensionId!==installation.extensionId ||
              typeof message.extensionVersion!=='string') throw new WireError('E_NATIVE_HANDSHAKE');
          ready=true;clearTimeout(handshakeTimer);continue;
        }
        if (message?.v!==1 || message.kind!=='response' ||
            !REQUEST_ID.test(message.requestId) ||
            Object.hasOwn(message,'result')===Object.hasOwn(message,'error'))
          throw new WireError('E_SCHEMA');
        const item=pending.get(message.requestId);
        if (!item) continue; // A late/unknown ACK may never start another operation.
        clearTimeout(item.timer);pending.delete(message.requestId);
        try {sendLocal(item.socket,message);}catch {item.socket.destroy();}
      }
    }catch {close();}
  }
  function onClient(socket) {
    if (closed || clients.size>=MAX_CLIENTS) {socket.destroy();return;}
    const item={socket,authenticated:false,used:false,decoder:new LineDecoder(),authTimer:null};
    clients.add(item);
    socket.setNoDelay(true);
    item.authTimer=setTimeout(()=>socket.destroy(),AUTH_TIMEOUT_MS);
    socket.on('data',chunk=>{
      try {for(const message of item.decoder.push(chunk)) {
        if (!item.authenticated) {
          if (message?.v!==1 || message.kind!=='auth' ||
              !credentialMatches(installation.clientCredential,message.credential))
            throw new WireError('E_AUTH');
          item.authenticated=true;clearTimeout(item.authTimer);
          sendLocal(socket,{v:1,kind:'authenticated',browserReady:ready});
          continue;
        }
        if (item.used) throw new WireError('E_SCHEMA');
        item.used=true;
        const req=requestShape(message);
        if (!ready) {localError(socket,req.requestId,'E_NATIVE_NOT_READY');continue;}
        if (pending.size>=MAX_INFLIGHT) {localError(socket,req.requestId,'E_LIMIT');continue;}
        if (pending.has(req.requestId)) {localError(socket,req.requestId,'E_REQUEST_CONFLICT');continue;}
        const timer=setTimeout(()=>{
          pending.delete(req.requestId);
          localError(socket,req.requestId,'E_EFFECT_UNKNOWN','OUTCOME_UNKNOWN');
        },nativeTimeoutMs);
        pending.set(req.requestId,{socket,timer});
        try {sendNative(req);}
        catch {
          clearTimeout(timer);pending.delete(req.requestId);
          localError(socket,req.requestId,'E_EFFECT_UNKNOWN','OUTCOME_UNKNOWN');
        }
      }} catch {socket.destroy();}
    });
    socket.on('error',()=>socket.destroy());
    socket.on('close',()=>{clearTimeout(item.authTimer);clients.delete(item);
      // Intentionally keep dispatched request IDs pending until ACK/timeout.
    });
  }
  async function start() {
    if (server || closed) throw new WireError('E_NATIVE_NOT_READY');
    if (fs.existsSync(installation.socketPath)) throw new WireError('E_SOCKET_IN_USE');
    restricted(path.dirname(installation.socketPath),true);
    server=net.createServer(onClient);
    try {
      await new Promise((resolve,reject)=>{
        const onError=e=>{server.off('listening',onListening);reject(e);};
        const onListening=()=>{server.off('error',onError);resolve();};
        server.once('error',onError);server.once('listening',onListening);
        server.listen(installation.socketPath);
      });
      fs.chmodSync(installation.socketPath,0o600);
      ownSocket=fs.lstatSync(installation.socketPath);
      if (!ownSocket.isSocket()) throw new WireError('E_SOCKET_INVALID');
      server.on('error',close);
      input.on('data',onNativeData);input.once('end',close);input.once('error',close);
      sendNative({v:1,kind:'hello'});
      handshakeTimer=setTimeout(close,handshakeTimeoutMs);
    }catch(e){close();throw e;}
    return {socketPath:installation.socketPath};
  }
  return {start,close,get ready(){return ready;},get pending(){return pending.size;}};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if (process.platform!=='darwin') throw new WireError('E_PLATFORM');
    const host=createNativeHost({installation:readInstalledConfiguration(),origin:process.argv[2]});
    host.start().catch(e=>{
      process.stderr.write('OpenDesk Native Agent: '+(e.code||'E_NATIVE_START')+'\n');
      process.exitCode=1;
    });
  }catch(e){
    process.stderr.write('OpenDesk Native Agent: '+(e.code||'E_NATIVE_START')+'\n');
    process.exitCode=1;
  }
}
