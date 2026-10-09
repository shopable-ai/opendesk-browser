// OpenDesk multi-file ESM project compiler. Local build adapter only:
// no install, no Chrome permission, no additional browser execution engine.
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import {parse} from 'acorn';
import {validateProgramProject,projectError} from './validate-program-project.mjs';
import {buildAssetRecords} from './program-assets.mjs';
import {prepareRemoteModules,remoteURL,REMOTE_LOCK_FILE,REMOTE_CACHE_DIR} from './remote-esm-modules.mjs';
import {snapshotFileSystem,safeRead} from '../native-agent/local-dev/snapshot.mjs';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../src/scripting/user-scripts/dependency-metadata.js';
import {compileLockedPageSource} from '../src/scripting/user-scripts/execution-source.js';
import {createTaskPackage} from '../src/platform/tasks/contract.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimeName='__opendeskProjectModule';
const VERSION='opendesk.build-artifact.v1';
const DRAFT_VERSION='opendesk.program-draft.v1';
const MODES=new Set(['production','development']);
const SOURCE_LIMIT=100000;
const AUTHORING_TOTAL_LIMIT=256000;
const AUTHORING_FILE_LIMIT=32;
const ENVELOPE_LIMIT=512000;
const require=createRequire(import.meta.url);
const PAGE_UI_MODULE=fileURLToPath(new URL('../src/scripting/user-scripts/page-ui.js',import.meta.url));
const {SourceMapConsumer,SourceMapGenerator}=require('source-map');

const fail=(code,message,details={})=>{throw projectError(code,message,details);};
const ensure=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};

function normalizeMode(mode='production'){
  ensure(MODES.has(mode),'E_PROJECT_MODE','Build mode must be production or development',
    {phase:'arguments',location:'--mode'});
  return mode;
}

function sourceLocation(root,error){
  const loc=error?.module?.resource||error?.moduleIdentifier||error?.file;
  if(!loc)return undefined;
  const rawFile=String(loc).split('|').pop();
  const file=rawFile.startsWith(root)?rawFile.slice(root.length+1):rawFile;
  const rawLoc=typeof error.loc==='string'?error.loc.match(/^(\d+):(\d+)/):null;
  const line=error.loc?.start?.line??error.loc?.line??error.line??(rawLoc?Number(rawLoc[1]):undefined);
  const column=error.loc?.start?.column??error.loc?.column??error.column??(rawLoc?Number(rawLoc[2]):undefined);
  return {file,...(line?{line}:{}),...(column?{column}:{})};
}

function webpackError(root,projectLabel,stats,error){
  if(error){
    return projectError('E_PROJECT_WEBPACK',error.message,{
      project:projectLabel,phase:'webpack',location:sourceLocation(root,error)
    });
  }
  const info=stats?.toJson({all:false,errors:true,errorDetails:false});
  const first=info?.errors?.[0];
  return projectError('E_PROJECT_WEBPACK',first?.message||'Webpack compilation failed',{
    project:projectLabel,phase:'webpack',location:sourceLocation(root,first||{})
  });
}

