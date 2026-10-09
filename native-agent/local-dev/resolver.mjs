import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import {parse} from 'acorn';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {programSource,pageHeader,shiftSourceMap} from '../../scripts/build-program-project.mjs';
import {buildAssetRecords} from '../../scripts/program-assets.mjs';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {createSnapshot,snapshotFileSystem,safeRead,sha256,devError} from './snapshot.mjs';

const VERSION='opendesk.local-dev-resolver.v1';
const UI=fileURLToPath(new URL('../../src/scripting/user-scripts/page-ui.js',import.meta.url));
const UI_MOUNT=fileURLToPath(new URL('../../src/scripting/user-scripts/page-ui-mount.js',import.meta.url));
const HELPERS=[UI,UI_MOUNT];
const validKind=kind=>['controller','page-userscript'].includes(kind);
const utf8=(bytes,file)=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw devError('E_PROJECT_ENCODING','Source must be UTF-8',file);}};
function staticOnly(source,file,type='module'){
  let ast;
  const offset=type==='script'?1:0;
  try{ast=parse(offset?'async function __opendesk_syntax_check__(){\n'+source+'\n}':source,{ecmaVersion:'latest',sourceType:type,locations:true});}
  catch(error){throw devError('E_PROJECT_SYNTAX',error.message,{file,line:Math.max(1,error.loc.line-offset),column:error.loc.column});}
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression'||node.type==='MetaProperty'||
      node.type==='NewExpression'&&['Function','AsyncFunction'].includes(node.callee?.name)||
      node.type==='CallExpression'&&(['eval','require','Function'].includes(node.callee?.name)||node.callee?.object?.name==='require'))
      throw devError('E_DEV_DYNAMIC_CODE','Only static browser JavaScript is supported; no dynamic imports, loaders or runtime code generation',{file,line:node.loc?.start.line-offset,column:node.loc?.start.column});
    if(node.source?.value&&typeof node.source.value==='string'&&/[!?#\\]/.test(node.source.value))
      throw devError('E_DEV_IMPORT','Loader, query and fragment imports are unsupported',file);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  walk(ast);return ast;
}
async function compile(snapshot,entry,helpers){
  const input=new Map([...snapshot.rows].map(([file,row])=>[file,row.bytes]));
  for(const [file,bytes] of helpers)input.set(file,bytes);
  const compiler=webpack({mode:'production',context:snapshot.root,target:['web','es2022'],entry:path.join(snapshot.root,entry),cache:false,
    devtool:'source-map',output:{path:path.join(snapshot.root,'__opendesk_memory_only__'),filename:'bundle.js',library:{name:'__opendeskProjectModule',type:'var'},publicPath:''},
    resolve:{modules:[],extensions:['.js','.mjs'],symlinks:false,alias:{'@opendesk/ui$':UI}},
    module:{rules:[]},optimization:{runtimeChunk:false,splitChunks:false,moduleIds:'deterministic',chunkIds:'deterministic',minimize:true,minimizer:[new TerserPlugin({parallel:false,extractComments:false})]},
    performance:{hints:false},experiments:{outputModule:false}});
  compiler.inputFileSystem=snapshotFileSystem(input);
  compiler.hooks.shouldEmit.tap('OpenDeskLocalDevMemory',()=>false);
  try{
    const stats=await new Promise((resolve,reject)=>compiler.run((error,result)=>error?reject(error):resolve(result)));
    if(stats.hasErrors()){
      const error=stats.toJson({all:false,errors:true}).errors[0];
      throw devError('E_PROJECT_WEBPACK',error.message,{file:error.moduleName||entry,generated:error.loc});
    }
    const assets=stats.compilation.getAssets();
    if(assets.some(asset=>!['bundle.js','bundle.js.map'].includes(asset.name))||!stats.compilation.getAsset('bundle.js'))
      throw devError('E_PROJECT_CHUNK','Local development must produce one in-memory JavaScript program');
    return {bundle:String(stats.compilation.getAsset('bundle.js').source.source()).replace(/\n?\/\/# sourceMappingURL=bundle\.js\.map\s*$/,''),
      sourceMap:String(stats.compilation.getAsset('bundle.js.map').source.source())};
  }finally{await new Promise((resolve,reject)=>compiler.close(error=>error?reject(error):resolve()));}
}

export class LocalDevResolver{
  constructor({allowedPaths=[]}={}){
    if(!Array.isArray(allowedPaths)||allowedPaths.length>8)throw devError('E_DEV_AUTH','At most eight explicitly allowed projects');
    this.allowed=new Set(allowedPaths.map(value=>fs.realpathSync(value)));
    this.bindings=new Map();this.cache=new Map();
  }
  attach({path:requested,runtimeKind,entryFormat='async-main',siteOrigin}={}){
    if(typeof requested!=='string'||!path.isAbsolute(requested))throw devError('E_DEV_PATH','Supply an absolute project or JavaScript file path');
    const actual=fs.realpathSync(requested);
    if(!this.allowed.has(actual))throw devError('E_DEV_AUTH','This path was not authorized by --allow-project');
    const stat=fs.lstatSync(actual),single=stat.isFile();
    if(!single&&!stat.isDirectory())throw devError('E_DEV_PATH','Bind a directory or a regular JavaScript file');
    if(single&&(!/\.m?js$/.test(actual)||!validKind(runtimeKind)))throw devError('E_DEV_RUNTIME','Single-file projects require an explicit runtimeKind and .js/.mjs file');
    if(!['async-main','classic-userscript'].includes(entryFormat)||runtimeKind==='controller'&&entryFormat!=='async-main')throw devError('E_DEV_RUNTIME','Invalid entry format');
    if(single){let url;try{url=new URL(siteOrigin);}catch{}if(!url||!['http:','https:'].includes(url.protocol)||url.origin!==siteOrigin)throw devError('E_DEV_ORIGIN','Single files require an exact siteOrigin');}
    const root=single?path.dirname(actual):actual;
    const key='local-'+sha256(Buffer.from(actual)).slice(0,20);
    const identity=fs.lstatSync(root,{bigint:true});
    const binding=Object.freeze({bindingId:key,path:actual,root,single,rootIdentity:String(identity.dev)+':'+String(identity.ino),runtimeKind,entryFormat,siteOrigin});
    const previous=this.bindings.get(key);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(binding))throw devError('E_DEV_CONFLICT','Detach the existing binding before changing its runtime or scope');
    this.bindings.set(key,binding);
    return {bindingId:key,name:path.basename(actual),runtimeKind:single?runtimeKind:'from-package',source:'local-files',connected:true};
  }
  get(bindingId){const row=this.bindings.get(bindingId);if(!row)throw devError('E_DEV_DETACHED','Project is not attached');return row;}
  detach(bindingId){this.get(bindingId);this.bindings.delete(bindingId);this.cache.delete(bindingId);return {bindingId,connected:false};}
  list(){return [...this.bindings.values()].map(x=>({bindingId:x.bindingId,name:path.basename(x.path),source:'local-files'}));}
  async resolve(bindingId,{beforeVerify}={}){
    const binding=this.get(bindingId),identity=fs.lstatSync(binding.root,{bigint:true});
    if(identity.isSymbolicLink()||String(identity.dev)+':'+String(identity.ino)!==binding.rootIdentity)throw devError('E_PROJECT_CHANGED','Bound root was replaced; explicitly attach again');
    const snapshot=createSnapshot(binding.root),helpers=new Map();let pkg,project,sourceUtf8,sourceMapUtf8=null;
    if(binding.single){
      sourceUtf8=utf8(snapshot.read(path.basename(binding.path),65536),path.basename(binding.path));
      staticOnly(sourceUtf8,path.basename(binding.path),'script');
      const metadata=parseUserScriptDependencies(sourceUtf8);
      if(metadata.requires.length)throw devError('E_DEV_DEPENDENCY','Lock and package external dependencies through the publishing adapter; direct local files do not fetch code');
      if(binding.runtimeKind==='page-userscript')assertUserScriptExecutable(metadata,{entryFormat:binding.entryFormat,phase:'preview',dependenciesLocked:true});
      project={id:binding.bindingId,entry:path.basename(binding.path),runtimeKind:binding.runtimeKind,siteOrigins:[binding.siteOrigin]};
    }else{
      const validated=await validateProgramProject(binding.root,{readProjectFile:(file,limit)=>snapshot.read(file,limit)});
      pkg=JSON.parse(utf8(snapshot.read('package.json',65536),'package.json'));project=pkg.opendesk;
      if(validated.npmPackages.length||validated.remoteImports.length)throw devError('E_DEV_DEPENDENCY','Local Dev v1 accepts static relative ESM and @opendesk/ui; npm and HTTPS imports still use the locked publishing adapter');
      for(const row of validated.sourceFiles)staticOnly(row.sourceUtf8,row.path);
      if(project.runtimeKind==='controller'&&validated.assets.length)throw devError('E_PROJECT_ASSET_ENV','Controller resources are unsupported');
      if(validated.sourceFiles.some(row=>row.sourceUtf8.includes('@opendesk/ui'))){
        for(const file of HELPERS)helpers.set(file,safeRead(path.dirname(UI),file,256*1024).bytes);
      }
      const assets=buildAssetRecords(validated.assets,new Map(validated.assets.map(row=>[row.path,snapshot.read(row.path,65536)])));
      project={...project,embeddedAssets:assets};
    }
    const files=snapshot.manifest(),helperRows=[...helpers].map(([file,bytes])=>({path:path.basename(file),sha256:sha256(bytes)}));
    const inputHash=sha256(JSON.stringify({version:VERSION,webpack:webpack.version,files,helpers:helperRows,kind:project.runtimeKind,entryFormat:binding.entryFormat}));
    const cached=this.cache.get(bindingId),cacheHit=cached?.inputHash===inputHash;
    if(cacheHit){sourceUtf8=cached.sourceUtf8;sourceMapUtf8=cached.sourceMapUtf8;}
    else if(!binding.single){
      const output=await compile(snapshot,project.entry,helpers);
      sourceUtf8=programSource(pkg,project,output.bundle,{assets:project.embeddedAssets});
      const header=project.runtimeKind==='page-userscript'?pageHeader(pkg,project):'';
      sourceMapUtf8=shiftSourceMap(output.sourceMap,{lineOffset:(header.match(/\n/g)||[]).length,file:'local-dev-program.js'});
    }
    const sourceBytes=Buffer.byteLength(sourceUtf8);
    if(!sourceBytes||sourceBytes>(project.runtimeKind==='controller'?65536:100000))throw devError('E_DEV_LIMIT','Compiled source exceeds the existing execution limit');
    await beforeVerify?.();snapshot.verify();
    for(const [file,bytes] of helpers)if(!safeRead(path.dirname(UI),file,256*1024).bytes.equals(bytes))throw devError('E_PROJECT_CHANGED','Framework UI helper changed during resolution');
    if(this.bindings.get(bindingId)!==binding)throw devError('E_DEV_DETACHED','Project was detached while resolving');
    const result=Object.freeze({bindingId,projectId:project.id,runtimeKind:project.runtimeKind,entry:project.entry,entryFormat:binding.entryFormat,sourceUtf8,sourceHash:sha256(sourceUtf8),sourceBytes,inputHash,sourceMapUtf8,files:Object.freeze(files),cacheHit:!!cacheHit,capturedAt:new Date().toISOString(),
      siteOrigins:project.siteOrigins||[binding.siteOrigin].filter(Boolean),...(project.pageRules?{pageRules:project.pageRules}:{}),...(project.paramsSchema?{paramsSchema:project.paramsSchema}:{})});
    this.cache.set(bindingId,result);return result;
  }
}
