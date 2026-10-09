// Offline authoring check only. This does NOT bundle, install, grant
// permissions, or run program source.
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,basename,relative,sep,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {validatePageProgramRules} from '../src/scripting/user-scripts/page-program-contract.js';
import {parseUserScriptDependencies} from '../src/scripting/user-scripts/dependency-metadata.js';
import {checkParamsSchema} from '../src/platform/tasks/contract.js';
import {buildAssetRecords,ASSET_LIMITS} from './program-assets.mjs';
import {remoteURL} from './remote-esm-modules.mjs';

const FORMAT='opendesk.project.v1';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));

export function projectError(code,message,details={}){
  const error=Object.assign(new Error(message),{code});
  if(details.project)error.project=details.project;
  if(details.phase)error.phase=details.phase;
  if(details.location)error.location=details.location;
  return error;
}

const fail=(code,message,details)=>{throw projectError(code,message,details);};
const ensure=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};

function unique(values){return new Set(values).size===values.length;}
function inside(root,file){return file===root||file.startsWith(root+sep);}
function context(project,phase,location){return {project,phase,location};}

function declaredPath(value,details){
  ensure(typeof value==='string'&&value.length>0&&value.length<=240&&
    !value.includes('\\')&&!value.includes('\0')&&
    !value.split('/').some(part=>part===''||part==='.'||part==='..')&&
    /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(value)&&
    !value.split('/').some(part=>part==='node_modules'||part==='.git'),
    'E_PROJECT_PATH','Project file paths must be bounded relative paths',details);
  return value;
}

async function checkedFile(root,path,limit=256*1024,details={}){
  const target=resolve(root,path);
  ensure(inside(root,target),'E_PROJECT_PATH','File cannot escape project root',
    {...details,location:path});
  const actual=await realpath(target).catch(()=>
    fail('E_PROJECT_FILE','Project file not found: '+path,{...details,location:path}));
  ensure(inside(root,actual),'E_PROJECT_SYMLINK','Symlinks outside the project are not allowed',
    {...details,location:path});
  const info=await stat(actual);
  ensure(info.isFile()&&info.size>0&&info.size<=limit,'E_PROJECT_LIMIT',
    'Project file size or type is unsupported: '+path,{...details,location:path});
  return readFile(actual);
}

function decode(bytes,details,preserveBOM=false){
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:preserveBOM}).decode(bytes);}
  catch{fail('E_PROJECT_ENCODING','Project source must be valid UTF-8',details);}
}

function metadata(pkg,projectLabel){
  const details=context(projectLabel,'metadata','package.json');
  ensure(plain(pkg),'E_PROJECT_META','package.json must be a JSON object',details);
  ensure(typeof pkg.name==='string'&&/^[a-z0-9@][a-z0-9@/._-]{0,127}$/.test(pkg.name)&&
    SEMVER.test(pkg.version)&&pkg.type==='module'&&pkg.private===true&&
    typeof pkg.description==='string'&&pkg.description.trim().length>0,
    'E_PROJECT_META','package.json requires name/version, type:module, private:true and description',
    details);

  const p=pkg.opendesk;
  ensure(plain(p)&&p.format===FORMAT&&IDENTIFIER.test(p.id)&&
    ['page-userscript','controller'].includes(p.runtimeKind)&&p.sourceFormat==='esm',
    'E_PROJECT_FORMAT','OpenDesk project metadata must declare id, runtime kind and ESM source',
    details);

  const shared=['format','id','runtimeKind','sourceFormat','entry','assets'];
  const allowed=p.runtimeKind==='page-userscript'
    ?[...shared,'pageRules']
    :[...shared,'siteOrigins','permissions','paramsSchema'];
  ensure(Object.keys(p).every(k=>allowed.includes(k))&&
    allowed.filter(k=>k!=='assets').every(k=>Object.hasOwn(p,k)),
    'E_PROJECT_SCHEMA','Project fields do not match the declared runtime kind',details);

  declaredPath(p.entry,{...details,location:'package.json#opendesk.entry'});
  ensure(['.js','.mjs'].includes(extname(p.entry)),'E_PROJECT_ENTRY',
    'Entry must be an explicit .js or .mjs module',{...details,location:p.entry});

  if(p.runtimeKind==='page-userscript'){
    validatePageProgramRules(p.pageRules);
  }else{
    ensure(Array.isArray(p.siteOrigins)&&p.siteOrigins.length===1&&
      Array.isArray(p.permissions)&&p.permissions.length===1&&p.permissions[0]==='page.automation',
      'E_PROJECT_PERMISSION','Controller projects require exactly page.automation permission',
      {...details,location:'package.json#opendesk.permissions'});
    const origin=p.siteOrigins[0];
    let parsed;
    try{parsed=new URL(origin);}
    catch{fail('E_PROJECT_PERMISSION','Controller site origin must be a URL',
      {...details,location:'package.json#opendesk.siteOrigins[0]'});}
    ensure(['http:','https:'].includes(parsed.protocol)&&parsed.origin===origin&&
      parsed.href===origin+'/'&&!parsed.username&&!parsed.password,
      'E_PROJECT_PERMISSION','Controller site origin must be an exact HTTP(S) origin',
      {...details,location:'package.json#opendesk.siteOrigins[0]'});
    checkParamsSchema(p.paramsSchema);
  }

  ensure(p.assets===undefined||Array.isArray(p.assets)&&p.assets.length<=32&&
    p.assets.every(row=>plain(row)&&Object.keys(row).every(k=>['path','kind'].includes(k))&&
      Object.hasOwn(row,'path')&&Object.hasOwn(row,'kind')&&
      ['css','json','image'].includes(row.kind)),
    'E_PROJECT_ASSET','Only css/json/image source assets can be declared',
    {...details,location:'package.json#opendesk.assets'});
  if(p.assets){
    const names=p.assets.map(row=>declaredPath(row.path,{...details,location:'package.json#opendesk.assets'}));
    ensure(unique(names)&&!names.includes(p.entry),'E_PROJECT_ASSET',
      'Assets must be unique and cannot replace the entry module',
      {...details,location:'package.json#opendesk.assets'});
  }
  return p;
}

