// Explicit local UI staging. Never installs, opens, runs npm or grants tool capabilities.
import {readFile,realpath,stat,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildSidebarTool} from './build-sidebar-tool.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
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
    return Object.freeze({status:'STAGED_NOT_INSTALLED',id:result.id,version:result.version,
      output,sha256,sourceFingerprint:before.fingerprint,buildId:before.buildId,
      validated:true,installed:false,previewAuthorized:false});
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
