#!/usr/bin/env node
// Local-only release preflight: no network, no publisher authorization and no install side effects.
// This does not make a package public or change its existing execution/installation schema.
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2} from '../src/ui/sidebar-tools/package.js';
import {validatePageInstallPackage,PAGE_INSTALL_FORMAT} from '../src/scripting/user-scripts/page-install-package.js';
import {verifyTaskPackage,TASK_PACKAGE_FORMAT} from '../src/platform/tasks/contract.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const fields=(value,allowed)=>plain(value)&&Object.keys(value).length===allowed.length&&
  allowed.every(key=>Object.hasOwn(value,key));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
const pngHeader=bytes=>{
  const file=Buffer.from(bytes);
  return file.length>=33&&file.subarray(0,8).equals(pngMagic)&&
    file.readUInt32BE(8)===13&&file.toString('ascii',12,16)==='IHDR'&&
    file.readUInt32BE(16)>0&&file.readUInt32BE(16)<=10000&&
    file.readUInt32BE(20)>0&&file.readUInt32BE(20)<=10000;
};
const screenshotPath=name=>typeof name==='string'&&name.length<=180&&
  !isAbsolute(name)&&!name.includes('\\')&&name.split('/').every(part=>part&&part!=='.'&&part!=='..')&&
  name.endsWith('.png')&&!name.includes('\0');
const text=(value,max)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max;

/** Validates an already-built package and separate author-supplied release information.
 * Never writes back to the package, invokes an installer, opens a browser, or uploads.
 */
export async function prepareExtensionRelease(packageBytes,metadata,{readScreenshot=async()=>fail('E_RELEASE_SCREENSHOT','缺少可核对的截图文件')}={}){
  if(!(packageBytes instanceof Uint8Array)||packageBytes.length===0||packageBytes.length>1024*1024)
    fail('E_RELEASE_PACKAGE','正式安装包必须是有界的原始 UTF-8 文件');
  let pkg;
  try{pkg=JSON.parse(Buffer.from(packageBytes).toString('utf8'));}
  catch{fail('E_RELEASE_PACKAGE','安装包不是有效 JSON');}
  const format=pkg?.format;
  let artifact;
  if([SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2].includes(format)){
    const installed=validateSidebarToolPackage(pkg);
    artifact={kind:'sidebar-app',format,id:installed.id,version:installed.version,
      capabilities:installed.capabilities};
  }else if(format===PAGE_INSTALL_FORMAT){
    const installed=await validatePageInstallPackage(pkg);
    artifact={kind:'page-program',format,id:installed.programId,version:installed.version,
      revision:installed.revision,sourceHash:installed.sourceHash,packageHash:installed.packageHash,
      sitePatterns:installed.pageRules.matches};
  }else if(format===TASK_PACKAGE_FORMAT){
    const installed=await verifyTaskPackage(pkg);
    artifact={kind:'controller-task',format,id:installed.manifest.taskId,version:installed.manifest.version,
      manifestHash:installed.manifestHash,sourceHash:installed.manifest.program.sourceHash,
      siteOrigins:installed.manifest.siteOrigins,capabilities:installed.manifest.permissions};
  }else fail('E_RELEASE_FORMAT','未知插件安装格式；不能转换为另一种包');
  const required=['schema','publisherName','license','summary','releaseNotes','sourceDisclosure','screenshots'];
  if(!fields(metadata,required)||metadata.schema!=='opendesk.release-preflight-input.v1'||
     !text(metadata.publisherName,100)||!text(metadata.license,100)||
     !text(metadata.summary,600)||!text(metadata.releaseNotes,2000)||
     metadata.sourceDisclosure!=='package-includes-executable-source'||
     !Array.isArray(metadata.screenshots)||metadata.screenshots.length>6)
    fail('E_RELEASE_METADATA','发行描述字段不完整或不符合离线预检合同');
  const seen=new Set(),screenshots=[];
  for(const item of metadata.screenshots){
    if(!fields(item,['relativePath','sha256'])||!screenshotPath(item.relativePath)||
       !/^[a-f0-9]{64}$/.test(item.sha256)||seen.has(item.relativePath))
      fail('E_RELEASE_SCREENSHOT','截图必须使用唯一的相对 PNG 路径与 SHA-256');
    seen.add(item.relativePath);
    const bytes=await readScreenshot(item.relativePath);
    if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>5*1024*1024||
       !pngHeader(bytes)||sha(bytes)!==item.sha256)
      fail('E_RELEASE_SCREENSHOT','截图文件或 SHA-256 与预检描述不符');
    screenshots.push({relativePath:item.relativePath,sha256:item.sha256,bytes:bytes.length});
  }
  return {
    schema:'opendesk.release-preflight.v1',
    state:'OFFLINE_PACKAGE_VALIDATED',
    publication:'ONLINE_PUBLISH_NOT_IMPLEMENTED',
    artifact:{...artifact,sha256:sha(packageBytes),bytes:packageBytes.length},
    release:{publisherName:metadata.publisherName,license:metadata.license,
      summary:metadata.summary,releaseNotes:metadata.releaseNotes,
      sourceDisclosure:metadata.sourceDisclosure,screenshots},
    pending:['PUBLISHER_IDENTITY_UNVERIFIED','SOURCE_SECURITY_REVIEW_PENDING',
      'UPLOADER_AND_REVIEW_SERVICE_UNAVAILABLE','PUBLIC_UPLOAD_NOT_AUTHORIZED']
  };
}

async function readBoundedFile(path,max){
  const file=resolve(path),stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)
    fail('E_RELEASE_FILE','预检只读取有界普通文件：'+file);
  return readFile(file);
}
async function main(args=process.argv.slice(2)){
  const flags={};
  for(let i=0;i<args.length;i+=2){
    if(!['--package','--metadata','--out'].includes(args[i])||!args[i+1]||Object.hasOwn(flags,args[i]))
      fail('E_RELEASE_ARGS','用法：--package 正式安装包.json --metadata 发行资料.json --out 预检结果.json');
    flags[args[i]]=resolve(args[i+1]);
  }
  if(Object.keys(flags).length!==3||new Set(Object.values(flags)).size!==3)
    fail('E_RELEASE_ARGS','需要三个不同的正式包、发行资料和预检结果路径');
  const bytes=await readBoundedFile(flags['--package'],1024*1024);
  const metadata=JSON.parse((await readBoundedFile(flags['--metadata'],16384)).toString('utf8'));
  const base=dirname(flags['--metadata']);
  const release=await prepareExtensionRelease(bytes,metadata,{readScreenshot:async path=>{
    const file=resolve(base,path),actual=await realpath(file),root=await realpath(base);
    const inside=relative(root,actual);
    if(inside.startsWith('..'+sep)||inside==='..'||isAbsolute(inside))
      fail('E_RELEASE_SCREENSHOT','截图不能跨出发行资料目录');
    return readBoundedFile(actual,5*1024*1024);
  }});
  await mkdir(dirname(flags['--out']),{recursive:true});
  await writeFile(flags['--out'],JSON.stringify(release,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({state:release.state,publication:release.publication,
    kind:release.artifact.kind,id:release.artifact.id,version:release.artifact.version,
    sha256:release.artifact.sha256,report:flags['--out']}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error((error.code||'E_RELEASE')+'：'+error.message);process.exitCode=1;});
