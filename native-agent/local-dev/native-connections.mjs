// Discovery for the existing Go Host. Probes authenticate only; they never grant.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {installationRoot} from '../installation-root.mjs';

const ID=/^[a-f0-9]{32}$/;
const EXTENSION=/^[a-p]{32}$/;
const CREDENTIAL=/^[a-f0-9]{64}$/;
const MAX_RECORD=16384,MAX_WIRE=60*1024;
export const MAX_CONNECTIONS=8;
const problem=(code,message=code)=>Object.assign(new Error(message),{code});
function trusted(file,kind,mode){
  const info=fs.lstatSync(file);
  if(info.isSymbolicLink()||!info[kind]()||(info.mode&0o777)!==mode||
    process.getuid&&info.uid!==process.getuid())
    throw problem('E_INSTALL_PERMISSIONS','Native 配置路径的类型、权限或所有者不安全');
  return info;
}
function readRecord(file){
  const info=trusted(file,'isFile',0o600);
  if(info.size>MAX_RECORD)throw problem('E_INSTALL_INVALID','Native 配置过大');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    const opened=fs.fstatSync(fd);
    if(opened.dev!==info.dev||opened.ino!==info.ino)throw problem('E_INSTALL_INVALID');
    const bytes=Buffer.alloc(MAX_RECORD+1);
    const size=fs.readSync(fd,bytes,0,bytes.length,0);
    if(size>MAX_RECORD)throw problem('E_INSTALL_INVALID','Native 配置过大');
    const raw=JSON.parse(bytes.subarray(0,size).toString('utf8'));
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw problem('E_INSTALL_INVALID');
    return raw;
  }catch(error){
    if(error instanceof SyntaxError)throw problem('E_INSTALL_INVALID','Native 配置不是有效 JSON');
    throw error;
  }finally{fs.closeSync(fd);}
}
function parentInstallation(home,instance){
  const root=installationRoot({home,instance});
  for(const dir of new Set([path.join(home,'.opendesk-browser'),path.dirname(root),root]))
    trusted(dir,'isDirectory',0o700);
  const raw=readRecord(path.join(root,'install.json')),parent={};
  for(const field of ['Provider','InstallRoot','SocketPath','ExtensionID','ClientCredential','Browser',
    'UserDataDir','Name','Executable','ApprovedExtensions','ConnectionID','ParentRoot','ParentCredentialDigest']){
    const key=({ExtensionID:'extensionId',ConnectionID:'connectionId'})[field]||field[0].toLowerCase()+field.slice(1);
    if(Object.hasOwn(raw,key)&&Object.hasOwn(raw,field)&&raw[key]!==raw[field])throw problem('E_INSTALL_INVALID','安装配置字段冲突');
    parent[field]=Object.hasOwn(raw,key)?raw[key]:raw[field];
    if(field==='UserDataDir'&&parent[field]===null)parent[field]='';
    if(parent[field]!==undefined&&typeof parent[field]!=='string')throw problem('E_INSTALL_INVALID','安装配置必须使用字符串字段');
  }
  if(parent.Provider!=='opendesk'||parent.InstallRoot!==root||parent.SocketPath!==path.join(root,'agent.sock')||
    !EXTENSION.test(parent.ExtensionID||'')||!CREDENTIAL.test(parent.ClientCredential||'')||
    !['chrome','cft'].includes(parent.Browser))
    throw problem('E_MIGRATION_REQUIRED','需要受信 Go OpenDesk Native Host；不自动迁移旧 Node Host');
  if(parent.ConnectionID||parent.ParentRoot||parent.ParentCredentialDigest)throw problem('E_INSTALL_INVALID');
  const approved=parent.ApprovedExtensions===undefined?'':parent.ApprovedExtensions;
  if(typeof approved!=='string')throw problem('E_INSTALL_INVALID');
  const ids=approved===''?[]:approved.split(',');
  if(ids.length>=8||ids.some((id,i)=>!EXTENSION.test(id)||id===parent.ExtensionID||i>0&&id<=ids[i-1]))
    throw problem('E_INSTALL_INVALID','批准的扩展 ID 列表无效');
  return {parent,approved:new Set([parent.ExtensionID,...ids])};
}
function clientConfig(raw){
  return {socketPath:raw.SocketPath,clientCredential:raw.ClientCredential,extensionId:raw.ExtensionID,
    browser:raw.Browser,userDataDir:raw.UserDataDir||''};
}
// Remains synchronous for --doctor and existing installation diagnostics.
export function loadGoInstall(home=os.homedir(),{instance=process.env.OPENDESK_NATIVE_INSTANCE}={}){
  return clientConfig(parentInstallation(home,instance).parent);
}
function scopedConfig(home,id,{parent,approved},{discovery=false}={}){
  const base=path.join(home,'.opendesk-browser','c'),root=path.join(base,id);
  trusted(base,'isDirectory',0o700);trusted(root,'isDirectory',0o700);
  let raw;
  try{raw=readRecord(path.join(root,'connection.json'));}
  catch(error){if(discovery&&error.code==='ENOENT')return null;throw error;}
  // The private global directory is shared by default and named installations.
  // Classify only a securely read publication with a concrete parent identity;
  // malformed/unknown current identities must still fail closed below.
  if(discovery&&typeof raw.ParentRoot==='string'&&path.isAbsolute(raw.ParentRoot)&&raw.ParentRoot!==parent.InstallRoot)return null;
  // A revoked publication is never a target, even if its socket still answers.
  // Do not turn its presence into permission to select another Profile.
  if(optionalInfo(path.join(root,'revoked')))throw problem('E_CONNECTION_REVOKED');
  for(const field of ['ConnectionID','ExtensionID','ClientCredential','InstallRoot','SocketPath',
    'ParentRoot','ParentCredentialDigest','Provider','Name','Executable','Browser','UserDataDir']){
    if(raw[field]!==undefined&&typeof raw[field]!=='string')throw problem('E_CONNECTION_INVALID','连接配置必须使用 Go 字符串字段');
  }
  if(raw.ConnectionID!==id||raw.InstallRoot!==root||raw.SocketPath!==path.join(root,'agent.sock')||
    Buffer.byteLength(raw.SocketPath)>=104||!CREDENTIAL.test(raw.ClientCredential||'')||
    raw.ClientCredential===parent.ClientCredential||!approved.has(raw.ExtensionID)||
    raw.ParentRoot!==parent.InstallRoot||raw.ParentCredentialDigest!==crypto.createHash('sha256').update(parent.ClientCredential).digest('hex')||
    ['Provider','Name','Executable','Browser','UserDataDir'].some(field=>(raw[field]??'')!==(parent[field]??'')))
    throw problem('E_CONNECTION_INVALID','连接记录与受信安装身份不符');
  return Object.freeze({...clientConfig(raw),connectionId:id});
}
function optionalInfo(file){
  try{return fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function socketPresent(file){
  if(!optionalInfo(file))return false;
  trusted(file,'isSocket',0o600);return true;
}
// Shared by discovery and attach: an auth ACK never identifies a different scope.
export function verifyConnectionAuth(cfg,message){
  if(message?.v!==1||message.kind!=='authenticated')throw problem('E_NATIVE_AUTH','Host 验证未通过');
  if(cfg.connectionId!==undefined&&(message.connectionId!==cfg.connectionId||message.extensionId!==cfg.extensionId))
    throw problem('E_CONNECTION_IDENTITY','Native 回包的连接或扩展身份不符');
  if(message.browserReady!==true)throw problem('E_NATIVE_NOT_READY','扩展尚未完成 Native 连接');
}
export function probeConnection(cfg,{timeoutMs=750,connect=net.createConnection}={}){
  return new Promise((resolve,reject)=>{
    const socket=connect({path:cfg.socketPath});let buffer=Buffer.alloc(0),done=false;
    const finish=error=>{
      if(done)return;done=true;clearTimeout(timer);socket.destroy();
      if(error)reject(error);else resolve();
    };
    const timer=setTimeout(()=>finish(problem('E_NATIVE_NOT_READY','Native 身份探测超时')),timeoutMs);
    socket.on('error',()=>finish(problem('E_NATIVE_NOT_READY')));
    socket.once('close',()=>{if(!done)finish(problem('E_NATIVE_NOT_READY'));});
    socket.once('connect',()=>socket.write(JSON.stringify({v:1,kind:'auth',credential:cfg.clientCredential})+'\n'));
    socket.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>MAX_WIRE+1){finish(problem('E_LIMIT'));return;}
      const end=buffer.indexOf(10);if(end<0)return;
      try{verifyConnectionAuth(cfg,JSON.parse(buffer.subarray(0,end).toString('utf8')));finish();}
      catch(error){finish(error instanceof SyntaxError?problem('E_SCHEMA'):error);}
    });
  });
}
export async function resolveNativeConnection(home=os.homedir(),{
  instance=process.env.OPENDESK_NATIVE_INSTANCE,connection=process.env.OPENDESK_NATIVE_CONNECTION,
  timeoutMs=750,connect=net.createConnection,
}={}){
  if(connection!==undefined&&(typeof connection!=='string'||connection!=='legacy'&&!ID.test(connection)))throw problem('E_CONNECTION_INVALID');
  const installed=parentInstallation(home,instance);
  if(connection==='legacy'){
    const cfg=Object.freeze(clientConfig(installed.parent));
    if(!socketPresent(cfg.socketPath))throw problem('E_CONNECTION_GONE');
    await probeConnection(cfg,{timeoutMs,connect});return cfg;
  }
  if(connection!==undefined){
    let cfg;
    try{cfg=scopedConfig(home,connection,installed);}
    catch(error){if(error.code==='ENOENT')throw problem('E_CONNECTION_GONE');throw error;}
    if(!socketPresent(cfg.socketPath))throw problem('E_CONNECTION_GONE');
    await probeConnection(cfg,{timeoutMs,connect});return cfg;
  }
  const base=path.join(home,'.opendesk-browser','c'),candidates=[];
  if(optionalInfo(base)){
    trusted(base,'isDirectory',0o700);
    // Bound enumeration as well as records/probes. Unknown artifacts (e.g. Go's
    // allocation lock) count toward the directory bound but are never targets.
    const dir=fs.opendirSync(base);let count=0;
    try{
      let entry;
      while((entry=dir.readSync())!==null){
        if(++count>64)throw problem('E_LIMIT','Native 连接目录过大');
        if(!ID.test(entry.name))continue;
        let cfg;
        try{cfg=scopedConfig(home,entry.name,installed,{discovery:true});}
        catch(error){if(error.code==='ENOENT')throw problem('E_CONNECTION_GONE');throw error;}
        if(!cfg)continue;
        candidates.push(cfg);
        if(candidates.length>MAX_CONNECTIONS)throw problem('E_LIMIT','Native 连接数量过多');
      }
    }finally{dir.closeSync();}
  }
  const legacy=clientConfig(installed.parent);
  const legacyPresent=socketPresent(legacy.socketPath);
  if(candidates.length>1||candidates.length&&legacyPresent)
    throw problem('E_CONNECTION_REQUIRED','存在多个 Native 连接；请用 --connection <32hex|legacy> 或 OPENDESK_NATIVE_CONNECTION 明确选择');
  // No scopes: preserve the old paired-installation startup/retry path.
  if(!candidates.length)return Object.freeze(legacy);
  const cfg=candidates[0];
  if(!socketPresent(cfg.socketPath))throw problem('E_CONNECTION_GONE');
  await probeConnection(cfg,{timeoutMs,connect});return cfg;
}
