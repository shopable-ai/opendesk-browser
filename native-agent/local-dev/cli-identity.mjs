import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CLI_PACKAGE='@shopable/opendesk-dev';
export const BUILD_FORMAT='opendesk.dev-cli.build.v1';
export const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const moduleRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
export function contentInventory(root,paths=['package.json','bin','runtime']){
  const rows=[];
  function visit(relative){
    const file=path.join(root,relative),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())throw new Error('E_DEV_PACKAGE_LINK');
    if(stat.isDirectory()){
      for(const name of fs.readdirSync(file).sort())visit(path.join(relative,name));
    }else if(stat.isFile()){
      rows.push({path:relative.split(path.sep).join('/'),bytes:stat.size,sha256:digest(fs.readFileSync(file))});
    }else throw new Error('E_DEV_PACKAGE_FILE');
  }
  for(const relative of paths)visit(relative);
  return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export const contentFingerprint=files=>digest(JSON.stringify(files));
export function createBuildInfo(root,source={}){
  const pkg=json(path.join(root,'package.json')),files=contentInventory(root);
  return {format:BUILD_FORMAT,package:pkg.name,version:pkg.version,
    contentFingerprint:contentFingerprint(files),files,source};
}
export function defaultCliRoot(){
  const parent=path.dirname(moduleRoot);
  try{if(json(path.join(parent,'package.json')).name===CLI_PACKAGE)return parent;}catch{}
  return path.join(moduleRoot,'packages','opendesk-dev');
}
export function readCliIdentity(root=defaultCliRoot()){
  const result={package:CLI_PACKAGE,packageRoot:path.resolve(root),mode:'installed-package',status:'unreadable'};
  try{
    result.packageRoot=fs.realpathSync(root);
    const pkg=json(path.join(root,'package.json'));
    if(pkg.name!==CLI_PACKAGE||typeof pkg.version!=='string')return {...result,status:'invalid-package'};
    result.version=pkg.version;
    result.entryPath=path.join(result.packageRoot,'bin','opendesk-dev.mjs');
    result.entrySha256=digest(fs.readFileSync(result.entryPath));
    // A checkout is useful for version inspection, but never an installed receipt.
    if(!fs.existsSync(path.join(root,'runtime'))&&result.packageRoot===defaultCliRoot()){
      result.mode='source-tree';
      result.contentFingerprint=contentFingerprint(contentInventory(moduleRoot,
        ['native-agent','scripts','src','packages/opendesk-dev']));
      return {...result,status:'source-unpacked'};
    }
    const files=contentInventory(root);
    result.contentFingerprint=contentFingerprint(files);
    if(!fs.existsSync(path.join(root,'build-info.json')))return {...result,status:'legacy-unrecorded'};
    const bytes=fs.readFileSync(path.join(root,'build-info.json'));
    result.metadataSha256=digest(bytes);
    const recorded=JSON.parse(bytes);
    result.recordedFingerprint=/^[a-f0-9]{64}$/.test(recorded.contentFingerprint||'')?recorded.contentFingerprint:null;
    // Only emit known provenance fields; never return arbitrary package metadata.
    result.source={gitHead:/^[a-f0-9]{40}$/.test(recorded.source?.gitHead||'')?recorded.source.gitHead:null,
      dirty:typeof recorded.source?.dirty==='boolean'?recorded.source.dirty:null,
      lockSha256:/^[a-f0-9]{64}$/.test(recorded.source?.lockSha256||'')?recorded.source.lockSha256:null};
    result.status=recorded.format===BUILD_FORMAT&&recorded.package===pkg.name&&recorded.version===pkg.version&&
      recorded.contentFingerprint===result.contentFingerprint&&
      JSON.stringify(recorded.files)===JSON.stringify(files)?'verified':'content-mismatch';
    return result;
  }catch{return result;}
}
export function formatCliVersion(identity=readCliIdentity()){
  return `OpenDesk Browser 本地目录直连 R17.1\n包版本：${identity.version||'未知'}\n内容 SHA-256：${identity.contentFingerprint||'不可读取'}\n身份：${identity.status}\n安装路径：${identity.packageRoot}\n入口：${identity.entryPath||'不可读取'}\n`;
}
