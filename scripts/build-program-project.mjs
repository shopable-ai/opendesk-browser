// OpenDesk multi-file ESM project compiler. Local build adapter only:
// no install, no Chrome permission, no additional browser execution engine.
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath,readdir} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import webpack from 'webpack';
import {parse} from 'acorn';
import {validateProgramProject,projectError} from './validate-program-project.mjs';
import {buildAssetRecords} from './program-assets.mjs';
import {prepareRemoteModules,remoteURL} from './remote-esm-modules.mjs';
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

// Webpack 5.95 otherwise emits import("https://...") externals. Only a
// temporary mirror is rewritten: original project files and pinned cache
// remain untouched. The source validator has already checked local imports.
async function mirrorProjectSource(before,temp,aliases){
  if(!aliases.size)return null;
  const mirror=join(temp,'source');
  for(const file of before.sourceFiles){
    const target=join(mirror,file.path),ast=parse(file.sourceUtf8,
      {ecmaVersion:'latest',sourceType:'module'});
    const replacements=[];
    for(const item of ast.body){
      if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(item.type)||
        typeof item.source?.value!=='string'||!item.source.value.startsWith('https:'))continue;
      const url=remoteURL(item.source.value),cached=aliases.get(url);
      ensure(Boolean(cached),'E_REMOTE_UNLOCKED','Remote module not present in locked graph: '+url,
        {phase:'remote',location:file.path});
      let spec=relative(dirname(target),cached).split(sep).join('/');
      if(!spec.startsWith('.'))spec='./'+spec;
      replacements.push({start:item.source.start,end:item.source.end,code:JSON.stringify(spec)});
    }
    let source=file.sourceUtf8;
    for(const row of replacements.sort((a,b)=>b.start-a.start))
      source=source.slice(0,row.start)+row.code+source.slice(row.end);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,source,{flag:'wx'});
  }
  return join(mirror,before.entry);
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

async function compileWebpack(root,entry,temp,mode,{remoteAliases=new Map(),mirrorEntry}={}){
  const projectLabel=basename(root);
  const config={
    mode,
    target:['web','es2022'],
    context:root,
    entry:mirrorEntry||resolve(root,entry),
    devtool:mode==='development'?'source-map':false,
    output:{path:temp,filename:'bundle.js',library:{name:runtimeName,type:'var'},publicPath:''},
    resolve:{modules:[join(root,'node_modules')],extensions:['.js','.mjs'],symlinks:true,
      fallback:{},alias:{'@opendesk/ui$':PAGE_UI_MODULE}},
    optimization:{
      runtimeChunk:false,
      splitChunks:false,
      moduleIds:mode==='development'?'named':'deterministic',
      chunkIds:mode==='development'?'named':'deterministic',
      minimize:mode==='production'
    },
    performance:{hints:false},
    // HTTPS specifiers are rewritten into verified local files before compile.
    // Never enable webpack experiments.buildHttp or a runtime remote external.
    experiments:{outputModule:false}
  };
  const stats=await new Promise((yes,no)=>{
    webpack(config,(error,result)=>{
      if(error)return no(webpackError(root,projectLabel,null,error));
      if(!result||result.hasErrors())return no(webpackError(root,projectLabel,result));
      yes(result);
    });
  });
  await stats;
  // The only extra directory is verified, temporary *input* source for pinned
  // HTTPS modules; the webpack output contract still permits one JS artifact.
  const names=(await readdir(temp)).filter(name=>!(remoteAliases.size&&['remote','source'].includes(name))).sort();
  const allowed=mode==='development'?['bundle.js','bundle.js.map']:['bundle.js'];
  ensure(JSON.stringify(names)===JSON.stringify(allowed),'E_PROJECT_CHUNK',
    'Program build must emit exactly one JavaScript file'+
    (mode==='development'?' and one local source map':''),
    {project:projectLabel,phase:'webpack'});
  const bundle=await readFile(join(temp,'bundle.js'),'utf8');
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
  const modules=(stats.toJson({all:false,modules:true}).modules||[])
    .map(mod=>mod.nameForCondition||mod.name)
    .filter(name=>typeof name==='string'&&name.startsWith(root))
    .map(name=>name.slice(root.length+1))
    .sort();
  return {
    bundle,
    sourceMapUtf8:mode==='development'?await readFile(join(temp,'bundle.js.map'),'utf8'):null,
    modules
  };
}

function lineCount(value){
  return (value.match(/\n/g)||[]).length;
}

function stripWebpackMapComment(bundle){
  return bundle.replace(/\n?\/\/# sourceMappingURL=bundle\.js\.map\s*$/,'');
}

function shiftSourceMap(sourceMapUtf8,{lineOffset,file='program.js'}={}){
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

function pageHeader(pkg,project){
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

function programSource(pkg,project,bundle,{sourceMapFile,assets={}}={}){
  const header=project.runtimeKind==='page-userscript'?pageHeader(pkg,project):'';
  const body=sourceMapFile?stripWebpackMapComment(bundle):bundle;
  const args=project.runtimeKind==='page-userscript'?'':'{page,params,axiosx,AppStorage,AppLocal,storage}';
  const pageAssets=project.runtimeKind==='page-userscript'&&Object.keys(assets).length>0;
  const parameters=pageAssets?JSON.stringify({assets}):args;
  const code=body+'\n;\nasync function main() {\n'+
    '  const run = '+runtimeName+'.default;\n'+
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

async function collectAssets(root,assets){
  const bytesByPath=new Map();
  for(const row of assets){
    const real=await realpath(join(root,row.path));
    ensure(real.startsWith(root+sep),'E_PROJECT_SYMLINK','Asset must remain inside the project',
      {phase:'assets',location:row.path});
    const bytes=await readFile(real);
    ensure(sha(bytes)===row.sha256,'E_PROJECT_CHANGED','Asset changed after validation',
      {phase:'assets',location:row.path});
    bytesByPath.set(row.path,bytes);
  }
  return buildAssetRecords(assets,bytesByPath);
}

export async function buildProgramProject(input,{outputDirectory,mode='production',lockRemote=false,fetchImpl=globalThis.fetch}={}){
  mode=normalizeMode(mode);
  const root=await realpath(basename(input)==='package.json'?dirname(input):input);
  const projectLabel=basename(root);
  const before=await validateProgramProject(root);
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
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
    const remote=await prepareRemoteModules({root,remoteImports:before.remoteImports,temp,lockRemote,fetchImpl});
    const mirrorEntry=await mirrorProjectSource(before,temp,remote.aliases);
    const compiled=await compileWebpack(root,project.entry,temp,mode,
      {remoteAliases:remote.aliases,mirrorEntry});
    const sourceMapFile=mode==='development'?'program.js.map':undefined;
    const embeddedAssets=await collectAssets(root,before.assets);
    const sourceUtf8=programSource(pkg,project,compiled.bundle,{sourceMapFile,assets:embeddedAssets});
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
    const after=await validateProgramProject(root);
    ensure(JSON.stringify(before)===JSON.stringify(after),'E_PROJECT_CHANGED',
      'Project source changed during build',{project:projectLabel,phase:'validate'});

    const hash=sha(bytes);
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