async function compileWebpack(root,entry,temp,mode,{remoteAliases=new Map(),virtualModules=new Map(),createInputFileSystem}={}){
  const projectLabel=basename(root);
  const remoteURLs=new Map([...remoteAliases].map(([url,file])=>[file,url]));
  const permittedRoots=new RegExp('^(?:'+[root,dirname(PAGE_UI_MODULE)].map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:/|$)').join('|')+')');
  const config={
    mode,
    target:['web','es2022'],
    context:root,
    entry:resolve(root,entry),
    cache:false,
    devtool:'source-map',
    output:{path:temp,filename:'bundle.js',library:{name:runtimeName,type:'var'},publicPath:''},
    resolve:{modules:['node_modules'],extensions:['.js','.mjs'],symlinks:!createInputFileSystem,
      fallback:{},restrictions:[permittedRoots],alias:{'@opendesk/ui$':PAGE_UI_MODULE}},
    optimization:{
      runtimeChunk:false,
      splitChunks:false,
      moduleIds:mode==='development'?'named':'deterministic',
      chunkIds:mode==='development'?'named':'deterministic',
      minimize:mode==='production',
      minimizer:[new TerserPlugin({parallel:false})]
    },
    performance:{hints:false},
    // Resolve locked HTTPS imports before Webpack's external-module hook.
    // Never enable webpack experiments.buildHttp or a runtime remote external.
    experiments:{outputModule:false},
    module:{rules:[]},
    resolveLoader:{modules:[]},
    plugins:[{apply(compiler){compiler.hooks.normalModuleFactory.tap('OpenDeskLockedImports',factory=>{factory.hooks.beforeResolve.tap('OpenDeskLockedImports',resource=>{
      if(!resource)return;
      const issuer=remoteURLs.get(resource.contextInfo?.issuer),request=resource.request;
      if(request.startsWith('https:')||issuer){
        const url=remoteURL(issuer?new URL(request,issuer).href:request),target=remoteAliases.get(url);
        ensure(target,'E_REMOTE_UNLOCKED','Remote module is not in the locked graph: '+url,{phase:'remote'});
        resource.request=target;
        for(const dependency of resource.dependencies)if(dependency.request===request)dependency.request=target;
      }else{
        ensure(!/[!?#\\]/.test(request),'E_DEV_IMPORT','Loaders, queries and fragments are unsupported',{phase:'webpack',location:request});
      }
    });});}}]
  };
  const compiler=webpack(config);
  compiler.inputFileSystem=createInputFileSystem?createInputFileSystem(virtualModules):
    snapshotFileSystem(virtualModules,{fallback:compiler.inputFileSystem});
  compiler.hooks.shouldEmit.tap('OpenDeskProgramMemory',()=>false);
  try{
  const stats=await new Promise((yes,no)=>{
    compiler.run((error,result)=>{
      if(error)return no(webpackError(root,projectLabel,null,error));
      if(!result||result.hasErrors())return no(webpackError(root,projectLabel,result));
      yes(result);
    });
  });
  const names=stats.compilation.getAssets().map(asset=>asset.name).sort();
  const allowed=['bundle.js','bundle.js.map'];
  ensure(JSON.stringify(names)===JSON.stringify(allowed),'E_PROJECT_CHUNK',
    'Program build must emit exactly one JavaScript file'+
    (mode==='development'?' and one local source map':''),
    {project:projectLabel,phase:'webpack'});
  const emitted=String(stats.compilation.getAsset('bundle.js').source.source());
  const bundle=mode==='production'?stripWebpackMapComment(emitted):emitted;
  ensure(!/\bimport\s*\(\s*['"`]https?:\/\//.test(bundle),
    'E_REMOTE_RUNTIME','Generated code still contains an external HTTP(S) import',
    {project:projectLabel,phase:'webpack',location:'bundle.js'});
  if(mode==='production'){
    ensure(!/\/\/# sourceMappingURL=/.test(bundle),'E_PROJECT_MAP',
      'Production program builds must not include Source Map links',
      {project:projectLabel,phase:'webpack',location:'bundle.js'});
  }else{
    ensure(/\/\/# sourceMappingURL=bundle\.js\.map\s*$/.test(bundle),'E_PROJECT_MAP',
      'Development builds must include a separate local source map',
      {project:projectLabel,phase:'webpack',location:'bundle.js'});
  }
  try{parse(bundle,{ecmaVersion:'latest',sourceType:'script'});}
  catch(error){
    fail('E_PROJECT_WEBPACK','Webpack output is not classic JavaScript: '+error.message,
      {project:projectLabel,phase:'webpack',
        location:{file:'bundle.js',line:error.loc?.line,column:error.loc?.column}});
  }
  // Webpack may nest real dependency modules under concatenated modules.
  // Collect both levels so npm provenance is not lost in production mode.
  const flatten=rows=>(rows||[]).flatMap(row=>[row,...flatten(row.modules)]);
  const modules=[...new Set(flatten(stats.toJson({all:false,modules:true,nestedModules:true}).modules)
    .map(mod=>mod.nameForCondition||mod.name)
    .filter(name=>typeof name==='string'&&name.startsWith(root))
    .map(name=>name.slice(root.length+1).split(sep).join('/')))].sort();
  const sourceMap=JSON.parse(String(stats.compilation.getAsset('bundle.js.map').source.source()));
  sourceMap.sources=sourceMap.sources.map(source=>{
    for(const [file,url] of remoteURLs)if(source.includes('.opendesk/remote-build/'+basename(file)))return url;
    return source;
  });
  return {
    bundle,
    entryAsync:webpackEntryIsAsync(stats.compilation),
    sourceMapUtf8:JSON.stringify(sourceMap),
    modules
  };
  }finally{await new Promise((yes,no)=>compiler.close(error=>error?no(error):yes()));}
}

function lineCount(value){
  return (value.match(/\n/g)||[]).length;
}

function stripWebpackMapComment(bundle){
  return bundle.replace(/\n?\/\/# sourceMappingURL=bundle\.js\.map\s*$/,'');
}

export function shiftSourceMap(sourceMapUtf8,{lineOffset,file='program.js'}={}){
  const input=JSON.parse(sourceMapUtf8);
  const consumer=new SourceMapConsumer(input);
  const generator=new SourceMapGenerator({file});
  consumer.eachMapping(mapping=>{
    if(mapping.source==null||mapping.originalLine==null)return;
    generator.addMapping({
      generated:{line:mapping.generatedLine+lineOffset,column:mapping.generatedColumn},
      original:{line:mapping.originalLine,column:mapping.originalColumn},
      source:mapping.source,
      ...(mapping.name?{name:mapping.name}:{})
    });
  });
  for(const source of consumer.sources){
    const content=consumer.sourceContentFor(source,true);
    if(content!=null)generator.setSourceContent(source,content);
  }
  consumer.destroy?.();
  return generator.toString();
}

export function mapProgramGeneratedPosition(sourceMapUtf8,{line,column}){
  const consumer=new SourceMapConsumer(JSON.parse(sourceMapUtf8));
  const mapped=consumer.originalPositionFor({line,column});
  consumer.destroy?.();
  return mapped;
}

export function pageHeader(pkg,project){
  const runAt={document_start:'document-start',document_end:'document-end',document_idle:'document-idle'};
  const rules=project.pageRules;
  return ['// ==UserScript==',
    '// @name '+pkg.name,
    '// @version '+pkg.version,
    ...rules.matches.map(value=>'// @match '+value),
    ...rules.excludeMatches.map(value=>'// @exclude-match '+value),
    '// @run-at '+runAt[rules.runAt],
    ...(!rules.allFrames?['// @noframes']:[]),
    '// ==/UserScript==',''].join('\n');
}

export function webpackEntryIsAsync(compilation){
  const entries=[...compilation.entries.values()];
  ensure(entries.length===1&&entries[0].dependencies.length===1,'E_PROJECT_ENTRY','Expected one Webpack program entry',{phase:'webpack'});
  const module=compilation.moduleGraph.getModule(entries[0].dependencies[0]);
  ensure(module,'E_PROJECT_ENTRY','Webpack entry is unavailable',{phase:'webpack'});
  return compilation.moduleGraph.isAsync(module);
}
export function programSource(pkg,project,bundle,{sourceMapFile,assets={},entryAsync=false}={}){
  const header=project.runtimeKind==='page-userscript'?pageHeader(pkg,project):'';
  const body=sourceMapFile?stripWebpackMapComment(bundle):bundle;
  const args=project.runtimeKind==='page-userscript'?'':'{page,params,axiosx,AppStorage,AppLocal,storage}';
  const pageAssets=project.runtimeKind==='page-userscript'&&Object.keys(assets).length>0;
  const parameters=pageAssets?JSON.stringify({assets}):args;
  const code=body+'\n;\nasync function main() {\n'+
    '  const run = '+(entryAsync?'(await '+runtimeName+')':runtimeName)+'.default;\n'+
    "  if (typeof run !== 'function') throw new Error('E_PROJECT_ENTRY: default export must be a function');\n"+
    '  return await run('+parameters+');\n}\n'+
    (sourceMapFile?'//# sourceMappingURL='+sourceMapFile+'\n':'');
  return header+code;
}

async function immutableWrite(path,contents){
  const bytes=Buffer.from(contents);
  try{
    const existing=await readFile(path);
    ensure(existing.equals(bytes),'E_BUILD_IMMUTABLE','Existing build output differs: '+basename(path),
      {phase:'write',location:path});
    return;
  }catch(error){
    if(error.code!=='ENOENT')throw error;
  }
  try{
    await writeFile(path,bytes,{flag:'wx'});
  }catch(error){
    if(error.code!=='EEXIST')throw error;
    const existing=await readFile(path);
    ensure(existing.equals(bytes),'E_BUILD_IMMUTABLE','Concurrent build output differs: '+basename(path),
      {phase:'write',location:path});
  }
}

async function npmLockHash(root){
  try{return sha(await readFile(join(root,'package-lock.json')));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}

function draftEnvelope({pkg,project,before,sourceUtf8,sourceHash,mode}){
  const files=before.sourceFiles.map(({path,sourceUtf8,sha256})=>({path,sourceUtf8,sha256}));
  const byteLength=Buffer.byteLength(sourceUtf8,'utf8');
  ensure(byteLength<=SOURCE_LIMIT,'E_PROJECT_DRAFT_LIMIT','Draft runtime source exceeds UI import limit',
    {project:project.id,phase:'draft',location:'program.js'});
  ensure(files.length<=AUTHORING_FILE_LIMIT,'E_PROJECT_DRAFT_LIMIT','Draft authoring file count exceeds UI import limit',
    {project:project.id,phase:'draft'});
  const total=files.reduce((sum,file)=>sum+Buffer.byteLength(file.sourceUtf8,'utf8'),0);
  ensure(total<=AUTHORING_TOTAL_LIMIT,'E_PROJECT_DRAFT_LIMIT','Draft authoring source exceeds UI import limit',
    {project:project.id,phase:'draft'});
  const draft={
    format:DRAFT_VERSION,
    project:{id:project.id,version:pkg.version,entry:project.entry},
    runtimeKind:project.runtimeKind,
    build:{mode,sourceHash,byteLength},
    sourceUtf8,
    authoring:{files}
  };
  const bytes=Buffer.byteLength(JSON.stringify(draft,null,2)+'\n','utf8');
  ensure(bytes<=ENVELOPE_LIMIT,'E_PROJECT_DRAFT_LIMIT','Draft envelope exceeds UI import limit',
    {project:project.id,phase:'draft'});
  return draft;
}

function publicAuthoring(before,webpackModules,mode,hash){
  return {
    files:before.sources,
    ...(before.assets.length?{assets:before.assets}:{}),
    webpackModules,
    buildMode:mode,
    buildHash:hash
  };
}

async function collectAssets(root,assets,readProjectFile){
  const bytesByPath=new Map();
  for(const row of assets){
    const real=readProjectFile?join(root,row.path):await realpath(join(root,row.path));
    ensure(real.startsWith(root+sep),'E_PROJECT_SYMLINK','Asset must remain inside the project',
      {phase:'assets',location:row.path});
    const bytes=readProjectFile?await readProjectFile(row.path,65536):await readFile(real);
    ensure(sha(bytes)===row.sha256,'E_PROJECT_CHANGED','Asset changed after validation',
      {phase:'assets',location:row.path});
    bytesByPath.set(row.path,bytes);
  }
  return buildAssetRecords(assets,bytesByPath);
}

// The Local Dev adapter returns these canonical build bytes without publishing
// artifacts. It supplies a bounded snapshot reader and compiler filesystem.
export async function buildProgramProjectInMemory(input,options={}){
  ensure(!options.lockRemote,'E_REMOTE_ACTION','Generating a network lock requires an independent explicit build action',{phase:'arguments'});
  return buildProgramProject(input,{...options,lockRemote:false,memoryOnly:true});
}

export async function buildProgramProject(input,{outputDirectory,mode='production',lockRemote=false,fetchImpl,readProjectFile,createInputFileSystem,memoryOnly=false}={}){
  mode=normalizeMode(mode);
  const root=await realpath(basename(input)==='package.json'?dirname(input):input);
  const projectLabel=basename(root);
  const before=await validateProgramProject(root,{readProjectFile});
  const pkg=JSON.parse(readProjectFile?await readProjectFile('package.json',65536):await readFile(join(root,'package.json'),'utf8'));
  const project=pkg.opendesk;
  ensure(before.id===project.id&&before.version===pkg.version&&before.entry===project.entry&&
    before.runtimeKind===project.runtimeKind,'E_PROJECT_CHANGED','Project identity changed after validation',
    {project:projectLabel,phase:'validate',location:'package.json'});
  ensure(project.runtimeKind==='page-userscript'||before.assets.length===0,
    'E_PROJECT_ASSET_ENV','R1 bundled assets are supported only in Page USER_SCRIPT projects',
    {project:projectLabel,phase:'build',location:'package.json#opendesk.assets'});
  if(project.runtimeKind==='controller'){
    ensure(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version),
      'E_PROJECT_VERSION','Controller Task v1 Candidate requires a stable SemVer version',
      {project:projectLabel,phase:'build',location:'package.json#version'});
  }

  const temp=await mkdtemp(join(tmpdir(),'opendesk-build-program-'));
  try{
    if(readProjectFile&&before.remoteImports.length){
      try{await readProjectFile(REMOTE_LOCK_FILE,128*1024);}catch(error){if(error.code!=='E_PROJECT_FILE')throw error;}
    }
    const remote=await prepareRemoteModules({root,remoteImports:before.remoteImports,temp,lockRemote,fetchImpl});
    // Stable virtual module IDs keep canonical hashes independent of temp paths.
    // Feed original locked bytes to Webpack: resolving imports must not rewrite
    // authoring text or shift original source-map columns.
    const remoteAliases=new Map(),virtualModules=new Map();
    for(const row of remote.modules){
      const file=join(REMOTE_CACHE_DIR,row.sha256+'.mjs');
      const bytes=readProjectFile?await readProjectFile(file,128*1024):safeRead(root,join(root,file),128*1024,{lockedCache:true}).bytes;
      ensure(bytes.length===row.bytes&&sha(bytes)===row.sha256,'E_REMOTE_HASH','Pinned module changed during compilation: '+row.url,{phase:'remote',location:file});
      const virtual=join(root,'.opendesk','remote-build',sha(row.url)+'.mjs');
      remoteAliases.set(row.url,virtual);virtualModules.set(virtual,bytes);
    }
    const compiled=await compileWebpack(root,project.entry,temp,mode,
      {remoteAliases,virtualModules,createInputFileSystem});
    const sourceMapFile=mode==='development'?'program.js.map':undefined;
    const embeddedAssets=await collectAssets(root,before.assets,readProjectFile);
    const sourceUtf8=programSource(pkg,project,compiled.bundle,{sourceMapFile,assets:embeddedAssets,entryAsync:compiled.entryAsync});
    const bytes=Buffer.from(sourceUtf8,'utf8');
    const limit=project.runtimeKind==='page-userscript'?SOURCE_LIMIT:65536;
    ensure(bytes.length>0&&bytes.length<=limit,'E_PROJECT_OUTPUT_LIMIT',
      'Program build output exceeds the current execution chain limit',
      {project:projectLabel,phase:'build',location:'program.js'});
    try{parse(sourceUtf8,{ecmaVersion:'latest',sourceType:'script'});}
    catch(error){
      fail('E_PROJECT_BUILD','Final program.js is not valid JavaScript: '+error.message,
        {project:projectLabel,phase:'build',
          location:{file:'program.js',line:error.loc?.line,column:error.loc?.column}});
    }
    if(project.runtimeKind==='page-userscript'){
      const parsed=parseUserScriptDependencies(sourceUtf8);
      const admission=assertUserScriptExecutable(parsed,{entryFormat:'async-main',phase:'preview',dependenciesLocked:true});
      ensure(parsed.requires.length===0&&JSON.stringify(admission.nativeOptions)===JSON.stringify(project.pageRules),
        'E_PROJECT_RULES','Compiled page rules differ from the source project declaration',
        {project:projectLabel,phase:'build',location:'program.js'});
      await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',entries:[]});
    }
    const after=await validateProgramProject(root,{readProjectFile});
    ensure(JSON.stringify(before)===JSON.stringify(after),'E_PROJECT_CHANGED',
      'Project source changed during build',{project:projectLabel,phase:'validate'});

    const hash=sha(bytes);
    const header=project.runtimeKind==='page-userscript'?pageHeader(pkg,project):'';
    const sourceMapUtf8=shiftSourceMap(compiled.sourceMapUtf8,{lineOffset:lineCount(header),file:'program.js'});
    if(memoryOnly)return Object.freeze({pkg,project,before,sourceUtf8,sourceHash:hash,sourceBytes:bytes.length,sourceMapUtf8,modules:compiled.modules,remoteModules:remote.modules});
    const authoringHash=sha(Buffer.from(JSON.stringify({sources:before.sources,mode,npmLockSha256:await npmLockHash(root),
      ...(before.assets.length?{assets:before.assets}:{}),remoteModules:remote.modules})));
    const out=resolve(outputDirectory||join(process.cwd(),
      'artifacts','programs',project.id,pkg.version,'r31-'+mode,hash.slice(0,16)+'-'+authoringHash.slice(0,12)));
    const draft=draftEnvelope({pkg,project,before,sourceUtf8,sourceHash:hash,mode});
    const artifact={
      format:VERSION,
      status:'BUILT_UNVERIFIED',
      installable:false,
      runtimeKind:project.runtimeKind,
      programId:project.id,
      version:pkg.version,
      sourceFormat:'esm',
      entryFormat:'async-main',
      entry:project.entry,
      buildMode:mode,
      buildHash:hash,
      sourceModules:before.sources,
      sourceFiles:before.sources,
      ...(before.assets.length?{assets:before.assets}:{}),
      npmPackages:before.npmPackages,
      // npm lock provenance is distinct from actual Webpack module inclusion.
      // A tree-shaken unused import may have zero emitted modules; never claim
      // it was bundled merely because package.json declared it.
      npmDependencies:before.npmDependencies,
      npmBundledModules:compiled.modules.filter(path=>path.startsWith('node_modules/')),
      ...(remote.modules.length?{remoteModules:remote.modules}:{}),
      npmLockSha256:await npmLockHash(root),
      sourceFile:'program.js',
      sourceHash:hash,
      sourceBytes:bytes.length,
      draftFile:'program.opendesk-draft.json',
      authoring:publicAuthoring(before,compiled.modules,mode,hash),
      ...(sourceMapFile?{sourceMapFile}:{}),
      ...(project.runtimeKind==='page-userscript'?{pageRules:project.pageRules}:
        {siteOrigins:project.siteOrigins,permissions:project.permissions,candidateFile:'program.opendesk-task.json'}),
      note:'Fixed build bytes only. Not Chrome verified, Available, Installed or automatically permitted.'
    };
    let taskPackage=null;
    if(project.runtimeKind==='controller'){
      const manifest={
        format:'opendesk.task.v1',
        taskId:project.id,
        version:pkg.version,
        title:project.id,
        description:pkg.description,
        author:typeof pkg.author==='string'?pkg.author:'local-developer',
        source:'local-esm-build',
        siteOrigins:project.siteOrigins,
        permissions:project.permissions,
        entryFormat:'async-main',
        program:{revision:1,sourceHash:hash},
        paramsSchema:project.paramsSchema
      };
      taskPackage=await createTaskPackage(manifest,sourceUtf8);
    }
    await mkdir(out,{recursive:true});
    await immutableWrite(join(out,'program.js'),sourceUtf8);
    if(sourceMapFile&&compiled.sourceMapUtf8){
      const header=project.runtimeKind==='page-userscript'?pageHeader(pkg,project):'';
      const shifted=shiftSourceMap(compiled.sourceMapUtf8,{lineOffset:lineCount(header),file:'program.js'});
      await immutableWrite(join(out,sourceMapFile),JSON.stringify(JSON.parse(shifted),null,2)+'\n');
    }
    if(taskPackage)await immutableWrite(join(out,'program.opendesk-task.json'),JSON.stringify(taskPackage,null,2)+'\n');
    await immutableWrite(join(out,'program.opendesk-draft.json'),JSON.stringify(draft,null,2)+'\n');
    await immutableWrite(join(out,'artifact.json'),JSON.stringify(artifact,null,2)+'\n');
    return Object.freeze({...artifact,outputDirectory:out});
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
}

function parseArgs(argv){
  const options={};
  let project=null;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--out')options.outputDirectory=argv[++i];
    else if(arg==='--mode')options.mode=argv[++i];
    else if(arg==='--development')options.mode='development';
    else if(arg==='--production')options.mode='production';
    else if(arg==='--lock-remote')options.lockRemote=true;
    else if(!project)project=arg;
    else fail('E_PROJECT_ARGS','Usage: scripts/build-program-project.mjs [--mode production|development] [--lock-remote] [--out dir] [project]',
      {phase:'arguments'});
  }
  return {project:project||'examples/programs/page-heading',options};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let parsed;
  try{parsed=parseArgs(process.argv.slice(2));}
  catch(error){
    process.stderr.write((error.code||'E_PROJECT_ARGS')+': '+error.message+'\n');
    process.exitCode=2;
  }
  if(parsed){
    buildProgramProject(parsed.project,parsed.options).then(value=>
      process.stdout.write(JSON.stringify(value,null,2)+'\n')).catch(error=>{
        process.stderr.write(JSON.stringify({
          code:error.code||'E_PROJECT_BUILD',
          message:error.message,
          ...(error.project?{project:error.project}:{}),
          ...(error.phase?{phase:error.phase}:{}),
          ...(error.location?{location:error.location}:{})
        })+'\n');
        process.exitCode=1;
      });
  }
}
