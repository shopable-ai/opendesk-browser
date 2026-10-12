#!/usr/bin/env node
// Build a self-contained source graph for @shopable/opendesk-dev WITHOUT
// changing or publishing the private extension root package. npm pack operates
// exclusively on this generated, reviewable .runtime/ staging directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parse} from 'acorn';
import {contentInventory,createBuildInfo,digest} from '../native-agent/local-dev/cli-identity.mjs';
import {lockedRuntimeDependencies,createCliShrinkwrap} from './dev-package-dependencies.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--out'||!path.isAbsolute(args[1])))
  throw new Error('E_PACKAGE_ARGS: use --out /absolute/new/directory');
const stage=args.length?path.resolve(args[1]):path.join(root,'.runtime','r17-dev-package');
const packageDir=path.join(root,'packages','opendesk-dev');
const runtime=path.join(stage,'runtime');
const sourceEntry='native-agent/local-dev/dev-cli.mjs';
const supported=/\.(?:js|mjs|cjs|json|css|html)$/i;
const visited=new Set();
const external=new Set();
function inside(file){
  const relative=path.relative(root,file);
  return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);
}
function moduleFile(input){
  const absolute=path.resolve(input);
  if(!inside(absolute))throw new Error('E_PACKAGE_PATH: dependency escapes project root: '+absolute);
  for(const prefix of ['native-agent'+path.sep,'src'+path.sep,'scripts'+path.sep]){
    if(path.relative(root,absolute).startsWith(prefix))return absolute;
  }
  throw new Error('E_PACKAGE_PATH: unexpected runtime dependency '+absolute);
}
function copy(relative){
  const from=moduleFile(path.join(root,relative));
  const info=fs.lstatSync(from);
  if(!info.isFile()||info.isSymbolicLink()||!supported.test(from))
    throw new Error('E_PACKAGE_INPUT: non-file runtime dependency '+relative);
  if(visited.has(relative))return;
  visited.add(relative);
  const output=path.join(runtime,relative);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.copyFileSync(from,output);
  if(!/\.(?:js|mjs|cjs)$/.test(relative))return;
  const text=fs.readFileSync(from,'utf8');
  const ast=parse(text,{ecmaVersion:'latest',sourceType:relative.endsWith('.cjs')?'script':'module'});
  const links=[];
  const stack=[ast];
  while(stack.length){
    const node=stack.pop();
    if(!node||typeof node!=='object')continue;
    const importSpecifier=node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||
      node.type==='ExportAllDeclaration'?node.source?.value:
      node.type==='ImportExpression'&&node.source?.type==='Literal'?node.source.value:
      node.type==='CallExpression'&&node.callee?.name==='require'&&
      node.arguments?.length===1&&node.arguments[0]?.type==='Literal'?node.arguments[0].value:null;
    if(typeof importSpecifier==='string')links.push(importSpecifier);
    if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='require'&&
      node.arguments?.[0]?.type==='Literal'&&typeof node.arguments[0].value==='string')links.push(node.arguments[0].value);
    if(node.type==='NewExpression'&&node.callee?.name==='URL'&&node.arguments?.[0]?.type==='Literal'&&
      node.arguments[1]?.type==='MemberExpression'&&node.arguments[1].object?.type==='MetaProperty')
      links.push(node.arguments[0].value);
    for(const val of Object.values(node)){
      if(Array.isArray(val)){
        for(const child of val)if(child&&typeof child==='object')stack.push(child);
      }else if(val&&typeof val==='object')stack.push(val);
    }
  }
  for(const specifier of links){
    if(typeof specifier!=='string')continue;
    if(!/^\.\.?\//.test(specifier)){
      if(!specifier.startsWith('node:'))external.add(specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]);
      continue;
    }
    const resolved=path.resolve(path.dirname(from),specifier);
    let candidate=resolved;
    if(!fs.existsSync(candidate)&&fs.existsSync(candidate+'.js'))candidate+='.js';
    if(!fs.existsSync(candidate)&&fs.existsSync(candidate+'.mjs'))candidate+='.mjs';
    if(!fs.existsSync(candidate))throw new Error('E_PACKAGE_DEPENDENCY: '+relative+' -> '+specifier);
    copy(path.relative(root,candidate));
  }
}
// Never remove an existing output/backup. Require a canonical parent and create
// the final directory exclusively; a dangling output symlink also fails closed.
const parent=path.dirname(stage);
if(!args.length)fs.mkdirSync(parent,{recursive:true});
if(fs.realpathSync(parent)!==parent)throw new Error('E_PACKAGE_OUTPUT_LINK: use the canonical absolute parent path');
try{fs.mkdirSync(stage);}catch(error){
  if(error.code==='EEXIST')throw new Error('E_PACKAGE_OUTPUT_EXISTS: choose a fresh --out directory');
  throw error;
}
fs.mkdirSync(path.join(stage,'bin'));
const pkg=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8'));
if(pkg.private===true||pkg.bin?.['opendesk-dev']!=='bin/opendesk-dev.mjs')
  throw new Error('E_PACKAGE_METADATA: missing real npm bin');
