// Read-only first-party import/source-pin audit; no application module executes.
// This conservative static graph is not the rendered Rollup graph or a build.
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,extname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parse} from 'acorn';
import {transformSync} from 'esbuild';
import postcss from 'postcss';
import {describeBundle} from '../../../scripts/bundle-provenance.mjs';

const root=process.cwd(),target='ui/tool-shell.js',entry='src/entrypoints/tool-shell.js';
const modules=new Map(),unresolved=[],external=new Set(),importers=new Map();
const pathOf=file=>relative(root,file).split(sep).join('/');
const sha=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function resolvedFile(path){
  const candidates=[path,...['.js','.mjs','.ts','.tsx','.jsx'].map(ext=>path+ext),
    ...['index.js','index.ts','index.tsx'].map(name=>resolve(path,name))];
  return candidates.find(file=>existsSync(file)&&statSync(file).isFile());
}
function dependency(source,from){
  const [specifier,query='']=source.split('?');
  const alias=specifier==='@opendesk/ui'?resolve(root,'src/ui/react/components/ui/button.tsx'):null;
  if(!alias&&!specifier.startsWith('.')){external.add(specifier);return;}
  const file=resolvedFile(alias||resolve(dirname(from),specifier));
  if(!file){unresolved.push({from:pathOf(from),specifier:source});return;}
  const parents=importers.get(file)||new Set();parents.add(pathOf(from));importers.set(file,parents);
  visit(file,query==='raw');
}
function visit(file,raw=false){
  if(modules.has(file))return;
  const bytes=readFileSync(file);modules.set(file,{path:pathOf(file),blob:sha(bytes),bytes:bytes.length});
  if(raw)return;
  const extension=extname(file),source=bytes.toString('utf8');
  if(extension==='.css'){
    postcss.parse(source,{from:file}).walkAtRules('import',rule=>{
      const match=/^(?:url\()?\s*['\"]([^'\"]+)['\"]/.exec(rule.params);
      if(match?.[1]?.startsWith('.'))dependency(match[1],file);
    });
    return;
  }
  if(!['.js','.mjs','.ts','.tsx','.jsx'].includes(extension))return;
  const loader=extension==='.mjs'?'js':extension.slice(1);
  const code=transformSync(source,{loader,format:'esm',jsx:'transform'}).code;
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
  function walk(node){
    if(!node||typeof node!=='object')return;
    const imported=node.type==='ImportExpression'?node.source:
      ['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)?node.source:null;
    if(imported?.type==='Literal'&&typeof imported.value==='string')dependency(imported.value,file);
    for(const value of Object.values(node)){
      if(Array.isArray(value)){for(const child of value)walk(child);}
      else if(value&&typeof value==='object')walk(value);
    }
  }
  walk(ast);
}
visit(resolve(root,entry));
const failures=[],admitted=[];
for(const [file,input] of modules){
  try{
    const result=describeBundle({chunk:{fileName:target,
      modules:{[file]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
    if(result.modules[0].reviewedFirstPartyBlob)admitted.push(result.modules[0]);
  }catch(error){
    let committed=null;
    try{committed=execFileSync('git',['rev-parse','HEAD:'+input.path],{cwd:root,encoding:'utf8'}).trim();}catch{}
    failures.push({path:input.path,error:error.message,actual:input.blob,committed,
      dirty:input.blob!==committed,importers:[...(importers.get(file)||[])]});
  }
}
console.log(JSON.stringify({target,entry,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  kind:'STATIC_LOCAL_IMPORT_GRAPH_WITH_ORIGINAL_PER_MODULE_PROVENANCE',
  limitations:'Conservative syntax graph; no app execution or bundling. Bare npm and nonliteral dynamic imports are outside this first-party source-pin check.',
  localModuleCount:modules.size,reviewedInputCount:admitted.length,unresolved,
  externalSpecifiers:[...external].sort(),failures,admitted,
  inputs:[...modules.values()].sort((a,b)=>a.path.localeCompare(b.path))},null,2));
if(failures.length||unresolved.length)process.exitCode=1;
