// Offline authoring check only. This does NOT bundle code, install scripts,
// create an Available task, or grant any browser permission.
import {readFile, lstat, realpath} from 'node:fs/promises';
import {resolve, dirname, relative, sep, extname, basename, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {validatePageProgramRules} from '../src/scripting/user-scripts/page-program-contract.js';
import {parseUserScriptDependencies} from '../src/scripting/user-scripts/dependency-metadata.js';
import {checkParamsSchema} from '../src/platform/tasks/contract.js';

const FORMAT='opendesk.project.v1';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const ensure=(ok,code,message)=>{if(!ok)fail(code,message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const unique=values=>new Set(values).size===values.length;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>file.startsWith(root+sep) && !relative(root,file).startsWith('..'+sep);
function declaredPath(value) {
  ensure(typeof value==='string' && value.length>0 && value.length<=240 &&
    !isAbsolute(value) && !value.includes('\\') && !value.includes('\0') &&
    !value.split('/').some(part=>part===''||part==='.'||part==='..') &&
    /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(value) &&
    !value.split('/').some(part=>part==='node_modules'||part==='.git'),
    'E_PROJECT_PATH','项目文件路径必须是有限、无回退的相对路径');
  return value;
}
async function checkedFile(root,path,limit=256*1024) {
  const target=resolve(root,path);
  ensure(inside(root,target),'E_PROJECT_PATH','文件不能逃离项目根目录');
  const actual=await realpath(target).catch(()=>fail('E_PROJECT_FILE','找不到项目文件：'+path));
  ensure(actual===target && inside(root,actual),'E_PROJECT_SYMLINK','不允许符号链接或项目外文件');
  const stat=await lstat(actual);
  ensure(stat.isFile()&&stat.size>0&&stat.size<=limit,'E_PROJECT_LIMIT','源文件大小或类型不受支持：'+path);
  return readFile(actual);
}
function metadata(pkg) {
  ensure(plain(pkg) && typeof pkg.name==='string' && /^[a-z0-9@][a-z0-9@/._-]{0,127}$/.test(pkg.name) &&
    SEMVER.test(pkg.version) && pkg.type==='module' && pkg.private===true &&
    typeof pkg.description==='string' && pkg.description.trim().length>0,
    'E_PROJECT_META','package.json 需要合法 name/version、type:module、private:true 和 description');
  const p=pkg.opendesk;
  ensure(plain(p) && p.format===FORMAT && IDENTIFIER.test(p.id) &&
    ['page-userscript','controller'].includes(p.runtimeKind) && p.sourceFormat==='esm',
    'E_PROJECT_FORMAT','需要明确的 OpenDesk project v1、程序 ID、运行类型和 ESM 源码格式');
  const shared=['format','id','runtimeKind','sourceFormat','entry','assets'];
  const allowed=p.runtimeKind==='page-userscript'?[...shared,'pageRules']:[...shared,'siteOrigins','permissions','paramsSchema'];
  ensure(Object.keys(p).every(k=>allowed.includes(k)) && allowed.filter(k=>k!=='assets').every(k=>Object.hasOwn(p,k)),
    'E_PROJECT_SCHEMA','项目字段与运行类型不符；Page 与 Controller 不得混用权限或执行规则');
  declaredPath(p.entry);
  ensure(['.js','.mjs'].includes(extname(p.entry)),'E_PROJECT_ENTRY','ESM 入口必须是 .js 或 .mjs');
  if(p.runtimeKind==='page-userscript')validatePageProgramRules(p.pageRules);
  else{
    ensure(Array.isArray(p.siteOrigins)&&p.siteOrigins.length===1&&
      Array.isArray(p.permissions)&&p.permissions.length===1&&p.permissions[0]==='page.automation',
      'E_PROJECT_PERMISSION','Controller v1 只支持一个精确网站 origin 和 page.automation');
    const origin=p.siteOrigins[0];
    let parsed;try{parsed=new URL(origin);}catch{fail('E_PROJECT_PERMISSION','目标网站必须是 URL origin');}
    ensure(['http:','https:'].includes(parsed.protocol)&&parsed.origin===origin&&parsed.href===origin+'/' &&
      !parsed.username&&!parsed.password,'E_PROJECT_PERMISSION','目标网址须为精确 HTTP(S) origin');
    checkParamsSchema(p.paramsSchema);
  }
  ensure(p.assets===undefined || Array.isArray(p.assets) && p.assets.length<=32 &&
    p.assets.every(row=>plain(row) && Object.keys(row).every(k=>['path','kind'].includes(k)) &&
      Object.hasOwn(row,'path') && Object.hasOwn(row,'kind') &&
      ['css','json','image'].includes(row.kind)),
    'E_PROJECT_ASSET','仅支持声明 css/json/image 源资产；当前未接入运行时注入');
  if(p.assets) {
    const names=p.assets.map(row=>declaredPath(row.path));
    ensure(unique(names)&&!names.includes(p.entry),'E_PROJECT_ASSET','资源不能重复或覆盖入口');
  }
  return p;
}
function npmName(spec) {
  if(!spec || spec.startsWith('node:') || spec.startsWith('#') || spec.includes('://') ||
    spec.startsWith('/') || spec.includes('\\'))fail('E_PROJECT_IMPORT','禁止绝对、远程、Node 或无来源别名导入：'+spec);
  const parts=spec.split('/');
  const value=spec.startsWith('@')?parts.slice(0,2).join('/'):parts[0];
  ensure(value && /^[a-zA-Z0-9@._-]+(?:\/[a-zA-Z0-9._-]+)?$/.test(value),'E_PROJECT_IMPORT','非法依赖标识');
  return value;
}
function moduleImports(ast) {
  const imports=[];
  for(const item of ast.body) {
    if(item.type==='ImportDeclaration' || item.type==='ExportNamedDeclaration' || item.type==='ExportAllDeclaration'){
      if(item.source)imports.push(item.source.value);
    }
  }
  const visit=(node)=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression')fail('E_PROJECT_DYNAMIC_IMPORT','动态 import 必须由未来的显式构建锁图适配器处理');
    if(node.type==='CallExpression' && node.callee?.type==='Identifier' &&
      ['require','eval'].includes(node.callee.name))fail('E_PROJECT_DYNAMIC_IMPORT','当前 ESM 项目禁止运行时 require/eval');
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)visit(child);
      else if(value&&typeof value==='object')visit(value);
    }
  };
  visit(ast);return imports;
}
function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{fail('E_PROJECT_ENCODING','项目源码必须是有效 UTF-8');}}
export async function validateProgramProject(input) {
  ensure(typeof input==='string'&&input.length>0,'E_PROJECT_PATH','请提供项目目录或 package.json 路径');
  const projectRoot=await realpath(basename(input)==='package.json'?dirname(input):input);
  const pkg=JSON.parse(decode(await checkedFile(projectRoot,'package.json',64*1024)));
  const p=metadata(pkg);
  const graph=new Map(),bare=new Set(),rootDependencies=plain(pkg.dependencies)?pkg.dependencies:{};
  ensure(Object.values(rootDependencies).every(x=>typeof x==='string'), 'E_PROJECT_META','npm dependencies 必须是包版本声明');
  async function scan(rel) {
    const file=relative(projectRoot,resolve(projectRoot,rel)).split(sep).join('/');
    if(graph.has(file))return;
    ensure(graph.size<64,'E_PROJECT_LIMIT','最多静态追踪 64 个源码模块');
    const bytes=await checkedFile(projectRoot,file);
    const text=decode(bytes);
    ensure(!parseUserScriptDependencies(text).hasHeader,'E_PROJECT_SOURCE_MODE',
      'ESM 项目请在 package.json.opendesk 声明权限与依赖，不要在模块里混入传统 @require 元数据');
    let ast;try{ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});}
    catch(error){fail('E_PROJECT_SYNTAX',file+': '+error.message);}
    graph.set(file,{path:file,bytes:bytes.length,sha256:sha(bytes)});
    if(file===p.entry)ensure(ast.body.some(n=>n.type==='ExportDefaultDeclaration'),'E_PROJECT_ENTRY',
      '入口必须 export default 一个任务主函数');
    for(const spec of moduleImports(ast)){
      ensure(typeof spec==='string','E_PROJECT_IMPORT','静态 import 必须是字符串路径');
      if(spec.startsWith('.')){
        const target=resolve(dirname(resolve(projectRoot,file)),spec);
        ensure(inside(projectRoot,target),'E_PROJECT_PATH','import 不得逃离项目：'+spec);
        ensure(['.js','.mjs'].includes(extname(target)),'E_PROJECT_IMPORT','必须使用明确的本地 .js/.mjs 扩展名：'+spec);
        await scan(relative(projectRoot,target));
      } else {
        const name=npmName(spec);
        ensure(Object.hasOwn(rootDependencies,name),'E_PROJECT_IMPORT',
          'npm 包必须在 package.json dependencies 中声明：'+name);
        bare.add(name);
      }
    }
  }
  await scan(p.entry);
  if(bare.size){
    const lock=JSON.parse(decode(await checkedFile(projectRoot,'package-lock.json',2*1024*1024)));
    const root=lock.packages?.['']?.dependencies;
    ensure(plain(root)&&[...bare].every(name=>root[name]===rootDependencies[name]),
      'E_PROJECT_NPM_LOCK','裸包导入必须存在一致的 npm package-lock.json');
  }
  const assets=[];
  for(const item of p.assets||[]){
    const path=declaredPath(item.path);
    const allowed={css:['.css'],json:['.json'],image:['.png','.jpg','.jpeg','.webp']};
    ensure(allowed[item.kind].includes(extname(path).toLowerCase()),'E_PROJECT_ASSET','不支持的资源后缀');
    const bytes=await checkedFile(projectRoot,path,1024*1024);
    assets.push({path,kind:item.kind,sha256:sha(bytes),bytes:bytes.length});
  }
  const sources=[...graph.values()].sort((a,b)=>a.path.localeCompare(b.path));
  ensure(sources.reduce((n,row)=>n+row.bytes,0)<=128*1024,'E_PROJECT_LIMIT',
    '源模块之和超过当前 Page/Task 执行源码的 128 KiB 初始预算');
  return {status:'AUTHORING_VALID_NOT_PACKAGED',format:FORMAT,id:p.id,version:pkg.version,
    runtimeKind:p.runtimeKind,entry:p.entry,sourceFormat:'esm',sources,assets,
    npmPackages:[...bare].sort(),installable:false,
    next:'Requires a reviewed ESM bundler, a frozen output asset and type-specific runtime verification'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  validateProgramProject(process.argv[2]||'examples/programs/page-heading').then(result=>
    process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{
    process.stderr.write((error.code||'E_PROJECT')+': '+error.message+'\n');
    process.exitCode=1;
  });
}