pkg.os=[process.platform];pkg.cpu=[process.arch];
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const original=fs.readFileSync(path.join(packageDir,'bin','opendesk-dev.mjs'),'utf8');
const from="../../../native-agent/local-dev/dev-cli.mjs";
if(!original.includes(from))throw new Error('E_PACKAGE_BIN: source bin changed');
fs.writeFileSync(path.join(stage,'bin','opendesk-dev.mjs'),
  original.replace(from,"../runtime/native-agent/local-dev/dev-cli.mjs"),{mode:0o755});
copy(sourceEntry);
// Session/provider are dynamically imported by the foreground CLI.
copy('native-agent/local-dev/session.mjs');
copy('native-agent/local-dev/provider.mjs');
// Frozen resolver references explicit UI helpers with import.meta URLs.
copy('src/scripting/user-scripts/page-ui.js');
copy('src/scripting/user-scripts/page-ui-mount.js');
const lockBytes=fs.readFileSync(path.join(root,'package-lock.json'));
const runtimeDependencies=lockedRuntimeDependencies(JSON.parse(lockBytes),pkg.dependencies);
const shrinkwrap=createCliShrinkwrap(JSON.parse(lockBytes),pkg);
fs.writeFileSync(path.join(stage,'npm-shrinkwrap.json'),JSON.stringify(shrinkwrap,null,2)+'\n');
// Bundle only the existing locked runtime graph; never borrow unrelated tools.
for(const [key,expected] of Object.entries(shrinkwrap.packages)){
  if(!key)continue;
  const from=path.join(root,key),to=path.join(stage,key);
  if(!fs.existsSync(from)&&expected.optional===true)continue;
  if(!fs.existsSync(from)||fs.lstatSync(from).isSymbolicLink()||
    JSON.parse(fs.readFileSync(path.join(from,'package.json'),'utf8')).version!==expected.version)
    throw new Error('E_PACKAGE_INSTALLED_LOCK: '+key+'; restore existing root lock with npm ci --ignore-scripts');
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.cpSync(from,to,{recursive:true,filter:file=>{
    const relative=path.relative(from,file);
    if(relative.split(path.sep).includes('node_modules'))return false;
    if(fs.lstatSync(file).isSymbolicLink())throw new Error('E_PACKAGE_DEPENDENCY_LINK: '+key);
    return true;
  }});
}
// npm pack's own allowlist is authoritative for bundled dependency payload.
const dry=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['pack','--dry-run','--json','--ignore-scripts',stage],
  {cwd:stage,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
if(dry.status!==0)throw new Error('E_PACKAGE_DRY_RUN: '+(dry.stderr||dry.error?.message||''));
const packedPaths=new Set(JSON.parse(dry.stdout)[0].files.map(row=>row.path));
for(const row of contentInventory(stage))if(!packedPaths.has(row.path))fs.unlinkSync(path.join(stage,row.path));

for(const name of external)if(!runtimeDependencies.has(name))
  throw new Error('E_PACKAGE_DEPENDENCY_UNDECLARED: runtime imports '+name+' outside the CLI declared/locked dependency tree; no automatic dependency changes');
const git=argv=>spawnSync('git',argv,{cwd:root,encoding:'utf8',timeout:5000});
const head=git(['rev-parse','HEAD']),dirty=git(['status','--porcelain','--untracked-files=normal']);
const buildInfo=createBuildInfo(stage,{gitHead:head.status===0?head.stdout.trim():null,
  dirty:dirty.status===0?Boolean(dirty.stdout.trim()):null,
  lockSha256:digest(lockBytes)});
fs.writeFileSync(path.join(stage,'build-info.json'),JSON.stringify(buildInfo,null,2)+'\n');
const pkgName=pkg.name;
const pack=spawnSync(process.platform==='win32'?'npm.cmd':'npm',
  ['pack','--json','--ignore-scripts','--pack-destination',stage,stage],
  {cwd:stage,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
if(pack.status!==0)throw new Error('E_PACKAGE_NPM_PACK: '+(pack.stderr||pack.error?.message||pack.stdout));
let result;
try{result=JSON.parse(pack.stdout)[0];}
catch{throw new Error('E_PACKAGE_RESPONSE: npm pack did not return the archive manifest');}
if(!result?.filename||!Array.isArray(result.files)||result.files.length<10||
  !result.files.some(row=>row.path==='bin/opendesk-dev.mjs')||
  !result.files.some(row=>row.path==='build-info.json')||
  !result.files.some(row=>row.path==='runtime/native-agent/local-dev/resolver.mjs'))
  throw new Error('E_PACKAGE_INCOMPLETE: runtime graph missing');
const actualPaths=result.files.map(row=>row.path).filter(p=>p!=='build-info.json').sort();
if(JSON.stringify(actualPaths)!==JSON.stringify(buildInfo.files.map(row=>row.path).sort()))throw new Error('E_PACKAGE_ARCHIVE_CONTENT: archive differs from build identity');
const archive=path.join(stage,result.filename);
if(!fs.statSync(archive).isFile())throw new Error('E_PACKAGE_MISSING');
process.stdout.write(JSON.stringify({package:pkgName,archive,files:result.files.length,
  version:pkg.version,contentFingerprint:buildInfo.contentFingerprint,source:buildInfo.source,
  archiveSha256:digest(fs.readFileSync(archive)),
  filesBytes:result.unpackedSize,sha512:result.integrity},null,2)+'\n');
