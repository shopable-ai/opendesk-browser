// OpenDesk multi-file ESM project compiler. Local build adapter only:
// no install, no Chrome permission, no additional browser execution engine.
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import webpack from 'webpack';
import {parse} from 'acorn';
import {validateProgramProject} from './validate-program-project.mjs';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../src/scripting/user-scripts/dependency-metadata.js';
import {compileLockedPageSource} from '../src/scripting/user-scripts/execution-source.js';
import {createTaskPackage} from '../src/platform/tasks/contract.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const ensure=(ok,code,message)=>{if(!ok)fail(code,message);};
const runtimeName='__opendeskProjectModule';
const VERSION='opendesk.build-artifact.v1';

// Never load arbitrary project Webpack config or plugins, and never run npm
// install hooks or download modules during the build.
async function compileWebpack(root,entry,temp){
  const config={
    mode:'production',target:['web','es2022'],context:root,entry:resolve(root,entry),devtool:false,
    output:{path:temp,filename:'bundle.js',library:{name:runtimeName,type:'var'},publicPath:''},
    resolve:{modules:[join(root,'node_modules')],extensions:['.js','.mjs'],symlinks:true,fallback:{}},
    optimization:{runtimeChunk:false,splitChunks:false,moduleIds:'deterministic',chunkIds:'deterministic',minimize:true},
    performance:{hints:false},experiments:{outputModule:false}
  };
  const stats=await new Promise((yes,no)=>{
    webpack(config,(error,result)=>{
      if(error)return no(error);
      if(!result||result.hasErrors())return no(Object.assign(new Error(
        result?.toString({all:false,errors:true})||'Webpack compilation failed'),{code:'E_PROJECT_BUILD'}));
      yes(result);
    });
  });
  const assets=stats.toJson({all:false,assets:true}).assets||[];
  ensure(assets.length===1&&assets[0].name==='bundle.js','E_PROJECT_CHUNK',
    '发现未经批准的分片/额外资源；程序必须编译为一个本地 classic JavaScript');
  const bundle=await readFile(join(temp,'bundle.js'),'utf8');
  ensure(!/\/\/# sourceMappingURL=/.test(bundle),'E_PROJECT_MAP','不得带需要联网的 Source Map');
  try{parse(bundle,{ecmaVersion:'latest',sourceType:'script'});}
  catch(error){fail('E_PROJECT_BUILD','Webpack 输出不是 classic JavaScript：'+error.message);}
  return bundle;
}
function pageHeader(pkg,project){
  const runAt={document_start:'document-start',document_end:'document-end',document_idle:'document-idle'};
  const rules=project.pageRules;
  return ['// ==UserScript==','// @name '+pkg.name,'// @version '+pkg.version,
    ...rules.matches.map(value=>'// @match '+value),
    ...rules.excludeMatches.map(value=>'// @exclude-match '+value),
    '// @run-at '+runAt[rules.runAt],
    ...(!rules.allFrames?['// @noframes']:[]),'// ==/UserScript==',''].join('\n');
}
function makeSource(bundle,pkg,project){
  const args=project.runtimeKind==='page-userscript'?'':'{page,params,axiosx,AppStorage,AppLocal,storage}';
  const code=bundle+'\n;\nasync function main() {\n' +
    '  const run = '+runtimeName+'.default;\n'+
    "  if (typeof run !== 'function') throw new Error('E_PROJECT_ENTRY: default export must be a function');\n"+
    '  return await run('+args+');\n}\n';
  return project.runtimeKind==='page-userscript'?pageHeader(pkg,project)+code:code;
}
async function immutableWrite(path,contents){
  const bytes=Buffer.from(contents);
  try {
    const existing=await readFile(path);
    ensure(existing.equals(bytes),'E_BUILD_IMMUTABLE','同路径构建结果不同：'+basename(path));
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    try{await writeFile(path,bytes,{flag:'wx'});}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const existing=await readFile(path);
      ensure(existing.equals(bytes),'E_BUILD_IMMUTABLE','并发构建同路径结果不同：'+basename(path));
    }
  }
}
async function npmLockHash(root) {
  try{return sha(await readFile(join(root,'package-lock.json')));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function buildProgramProject(input,{outputDirectory}={}) {
  const before=await validateProgramProject(input);
  const root=await realpath(basename(input)==='package.json'?dirname(input):input);
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),project=pkg.opendesk;
  ensure(before.id===project.id&&before.version===pkg.version&&before.entry===project.entry&&
    before.runtimeKind===project.runtimeKind,'E_PROJECT_CHANGED','检查后项目身份发生变化');
  ensure(before.assets.length===0,'E_PROJECT_ASSET_BUILD',
    '当前 JS Bundle 尚未支持资源注入；请移除未接线的 CSS/JSON/图片源资产');
  if(project.runtimeKind==='controller')ensure(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version),
    'E_PROJECT_VERSION','现有 Controller Task v1 不支持预发布版本');
  const temp=await mkdtemp(join(tmpdir(),'opendesk-build-program-'));
  try {
    const bundle=await compileWebpack(root,project.entry,temp);
    const sourceUtf8=makeSource(bundle,pkg,project);
    const bytes=Buffer.from(sourceUtf8,'utf8');
    // Keep generated Page artifacts within the Sidebar's existing 100 KB .js import admission.
    const limit=project.runtimeKind==='page-userscript'?100000:65536;
    ensure(bytes.length>0&&bytes.length<=limit,'E_PROJECT_OUTPUT_LIMIT','程序构建产物超出当前执行链上限');
    try{parse(sourceUtf8,{ecmaVersion:'latest',sourceType:'script'});}
    catch(error){fail('E_PROJECT_BUILD','最终代码不是合法 classic JavaScript：'+error.message);}
    if(project.runtimeKind==='page-userscript'){
      const parsed=parseUserScriptDependencies(sourceUtf8);
      const admission=assertUserScriptExecutable(parsed,{entryFormat:'async-main',phase:'preview',dependenciesLocked:true});
      ensure(parsed.requires.length===0&&JSON.stringify(admission.nativeOptions)===JSON.stringify(project.pageRules),
        'E_PROJECT_RULES','编译脚本的网站匹配/执行范围与源项目声明不一致');
      await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',entries:[]});
    }
    const after=await validateProgramProject(input);
    ensure(JSON.stringify(before)===JSON.stringify(after),'E_PROJECT_CHANGED',
      '构建时源码或项目声明发生变化；拒绝冻结竞态产物');
    const hash=sha(bytes),out=resolve(outputDirectory||join(process.cwd(),
      'artifacts','programs',project.id,pkg.version,hash.slice(0,16)));
    const artifact={
      format:VERSION,status:'BUILT_UNVERIFIED',installable:false,
      runtimeKind:project.runtimeKind,programId:project.id,version:pkg.version,
      sourceFormat:'esm',entryFormat:'async-main',entry:project.entry,
      sourceModules:before.sources,npmPackages:before.npmPackages,npmLockSha256:await npmLockHash(root),
      sourceFile:'program.js',sourceHash:hash,sourceBytes:bytes.length,
      ...(project.runtimeKind==='page-userscript'?{pageRules:project.pageRules}:
        {siteOrigins:project.siteOrigins,permissions:project.permissions,candidateFile:'program.opendesk-task.json'}),
      note:'Fixed build bytes only. Not Chrome verified, Available, Installed or automatically permitted.'
    };
    let taskPackage=null;
    if(project.runtimeKind==='controller') {
      const manifest={format:'opendesk.task.v1',taskId:project.id,version:pkg.version,
        title:project.id,description:pkg.description,
        author:typeof pkg.author==='string'?pkg.author:'local-developer',
        source:'local-esm-build',siteOrigins:project.siteOrigins,permissions:project.permissions,
        entryFormat:'async-main',program:{revision:1,sourceHash:hash},paramsSchema:project.paramsSchema};
      taskPackage=await createTaskPackage(manifest,sourceUtf8);
    }
    await mkdir(out,{recursive:true});
    await immutableWrite(join(out,'program.js'),sourceUtf8);
    if(taskPackage)await immutableWrite(join(out,'program.opendesk-task.json'),JSON.stringify(taskPackage,null,2)+'\n');
    await immutableWrite(join(out,'artifact.json'),JSON.stringify(artifact,null,2)+'\n');
    return Object.freeze({...artifact,outputDirectory:out});
  } finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),project=args[0]||'examples/programs/page-heading';
  if(args.length>3||args.length===2||args.length>=2&&args[1]!=='--out') {
    process.stderr.write('Usage: node scripts/build-program-project.mjs <directory> [--out <directory>]\n');
    process.exitCode=2;
  } else buildProgramProject(project,{...(args[2]?{outputDirectory:args[2]}:{})}).then(value=>
    process.stdout.write(JSON.stringify(value,null,2)+'\n')).catch(error=>{
    process.stderr.write((error.code||'E_PROJECT_BUILD')+': '+error.message+'\n');process.exitCode=1;
  });
}
