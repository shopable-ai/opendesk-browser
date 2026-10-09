import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import webpack from 'webpack';
import {parse} from 'acorn';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {REMOTE_LOCK_FILE,REMOTE_CACHE_DIR} from '../../scripts/remote-esm-modules.mjs';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {createSnapshot,snapshotFileSystem,safeRead,sha256,devError} from './snapshot.mjs';

const VERSION='opendesk.local-dev-resolver.v2';
const UI=fileURLToPath(new URL('../../src/scripting/user-scripts/page-ui.js',import.meta.url));
const UI_MOUNT=fileURLToPath(new URL('../../src/scripting/user-scripts/page-ui-mount.js',import.meta.url));
const HELPERS=[UI,UI_MOUNT];
const validKind=kind=>['controller','page-userscript'].includes(kind);
const utf8=(bytes,file)=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw devError('E_PROJECT_ENCODING','Source must be UTF-8',file);}};
function staticOnly(source,file,type='module',asyncBody=false){
  let ast;
  const offset=asyncBody?1:0;
  try{ast=parse(offset?'async function __opendesk_syntax_check__(){\n'+source+'\n}':source,{ecmaVersion:'latest',sourceType:type,locations:true});}
  catch(error){throw devError('E_PROJECT_SYNTAX',error.message,{file,line:Math.max(1,error.loc.line-offset),column:error.loc.column});}
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression'||node.type==='MetaProperty'||
      node.type==='NewExpression'&&['Function','AsyncFunction'].includes(node.callee?.name)||
      node.type==='CallExpression'&&(['eval','require','Function'].includes(node.callee?.name)||node.callee?.object?.name==='require'))
      throw devError('E_DEV_DYNAMIC_CODE','Only static browser JavaScript is supported; no dynamic imports, loaders or runtime code generation',{file,line:node.loc?.start.line-offset,column:node.loc?.start.column});
    if(node.source?.value&&typeof node.source.value==='string'&&(/[!#\\]/.test(node.source.value)||!node.source.value.startsWith('https:')&&node.source.value.includes('?')))
      throw devError('E_DEV_IMPORT','Loader, query and fragment imports are unsupported',file);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  walk(ast);return ast;
}

// Webpack may probe installed packages, but only reads from the precise lock
// graph become snapshot inputs. Never walk or copy all of node_modules.
function lockedNpmFileSystem(root,locks,snapshot){
  const bytes=locks.rows.get(path.join(root,'package-lock.json'))?.bytes;
  const packages=bytes?JSON.parse(utf8(bytes,'package-lock.json')).packages:{};
  const paths=Object.keys(packages||{}).filter(key=>/^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:\/node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+)*$/.test(key)).sort((a,b)=>b.length-a.length);
  const checked=new Set();
  const absent=file=>Object.assign(new Error('ENOENT: dependency is outside the installed lock graph'),{code:'ENOENT',path:file});
  function owner(file){
    const rel=path.relative(root,file).split(path.sep).join('/');
    const key=paths.find(key=>rel===key||rel.startsWith(key+'/'));
    if(!key||rel.slice(key.length).split('/').includes('node_modules'))throw absent(file);
    return key;
  }
  function verifyPackage(key){
    if(checked.has(key))return;
    const entry=packages[key];let resolved;
    try{resolved=new URL(entry.resolved);}catch{}
    if(entry.link||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version||'')||
      resolved?.protocol!=='https:'||resolved.username||resolved.password||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity||''))
      throw devError('E_PROJECT_NPM_LOCK','Every consumed npm package needs an exact HTTPS/SHA-512 lock entry',key);
    const pkg=JSON.parse(utf8(snapshot.read(key+'/package.json',65536),key+'/package.json'));
    const name=key.slice(key.lastIndexOf('node_modules/')+'node_modules/'.length);
    if(pkg.name!==name||pkg.version!==entry.version)throw devError('E_PROJECT_NPM_LOCK','Installed npm package identity differs from its lock',key);
    checked.add(key);
  }
  function stat(file){
    const rel=path.relative(root,file).split(path.sep).join('/');
    if(!paths.some(key=>key===rel||key.startsWith(rel+'/'))){verifyPackage(owner(file));}
    let current=root;
    for(const part of path.relative(root,file).split(path.sep)){
      current=path.join(current,part);
      if(fs.lstatSync(current).isSymbolicLink())throw devError('E_DEV_SYMLINK','Installed dependencies cannot contain symlinks',rel);
    }
    return fs.lstatSync(file);
  }
  let error;
  const guard=fn=>file=>{try{return fn(file);}catch(cause){if(cause.code?.startsWith('E_'))error ||= cause;throw cause;}};
  return {get error(){return error;},stat:guard(stat),read:guard(file=>{const key=owner(file);verifyPackage(key);return snapshot.read(path.relative(root,file),1024*1024);})};
}
export class LocalDevResolver{
  constructor({allowedPaths=[]}={}){
    if(!Array.isArray(allowedPaths)||allowedPaths.length>8)throw devError('E_DEV_AUTH','At most eight explicitly allowed projects');
    this.allowed=new Set(allowedPaths.map(value=>fs.realpathSync(value)));
    this.bindings=new Map();this.cache=new Map();this.identities=new Map();
  }
  attach({path:requested,runtimeKind,entryFormat='async-main',siteOrigin}={}){
    if(typeof requested!=='string'||!path.isAbsolute(requested))throw devError('E_DEV_PATH','Supply an absolute project or JavaScript file path');
    const actual=fs.realpathSync(requested);
    if(!this.allowed.has(actual))throw devError('E_DEV_AUTH','This path was not authorized by --allow-project');
    const stat=fs.lstatSync(actual),single=stat.isFile();
    if(!single&&!stat.isDirectory())throw devError('E_DEV_PATH','Bind a directory or a regular JavaScript file');
    if(!single&&entryFormat!=='async-main')throw devError('E_DEV_RUNTIME','Multi-file ESM projects have an async-main entry');
    if(single&&(!/\.m?js$/.test(actual)||!validKind(runtimeKind)))throw devError('E_DEV_RUNTIME','Single-file projects require an explicit runtimeKind and .js/.mjs file');
    if(!['async-main','classic-userscript'].includes(entryFormat)||runtimeKind==='controller'&&entryFormat!=='async-main')throw devError('E_DEV_RUNTIME','Invalid entry format');
    if(single){let url;try{url=new URL(siteOrigin);}catch{}if(!url||!['http:','https:'].includes(url.protocol)||url.origin!==siteOrigin)throw devError('E_DEV_ORIGIN','Single files require an exact siteOrigin');}
    const root=single?path.dirname(actual):actual;
    const key='local-'+sha256(Buffer.from(actual)).slice(0,20);
    const identity=fs.lstatSync(root,{bigint:true});
    const binding=Object.freeze({bindingId:key,path:actual,root,single,rootIdentity:String(identity.dev)+':'+String(identity.ino),runtimeKind,entryFormat,siteOrigin});
    const previous=this.bindings.get(key);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(binding))throw devError('E_DEV_CONFLICT','Detach the existing binding before changing its runtime or scope');
    this.bindings.set(key,previous||binding);
    return {bindingId:key,name:path.basename(actual),runtimeKind:single?runtimeKind:'from-package',source:'local-files',connected:true};
  }
  get(bindingId){const row=this.bindings.get(bindingId);if(!row)throw devError('E_DEV_DETACHED','Project is not attached');return row;}
  detach(bindingId){this.get(bindingId);this.bindings.delete(bindingId);this.cache.delete(bindingId);this.identities.delete(bindingId);return {bindingId,connected:false};}
  list(){return [...this.bindings.values()].map(x=>({bindingId:x.bindingId,name:path.basename(x.path),source:'local-files'}));}
  async resolve(bindingId,{beforeVerify}={}){
    const binding=this.get(bindingId),identity=fs.lstatSync(binding.root,{bigint:true});
    if(identity.isSymbolicLink()||String(identity.dev)+':'+String(identity.ino)!==binding.rootIdentity)throw devError('E_PROJECT_CHANGED','Bound root was replaced; explicitly attach again');
    const snapshot=createSnapshot(binding.root),locks=createSnapshot(binding.root,{maxBytes:2*1024*1024+128*1024,maxFiles:2}),
      dependencies=createSnapshot(binding.root,{maxBytes:2*1024*1024,maxFiles:1024,lockedCache:true}),helpers=new Map();
    const readProjectFile=(file,limit)=>["package-lock.json",REMOTE_LOCK_FILE].includes(file)?locks.read(file,limit):
      file.startsWith(REMOTE_CACHE_DIR+'/')?dependencies.read(file,limit):snapshot.read(file,limit);let pkg,project,sourceUtf8,sourceMapUtf8=null;
    if(binding.single){
      sourceUtf8=utf8(snapshot.read(path.basename(binding.path),65536),path.basename(binding.path));
      staticOnly(sourceUtf8,path.basename(binding.path),'script',binding.runtimeKind==='controller'||binding.entryFormat==='async-main');
      const metadata=parseUserScriptDependencies(sourceUtf8);
      if(metadata.requires.length)throw devError('E_DEV_DEPENDENCY','Lock and package external dependencies through the publishing adapter; direct local files do not fetch code');
      if(binding.runtimeKind==='page-userscript')assertUserScriptExecutable(metadata,{entryFormat:binding.entryFormat,phase:'preview',dependenciesLocked:true});
      project={id:binding.bindingId,entry:path.basename(binding.path),runtimeKind:binding.runtimeKind,siteOrigins:[binding.siteOrigin]};
    }else{
      const validated=await validateProgramProject(binding.root,{readProjectFile});
      pkg=JSON.parse(utf8(snapshot.read('package.json',65536),'package.json'));project=pkg.opendesk;
      const syntax=validated.sourceFiles.map(row=>staticOnly(row.sourceUtf8,row.path));
      if(project.runtimeKind==='controller'&&validated.assets.length)throw devError('E_PROJECT_ASSET_ENV','Controller resources are unsupported');
      if(syntax.some(ast=>ast.body.some(node=>node.source?.value==='@opendesk/ui'))){
        for(const file of HELPERS)helpers.set(file,safeRead(path.dirname(UI),file,256*1024).bytes);
      }
      if(validated.remoteImports.length){
        try{locks.read(REMOTE_LOCK_FILE,128*1024);}catch(error){
          if(error.code==='E_PROJECT_FILE')throw devError('E_REMOTE_UNLOCKED','HTTPS dependencies need an existing explicit lock action before dev.run',REMOTE_LOCK_FILE);
          throw error;
        }
      }
    }
    const identityKey=JSON.stringify({id:project.id,runtimeKind:project.runtimeKind});
    if(this.identities.has(bindingId)&&this.identities.get(bindingId)!==identityKey)throw devError('E_DEV_CONFLICT','Project ID or runtime changed; explicitly detach and attach the project');
    const helperRows=[...helpers].map(([file,bytes])=>({path:path.basename(file),sha256:sha256(bytes)}));
    const manifest=()=>[...snapshot.manifest(),...locks.manifest(),...dependencies.manifest()].sort((a,b)=>a.path.localeCompare(b.path));
    const hashInputs=files=>sha256(JSON.stringify({version:VERSION,webpack:webpack.version,files,helpers:helperRows,kind:project.runtimeKind,entryFormat:binding.entryFormat}));
    const validationHash=hashInputs(manifest()),cached=this.cache.get(bindingId);
    const npm=lockedNpmFileSystem(binding.root,locks,dependencies);
    if(cached?.validationHash===validationHash){
      for(const row of cached.files){
        if(row.path.startsWith('node_modules/'))npm.read(path.join(binding.root,row.path));
        else if(row.path.startsWith(REMOTE_CACHE_DIR+'/'))dependencies.read(row.path,128*1024);
      }
    }
    let inputHash=hashInputs(manifest()),cacheHit=cached?.inputHash===inputHash;
    if(cacheHit){sourceUtf8=cached.sourceUtf8;sourceMapUtf8=cached.sourceMapUtf8;}
    else if(!binding.single){
      const output=await buildProgramProjectInMemory(binding.root,{readProjectFile,createInputFileSystem:virtual=>{
        const input=new Map([...snapshot.rows].map(([file,row])=>[file,row.bytes]));
        for(const [file,bytes] of [...helpers,...virtual])input.set(file,bytes);
        return snapshotFileSystem(input,npm);
      }}).catch(error=>{throw npm.error||error;});
      if(npm.error)throw npm.error;
      sourceUtf8=output.sourceUtf8;sourceMapUtf8=output.sourceMapUtf8;
      inputHash=hashInputs(manifest());
    }
    const files=manifest();
    const sourceBytes=Buffer.byteLength(sourceUtf8);
    if(!sourceBytes||sourceBytes>(project.runtimeKind==='controller'?65536:100000))throw devError('E_DEV_LIMIT','Compiled source exceeds the existing execution limit');
    await beforeVerify?.();snapshot.verify();locks.verify();dependencies.verify();
    for(const [file,bytes] of helpers)if(!safeRead(path.dirname(UI),file,256*1024).bytes.equals(bytes))throw devError('E_PROJECT_CHANGED','Framework UI helper changed during resolution');
    if(this.bindings.get(bindingId)!==binding)throw devError('E_DEV_DETACHED','Project was detached while resolving');
    const result=Object.freeze({bindingId,projectId:project.id,runtimeKind:project.runtimeKind,managedUI:helpers.has(UI),entry:project.entry,entryFormat:binding.entryFormat,sourceUtf8,sourceHash:sha256(sourceUtf8),sourceBytes,inputHash,validationHash,sourceMapUtf8,files:Object.freeze(files),cacheHit:!!cacheHit,capturedAt:new Date().toISOString(),
      siteOrigins:project.siteOrigins||[binding.siteOrigin].filter(Boolean),...(project.pageRules?{pageRules:project.pageRules}:{}),...(project.paramsSchema?{paramsSchema:project.paramsSchema}:{})});
    this.identities.set(bindingId,identityKey);this.cache.set(bindingId,result);return result;
  }
}
