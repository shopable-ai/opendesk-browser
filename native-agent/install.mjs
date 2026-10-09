// User-scoped macOS/Linux installation; never changes another host's manifest.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {HOST_NAME,WireError} from './wire.mjs';
import {manifestLocation} from './locations.mjs';

export const PRIVATE_DIR = path.join(os.homedir(),'.opendesk-browser','native-agent-r1');
export const INSTALL_FILE = path.join(PRIVATE_DIR,'install.json');
export const SOCKET_FILE = path.join(PRIVATE_DIR,'agent.sock');
export const MANIFEST_FILE = manifestLocation('chrome');
export const CFT_MANIFEST_FILE = manifestLocation('cft');
export const manifestFor = manifestLocation;
const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ['native-host.mjs','wire.mjs','locations.mjs'];
const extensionIdPattern = /^[a-p]{32}$/;
function refuseLinks(file) {
  // lstat also detects dangling symlinks, which existsSync would miss.
  try {if(fs.lstatSync(file).isSymbolicLink())throw new WireError('E_INSTALL_SYMLINK');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
function ensurePrivate() {
  refuseLinks(path.dirname(PRIVATE_DIR));
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
  refuseLinks(path.dirname(PRIVATE_DIR));
  refuseLinks(PRIVATE_DIR);
  refuseLinks(INSTALL_FILE);
  for (const file of [PRIVATE_DIR,INSTALL_FILE]) {
    const stat=fs.statSync(file);
    if ((stat.mode&0o077)!==0 || (process.getuid&&stat.uid!==process.getuid()))
      throw new WireError('E_INSTALL_PERMISSIONS');
  }
  const info=JSON.parse(fs.readFileSync(INSTALL_FILE,'utf8'));
  if(info.name!==HOST_NAME || info.socketPath!==SOCKET_FILE ||
    !['chrome','cft'].includes(info.browser||'chrome') ||
    !extensionIdPattern.test(info.extensionId) || !/^[a-f0-9]{64}$/.test(info.clientCredential))
    throw new WireError('E_INSTALL_INVALID');
  manifestFor(info.browser||'chrome',info.userDataDir??null);
  return info;
}
export function setup(extensionId,browser='chrome',userDataDir=null) {
  if(userDataDir!==null)userDataDir=fs.realpathSync(userDataDir);
  const manifestFile=manifestFor(browser,userDataDir);
  if(!extensionIdPattern.test(extensionId || ''))throw new WireError('E_EXTENSION_ID','Supply actual 32-char Chrome extension ID');
  ensurePrivate();
  if(fs.existsSync(SOCKET_FILE))throw new WireError('E_SOCKET_IN_USE','Stop Chrome Native Agent and inspect socket first');
  if(Buffer.byteLength(SOCKET_FILE)>=104)throw new WireError('E_SOCKET_PATH');
  const previous=fs.existsSync(INSTALL_FILE)?loadInstall():null;
  if(previous && previous.extensionId!==extensionId)throw new WireError('E_EXTENSION_ID_CONFLICT');
  if(previous && (previous.browser||'chrome')!==browser)throw new WireError('E_BROWSER_CONFLICT','Cleanup old Native Agent setup before changing Chrome variant');
  if(previous && (previous.userDataDir??null)!==userDataDir)throw new WireError('E_PROFILE_CONFLICT','Cleanup old Native Agent setup before changing browser profile');
  for(const file of [...SCRIPTS,'native-host'])refuseLinks(path.join(PRIVATE_DIR,file));
  const expectedManifest={name:HOST_NAME,description:'OpenDesk Browser optional Native Agent',type:'stdio',
    path:path.join(PRIVATE_DIR,'native-host'),allowed_origins:['chrome-extension://'+extensionId+'/']};
  refuseLinks(manifestFile);
  refuseLinks(path.dirname(manifestFile));
  if(fs.existsSync(manifestFile)) {
    const actual=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
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
  writeJson(INSTALL_FILE,{name:HOST_NAME,extensionId,browser,userDataDir,socketPath:SOCKET_FILE,
    clientCredential:previous?.clientCredential||crypto.randomBytes(32).toString('hex'),
    createdAt:previous?.createdAt||new Date().toISOString(),installedAt:new Date().toISOString(),
    installRoot:PRIVATE_DIR});
  fs.mkdirSync(path.dirname(manifestFile),{recursive:true});
  writeJson(manifestFile,expectedManifest);
  return {installed:true,extensionId,browser,manifest:manifestFile,nativeHost:expectedManifest.path};
}
export function doctor() {
  let installed=false,extensionId=null,browser=null,manifestFile=null,error=null;
  try {
    const info=loadInstall();extensionId=info.extensionId;browser=info.browser||'chrome';
    manifestFile=manifestFor(browser,info.userDataDir??null);
    refuseLinks(manifestFile);
    refuseLinks(path.dirname(manifestFile));
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    installed=manifest.name===HOST_NAME && manifest.path===path.join(PRIVATE_DIR,'native-host') &&
      JSON.stringify(manifest.allowed_origins)===JSON.stringify(['chrome-extension://'+extensionId+'/']);
    for(const file of SCRIPTS)installed &&= fs.existsSync(path.join(PRIVATE_DIR,file));
  }catch(e){error=e.code||'E_NOT_INSTALLED';}
  return {installed,extensionId,browser,manifest:manifestFile,socketExists:fs.existsSync(SOCKET_FILE),error,
    note:'Socket existence does not prove an authenticated Chrome connection'};
}
export function cleanup() {
  const info=loadInstall();
  const manifestFile=manifestFor(info.browser||'chrome',info.userDataDir??null);
  if(fs.existsSync(SOCKET_FILE))throw new WireError('E_SOCKET_IN_USE','Stop Chrome Native connection first');
  refuseLinks(manifestFile);
  refuseLinks(path.dirname(manifestFile));
  if(fs.existsSync(manifestFile)) {
    const current=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    if(current.name!==HOST_NAME || current.path!==path.join(PRIVATE_DIR,'native-host') ||
        JSON.stringify(current.allowed_origins)!==JSON.stringify(['chrome-extension://'+info.extensionId+'/']))
      throw new WireError('E_MANIFEST_CONFLICT');
    fs.unlinkSync(manifestFile);
  }
  for(const file of [...SCRIPTS,'native-host','install.json']) {
    const target=path.join(PRIVATE_DIR,file);refuseLinks(target);if(fs.existsSync(target))fs.unlinkSync(target);
  }
  if(!fs.readdirSync(PRIVATE_DIR).length)fs.rmdirSync(PRIVATE_DIR);
  return {cleaned:true,otherNativeHostsUntouched:true};
}