function dependencyName(spec,details){
  if(spec.startsWith('node:')||spec.startsWith('#')||spec.includes('://')||
    spec.startsWith('/')||spec.includes('\\')){
    fail('E_PROJECT_IMPORT','Absolute, remote, Node and import-map specifiers are not allowed',details);
  }
  const parts=spec.split('/');
  const value=spec.startsWith('@')?parts.slice(0,2).join('/'):parts[0];
  ensure(/^[a-zA-Z0-9@._-]+(?:\/[a-zA-Z0-9._-]+)?$/.test(value),
    'E_PROJECT_IMPORT','Invalid npm dependency specifier',details);
  return value;
}

function parseImports(text,file,projectLabel){
  let ast;
  try{ast=parse(text,{ecmaVersion:'latest',sourceType:'module',locations:true});}
  catch(error){
    fail('E_PROJECT_SYNTAX',file+': '+error.message,
      context(projectLabel,'validate',{file,line:error.loc?.line,column:error.loc?.column}));
  }

  const imports=[];
  for(const item of ast.body){
    if((item.type==='ImportDeclaration'||item.type==='ExportNamedDeclaration'||
      item.type==='ExportAllDeclaration')&&item.source){
      imports.push({spec:item.source.value,loc:item.source.loc?.start});
    }
  }

  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression'){
      fail('E_PROJECT_DYNAMIC_IMPORT','Dynamic import needs a future explicit locked graph adapter',
        context(projectLabel,'validate',{file,line:node.loc?.start?.line,column:node.loc?.start?.column}));
    }
    if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&
      ['require','eval'].includes(node.callee.name)){
      fail('E_PROJECT_DYNAMIC_IMPORT','Runtime require/eval is not allowed in ESM projects',
        context(projectLabel,'validate',{file,line:node.loc?.start?.line,column:node.loc?.start?.column}));
    }
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)visit(child);
      else if(value&&typeof value==='object')visit(value);
    }
  };
  visit(ast);
  return {ast,imports};
}

