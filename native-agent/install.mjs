// User-scoped macOS installation; never changes the earlier OpenDesk demo's manifest.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {HOST_NAME,WireError} from './wire.mjs';

export const PRIVATE_DIR = path.join(os.homedir(),'.opendesk-browser','native-agent-r1');
export const INSTALL_FILE = path.join(PRIVATE_DIR,'install.json');
export const SOCKET_FILE = path.join(PRIVATE_DIR,'agent.sock');
export const MANIFEST_FILE = path.join(os.homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts',HOST_NAME+'.json');
const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ['native-host.mjs','wire.mjs'];
const extensionIdPattern = /^[a-p]{32}$/;
function refuseLinks(file) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new WireError('E_INSTALL_SYMLINK');
}
function ensurePrivate() {
  refuseLinks(PRIVATE_DIR);
  fs.mkdirSync(PRIVATE_DIR,{recursive:true,mode:0o700});
  fs.chmodSync(PRIVATE_DIR,0o700);
}
function writeJson(file,data) {
  refuseLinks(file);
  fs.writeFileSync(file+'.new',JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(file+'.new',file);
  fs.chmodSync(file,0o600);
}
export function loadInstall() {
  refuseLinks(INSTALL_FILE);
  const info=JSON.parse(fs.readFileSync(INSTALL_FILE,'utf8'));
  if(info.name!==HOST_NAME || info.socketPath!==SOCKET_FILE || !extensionIdPattern.test(info.extensionId))
    throw new WireError('E_INSTALL_INVALID');
  return info;
}
export function setup(extensionId) {
  if(process.platform!=='darwin')throw new WireError('E_PLATFORM','macOS only in R1');
  if(!extensionIdPattern.test(extensionId || ''))throw new WireError('E_EXTENSION_ID','Supply actual 32-char Chrome extension ID');
  ensurePrivate();
  if(fs.existsSync(SOCKET_FILE))throw new WireError('E_SOCKET_IN_USE','Stop Chrome Native Agent and inspect socket first');
  if(Buffer.byteLength(SOCKET_FILE)>=104)throw new WireError('E_SOCKET_PATH');
  const previous=fs.existsSync(INSTALL_FILE)?loadInstall():null;
  if(previous && previous.extensionId!==extensionId)throw new WireError('E_EXTENSION_ID_CONFLICT');
  for(const file of [...SCRIPTS,'native-host'])refuseLinks(path.join(PRIVATE_DIR,file));
  const expectedManifest={name:HOST_NAME,description:'OpenDesk Browser optional Native Agent',type:'stdio',
    path:path.join(PRIVATE_DIR,'native-host'),allowed_origins:['chrome-extension://'+extensionId+'/']};
  if(fs.existsSync(MANIFEST_FILE)) {
    const actual=JSON.parse(fs.readFileSync(MANIFEST_FILE,'utf8'));
    if(JSON.stringify(actual)!==JSON.stringify(expectedManifest))throw new WireError('E_MANIFEST_CONFLICT');
  }
  for(const file of SCRIPTS){
    fs.copyFileSync(path.join(SOURCE_DIR,file),path.join(PRIVATE_DIR,file));
    fs.chmodSync(path.join(PRIVATE_DIR,file),0o600);
  }
  const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
  const wrapper='#!/bin/sh\nexec '+quote(process.execPath)+' '+quote(path.join(PRIVATE_DIR,'native-host.mjs'))+' "$@"\n';
  fs.writeFileSync(path.join(PRIVATE_DIR,'native-host'),wrapper,{mode:0o700});
  fs.chmodSync(path.join(PRIVATE_DIR,'native-host'),0o700);
  writeJson(INSTALL_FILE,{name:HOST_NAME,extensionId,socketPath:SOCKET_FILE,
    clientCredential:previous?.clientCredential||crypto.randomBytes(32).toString('hex'),
    createdAt:previous?.createdAt||new Date().toISOString(),installedAt:new Date().toISOString(),
    installRoot:PRIVATE_DIR});
  fs.mkdirSync(path.dirname(MANIFEST_FILE),{recursive:true});
  writeJson(MANIFEST_FILE,expectedManifest);
  return {installed:true,extensionId,manifest:MANIFEST_FILE,nativeHost:expectedManifest.path};
}
export function doctor() {
  let installed=false,extensionId=null,error=null;
  try {
    const info=loadInstall();extensionId=info.extensionId;
    const manifest=JSON.parse(fs.readFileSync(MANIFEST_FILE,'utf8'));
    installed=manifest.name===HOST_NAME && manifest.path===path.join(PRIVATE_DIR,'native-host') &&
      JSON.stringify(manifest.allowed_origins)===JSON.stringify(['chrome-extension://'+extensionId+'/']);
    for(const file of SCRIPTS)installed &&= fs.existsSync(path.join(PRIVATE_DIR,file));
  }catch(e){error=e.code||'E_NOT_INSTALLED';}
  return {installed,extensionId,socketExists:fs.existsSync(SOCKET_FILE),error,
    note:'Socket existence does not prove an authenticated Chrome connection'};
}
export function cleanup() {
  const info=loadInstall();
  if(fs.existsSync(SOCKET_FILE))throw new WireError('E_SOCKET_IN_USE','Stop Chrome Native connection first');
  if(fs.existsSync(MANIFEST_FILE)) {
    const current=JSON.parse(fs.readFileSync(MANIFEST_FILE,'utf8'));
    if(current.name!==HOST_NAME || current.path!==path.join(PRIVATE_DIR,'native-host') ||
        JSON.stringify(current.allowed_origins)!==JSON.stringify(['chrome-extension://'+info.extensionId+'/']))
      throw new WireError('E_MANIFEST_CONFLICT');
    fs.unlinkSync(MANIFEST_FILE);
  }
  for(const file of [...SCRIPTS,'native-host','install.json']) {
    const target=path.join(PRIVATE_DIR,file);refuseLinks(target);if(fs.existsSync(target))fs.unlinkSync(target);
  }
  if(!fs.readdirSync(PRIVATE_DIR).length)fs.rmdirSync(PRIVATE_DIR);
  return {cleaned:true,otherNativeHostsUntouched:true};
}
