// Explicit local UI staging. Never installs, opens, runs npm or grants tool capabilities.
import {readFile,realpath,stat,lstat,mkdir,mkdtemp,rm,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildSidebarTool} from './build-sidebar-tool.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const NATIVE_PREVIEW_ROOT='opendesk-tool-preview';
const CHUNK_BYTES=16000; // base64 per file <= 21,336 ASCII bytes; Go Native cap: 32,768.
async function safeDirectory(root,relative){
  const bits=relative.split('/');
  let current=root;
  for(const part of bits){
    if(!/^[a-z0-9-]{1,64}$/.test(part))fail('invalid Native preview directory');
    current=join(current,part);
    await mkdir(current,{mode:0o700,recursive:true});
    const info=await lstat(current),actual=await realpath(current);
    if(!info.isDirectory()||info.isSymbolicLink()||info.mode&0o022||
      !actual.startsWith(root+sep))fail('Native preview directory is unsafe');
  }
  return current;
}
async function stableWrite(file,bytes){
  try{await writeFile(file,bytes,{flag:'wx',mode:0o600});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const old=await readFile(file);
    if(!old.equals(Buffer.from(bytes)))fail('content-addressed Native preview file was modified');
  }
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.mode&0o022)fail('unsafe Native preview file');
}
async function publishNativeSnapshot(root,pkg,bytes,sha256,sourceFingerprint,buildId){
  const directory=NATIVE_PREVIEW_ROOT+'/'+pkg.id;
  const snapshot=directory+'/'+sha256;
  await safeDirectory(root,snapshot);
  const chunks=[];
  for(let i=0,offset=0;offset<bytes.length;i++,offset+=CHUNK_BYTES){
    const chunk=bytes.subarray(offset,offset+CHUNK_BYTES);
    const relative=snapshot+'/part-'+String(i).padStart(3,'0')+'.txt';
    await stableWrite(join(root,relative),chunk.toString('base64'));
    chunks.push({path:relative,sha256:digest(chunk),bytes:chunk.length});
  }
  const manifest={format:'opendesk.tool-snapshot.v1',id:pkg.id,version:pkg.version,
    sha256,bytes:bytes.length,sourceFingerprint,buildId,chunks};
  const manifestPath=snapshot+'/manifest.json';
  const manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n');
  await stableWrite(join(root,manifestPath),manifestBytes);
  // Only this small pointer is mutable. Atomic rename publishes a fully written
  // immutable snapshot; an extension re-reads the pointer after all chunks.
  const latest={format:'opendesk.tool-preview-latest.v1',id:pkg.id,version:pkg.version,
    sha256,manifestPath,manifestSha256:digest(manifestBytes),buildId};
  const pointer=join(root,directory,'latest.json');
  const temporary=join(root,directory,'.latest-'+process.pid+'-'+randomUUID()+'.tmp');
  try{
    await writeFile(temporary,JSON.stringify(latest)+'\n',{flag:'wx',mode:0o600});
    await rename(temporary,pointer);
  }finally{await rm(temporary,{force:true});}
  return {nativeLatest:directory+'/latest.json',nativeChunks:chunks.length,
    nativeManifest:manifestPath};
}
function fail(reason){const error=new Error('E_TOOL_STAGE: '+reason);error.code='E_TOOL_STAGE';throw error;}
function safeRelative(path){
  if(typeof path!=='string'||!path||path.length>180||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)||
    path.split('/').some(part=>!part||part==='.'||part==='..'))
    fail('invalid project-relative file path');
  return path;
}
async function ownedFile(root,rel){
  const target=resolve(root,safeRelative(rel));
  if(!target.startsWith(root+sep))fail('file escaped project');
  let actual;try{actual=await realpath(target);}catch{fail('required project file missing: '+rel);}
  if(!actual.startsWith(root+sep))fail('symlink escaped project');
  const info=await stat(actual);
  if(!info.isFile()||info.size>320000)fail('invalid or oversized project file: '+rel);
  return readFile(actual);
}
async function declaredSnapshot(root){
  const configBytes=await ownedFile(root,'tool.config.json');
  let config;try{config=JSON.parse(configBytes.toString('utf8'));}
  catch{fail('tool.config.json is invalid JSON');}
  const paths=config?.files;
  if(!paths||typeof paths!=='object'||Array.isArray(paths)||
    Object.keys(paths).sort().join(',')!=='css,html,js'||
    !Array.isArray(config.assets||[]))
    fail('tool configuration must name one HTML, CSS and JS file');
  const files=['tool.config.json',paths.html,paths.css,paths.js,...(config.assets||[])];
  const hashes=[];
  for(const name of files){
    const bytes=await ownedFile(root,name);
    hashes.push([name,bytes.length,digest(bytes)]);
  }
  let buildId=null;
  if(paths.js.startsWith('dist/')||paths.css.startsWith('dist/')){
    const bytes=await ownedFile(root,'dist/build-ready.json');
    let ready;try{ready=JSON.parse(bytes.toString('utf8'));}
    catch{fail('compiled UI build receipt is invalid');}
    if(ready?.format!=='opendesk.ui-build-ready.v1'||typeof ready.buildId!=='string'||
      !ready.buildId||ready.buildId.length>100||!ready.files||typeof ready.files!=='object'||
      Object.keys(ready.files).sort().join(',')!==[paths.css,paths.js].sort().join(','))
      fail('compiled UI build receipt does not match tool resources');
    for(const name of [paths.css,paths.js]){
      const actual=hashes.find(row=>row[0]===name),expected=ready.files[name];
      if(!actual||!expected||expected.bytes!==actual[1]||expected.sha256!==actual[2])
        fail('compiled UI output changed since the last successful build: '+name);
    }
    hashes.push(['dist/build-ready.json',bytes.length,digest(bytes)]);
    buildId=ready.buildId;
  }
  return {fingerprint:digest(JSON.stringify(hashes)),buildId};
}
export async function stageSidebarTool(path){
  const root=await realpath(path);
  if(!(await stat(root)).isDirectory())fail('tool project must be a directory');
  const before=await declaredSnapshot(root);
  const temporary=await mkdtemp(join(tmpdir(),'opendesk-tool-stage-'));
  try{
    const candidate=join(temporary,'candidate.opendesk-tool.json');
    const result=await buildSidebarTool(root,{out:candidate});
    const after=await declaredSnapshot(root);
    if(before.fingerprint!==after.fingerprint)
      fail('tool sources changed during packaging; retry a complete build');
    const bytes=await readFile(candidate),sha256=digest(bytes);
    const output=join(root,'.opendesk-preview',result.id,sha256+'.opendesk-tool.json');
    await mkdir(dirname(output),{recursive:true});
    try{await writeFile(output,bytes,{flag:'wx'});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const previous=await readFile(output);
      if(!previous.equals(bytes))fail('content-addressed snapshot was replaced or corrupted');
    }
    const native=await publishNativeSnapshot(root,result,bytes,sha256,before.fingerprint,before.buildId);
    return Object.freeze({status:'STAGED_NOT_INSTALLED',id:result.id,version:result.version,
      output,sha256,sourceFingerprint:before.fingerprint,buildId:before.buildId,
      ...native,validated:true,installed:false,previewAuthorized:false});
  }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length>3){
    console.error('Usage: node scripts/stage-sidebar-tool.mjs <tool-directory>');
    process.exitCode=1;
  }else stageSidebarTool(process.argv[2]||'.').then(result=>
    process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{
      process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;
    });
}
