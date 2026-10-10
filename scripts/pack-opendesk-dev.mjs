#!/usr/bin/env node
// Build a self-contained source graph for @shopable/opendesk-dev WITHOUT
// changing or publishing the private extension root package. npm pack operates
// exclusively on this generated, reviewable .runtime/ staging directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parse} from 'acorn';

const root=fileURLToPath(new URL('../',import.meta.url));
const stage=path.join(root,'.runtime','r17-dev-package');
const packageDir=path.join(root,'packages','opendesk-dev');
const runtime=path.join(stage,'runtime');
const sourceEntry='native-agent/local-dev/dev-cli.mjs';
const supported=/\.(?:js|mjs|json|css|html)$/i;
const visited=new Set();
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
  if(!/\.(?:js|mjs)$/.test(relative))return;
  const text=fs.readFileSync(from,'utf8');
  const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});
  const links=[];
  const stack=[ast];
  while(stack.length){
    const node=stack.pop();
    if(!node||typeof node!=='object')continue;
    const importSpecifier=node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||
      node.type==='ExportAllDeclaration'?node.source?.value:
      node.type==='ImportExpression'&&node.source?.type==='Literal'?node.source.value:null;
    if(typeof importSpecifier==='string')links.push(importSpecifier);
    if(node.type==='NewExpression'&&node.callee?.name==='URL'&&node.arguments?.[0]?.type==='Literal'&&
      node.arguments[1]?.type==='MemberExpression'&&node.arguments[1].object?.type==='MetaProperty')
      links.push(node.arguments[0].value);
    for(const val of Object.values(node)){
      if(Array.isArray(val))for(const child of val)if(child&&typeof child==='object')stack.push(child);
      else if(val&&typeof val==='object')stack.push(val);
    }
  }
  for(const specifier of links){
    if(typeof specifier!=='string'||!/^\.\.?\//.test(specifier))continue;
    const resolved=path.resolve(path.dirname(from),specifier);
    let candidate=resolved;
    if(!fs.existsSync(candidate)&&fs.existsSync(candidate+'.js'))candidate+='.js';
    if(!fs.existsSync(candidate)&&fs.existsSync(candidate+'.mjs'))candidate+='.mjs';
    if(!fs.existsSync(candidate))throw new Error('E_PACKAGE_DEPENDENCY: '+relative+' -> '+specifier);
    copy(path.relative(root,candidate));
  }
}
fs.rmSync(stage,{recursive:true,force:true});
fs.mkdirSync(path.join(stage,'bin'),{recursive:true});
const pkg=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8'));
if(pkg.private===true||pkg.bin?.['opendesk-dev']!=='bin/opendesk-dev.mjs')
  throw new Error('E_PACKAGE_METADATA: missing real npm bin');
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
const pkgName=pkg.name;
const pack=spawnSync(process.platform==='win32'?'npm.cmd':'npm',
  ['pack','--json','--ignore-scripts','--pack-destination',stage,stage],
  {cwd:stage,encoding:'utf8',maxBuffer:1024*1024,timeout:120000});
if(pack.status!==0)throw new Error('E_PACKAGE_NPM_PACK: '+(pack.stderr||pack.error?.message||pack.stdout));
let result;
try{result=JSON.parse(pack.stdout)[0];}
catch{throw new Error('E_PACKAGE_RESPONSE: npm pack did not return the archive manifest');}
if(!result?.filename||!Array.isArray(result.files)||result.files.length<10||
  !result.files.some(row=>row.path==='bin/opendesk-dev.mjs')||
  !result.files.some(row=>row.path==='runtime/native-agent/local-dev/resolver.mjs'))
  throw new Error('E_PACKAGE_INCOMPLETE: runtime graph missing');
const archive=path.join(stage,result.filename);
if(!fs.statSync(archive).isFile())throw new Error('E_PACKAGE_MISSING');
process.stdout.write(JSON.stringify({package:pkgName,archive,files:result.files.length,
  filesBytes:result.unpackedSize,sha512:result.integrity},null,2)+'\n');