export async function validateProgramProject(input){
  ensure(typeof input==='string'&&input.length>0,'E_PROJECT_PATH',
    'Provide a project directory or package.json path',{phase:'resolve'});
  const projectRoot=await realpath(basename(input)==='package.json'?dirname(input):input);
  const projectLabel=basename(projectRoot);
  const packageDetails=context(projectLabel,'metadata','package.json');
  const packageBytes=await checkedFile(projectRoot,'package.json',64*1024,packageDetails);
  ensure(!packageBytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),
    'E_PROJECT_META','package.json must be UTF-8 without BOM for the fixed Webpack resolver',packageDetails);
  const pkg=JSON.parse(decode(packageBytes,packageDetails));
  const p=metadata(pkg,projectLabel);

  const graph=new Map();
  const bare=new Set(),remote=new Set();
  const rootDependencies=plain(pkg.dependencies)?pkg.dependencies:{};
  ensure(Object.values(rootDependencies).every(x=>typeof x==='string'),'E_PROJECT_META',
    'npm dependencies must be package version declarations',packageDetails);

  async function scan(rel){
    const file=relative(projectRoot,resolve(projectRoot,rel)).split(sep).join('/');
    if(graph.has(file))return;
    ensure(graph.size<64,'E_PROJECT_LIMIT','At most 64 static source modules are supported',
      context(projectLabel,'validate',file));
    const bytes=await checkedFile(projectRoot,file,256*1024,context(projectLabel,'validate',file));
    const text=decode(bytes,context(projectLabel,'validate',file),true);
    ensure(!parseUserScriptDependencies(text).hasHeader,'E_PROJECT_SOURCE_MODE',
      'ESM package projects must not include a UserScript metadata header',
      context(projectLabel,'validate',file));
    const {ast,imports}=parseImports(text,file,projectLabel);
    graph.set(file,{path:file,sourceUtf8:text,bytes:bytes.length,sha256:sha(bytes)});
    for(const item of imports){
      const spec=item.spec;
      const location={file,line:item.loc?.line,column:item.loc?.column};
      ensure(typeof spec==='string','E_PROJECT_IMPORT','Static import source must be a string',
        context(projectLabel,'validate',location));
      if(spec.startsWith('https:')){
        try{remote.add(remoteURL(spec));}
        catch(error){fail(error.code||'E_REMOTE_URL',error.message,
          context(projectLabel,'validate',location));}
      }else if(spec.startsWith('http:')){
        fail('E_REMOTE_URL','Only HTTPS URL imports are supported; HTTP code cannot be bundled',
          context(projectLabel,'validate',location));
      }else if(spec.startsWith('.')){
        const target=resolve(projectRoot,dirname(file),spec);
        ensure(inside(projectRoot,target),'E_PROJECT_PATH','Local import cannot escape project root',
          context(projectLabel,'validate',location));
        ensure(['.js','.mjs'].includes(extname(target)),'E_PROJECT_IMPORT',
          'Local imports must include an explicit .js/.mjs extension',
          context(projectLabel,'validate',location));
        await scan(relative(projectRoot,target));
      }else{
        if(spec==='@opendesk/ui'){
          ensure(p.runtimeKind==='page-userscript'&&!Object.hasOwn(rootDependencies,spec),
            'E_PROJECT_IMPORT','@opendesk/ui is the built-in Page UI helper, not an npm dependency',
            context(projectLabel,'validate',location));
          continue;
        }
        const name=dependencyName(spec,context(projectLabel,'validate',location));
        ensure(Object.hasOwn(rootDependencies,name),'E_PROJECT_IMPORT',
          'Bare import must be declared in package.json dependencies',
          context(projectLabel,'validate',location));
        bare.add(name);
      }
    }
    if(file===p.entry){
      const defaultExport=ast.body.find(n=>n.type==='ExportDefaultDeclaration');
      ensure(defaultExport,'E_PROJECT_ENTRY',
        'Entry module must default-export the program function',
        context(projectLabel,'validate',file));
      ensure(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
        .includes(defaultExport.declaration?.type),'E_PROJECT_ENTRY',
        'Entry default export must be a function',
        context(projectLabel,'validate',
          {file,line:defaultExport.loc?.start?.line,column:defaultExport.loc?.start?.column}));
    }
  }

  await scan(p.entry);
  if(bare.size){
    const lockDetails=context(projectLabel,'validate','package-lock.json');
    const lock=JSON.parse(decode(await checkedFile(projectRoot,'package-lock.json',2*1024*1024,lockDetails),lockDetails));
    const root=lock.packages?.['']?.dependencies;
    ensure(plain(root)&&[...bare].every(name=>root[name]===rootDependencies[name]),
      'E_PROJECT_NPM_LOCK','Bare imports require a matching committed package-lock.json',lockDetails);
  }

  const assets=[];
  const assetContents=new Map();
  for(const item of p.assets||[]){
    const path=declaredPath(item.path,context(projectLabel,'validate','package.json#opendesk.assets'));
    const allowed={css:['.css'],json:['.json'],image:['.png','.jpg','.jpeg','.webp']};
    ensure(allowed[item.kind].includes(extname(path).toLowerCase()),'E_PROJECT_ASSET',
      'Unsupported asset file extension',context(projectLabel,'validate',path));
    const bytes=await checkedFile(projectRoot,path,ASSET_LIMITS[item.kind],context(projectLabel,'validate',path));
    assetContents.set(path,bytes);
    assets.push({path,kind:item.kind,sha256:sha(bytes),bytes:bytes.length});
  }
  buildAssetRecords(assets,assetContents);

  const sourceFiles=[...graph.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const sources=sourceFiles.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  ensure(sources.reduce((n,row)=>n+row.bytes,0)<=128*1024,'E_PROJECT_LIMIT',
    'Tracked ESM source must fit the 128 KiB authoring limit',
    context(projectLabel,'validate',p.entry));

  return {
    status:'AUTHORING_VALID_NOT_PACKAGED',
    format:FORMAT,
    id:p.id,
    version:pkg.version,
    runtimeKind:p.runtimeKind,
    entry:p.entry,
    sourceFormat:'esm',
    sources,
    sourceFiles,
    assets,
    npmPackages:[...bare].sort(),
    remoteImports:[...remote].sort(),
    installable:false,
    note:'Source authoring metadata only. Validate/build/run through the existing OpenDesk program pipeline.'
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  validateProgramProject(process.argv[2]||'examples/programs/page-heading').then(result=>{
    const {sourceFiles,...publicResult}=result;
    process.stdout.write(JSON.stringify(publicResult,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write((error.code||'E_PROJECT')+': '+error.message+'\n');
    process.exitCode=1;
  });
}
