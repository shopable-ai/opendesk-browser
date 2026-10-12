// OpenDesk Developer Edition browser-only Controller ESM source linker.
// This module transforms *data* using the fixed local Babel compiler. It does
// not evaluate author/dependency code. Emitted classic code is admitted only
// through the existing Controller RunHost, Authority and opaque Worker.
const MAX_AUTHOR_BYTES=128*1024,MAX_MODULES=32,MAX_MODULE_BYTES=128*1024;
const MAX_GRAPH_BYTES=256*1024,MAX_COMPILED_BYTES=48000,MAX_NODES=100000;
const enc=new TextEncoder(),size=s=>enc.encode(s).length;
const error=(code,message,file)=>Object.assign(new Error(message),{code,...(file?{location:{file}}:{})});
const hex=/^[a-f0-9]{64}$/;
const plain=o=>o&&typeof o==='object'&&!Array.isArray(o)&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
const imported=r=>r.type==='ImportDeclaration'||r.type==='ExportAllDeclaration'||r.type==='ExportNamedDeclaration'&&r.source;
async function sha(source){
  const bytes=typeof source==='string'?enc.encode(source):source;
  if(!globalThis.crypto?.subtle)throw error('E_REMOTE_HASH','SHA-256 unavailable in compiler Worker');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function urlOf(value){
  if(typeof value!=='string'||value.length>2048)throw error('E_REMOTE_URL','Dependency needs a bounded, public HTTPS URL');
  let url;try{url=new URL(value);}catch{throw error('E_REMOTE_URL','Invalid dependency URL');}
  const host=url.hostname.toLowerCase();
  const secret=/^(?:token|access_token|refresh_token|id_token|auth|authorization|api_?key|secret|client_secret|password|passwd|jwt|session_?token|signature|sig|key|(?:x_amz|x_goog)_signature)$/i;
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.pathname==='/'||
    !host.includes('.')||host.endsWith('.')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||
    host==='localhost'||['.localhost','.local','.internal','.test','.invalid'].some(s=>host.endsWith(s))||
    /[\u0000-\u001f\\]/.test(value)||[...url.searchParams.keys()].some(k=>secret.test(k.replaceAll('-','_'))))
    throw error('E_REMOTE_URL','Dependency must use a public HTTPS URL with no credentials, custom port or fragment');
  return url.href;
}
function importMappings(source){
  const mappings=Object.create(null),lines=source.replace(/^\uFEFF/,'').split(/\r?\n/);
  for(const line of lines.slice(0,32)){
    if(!line.trim())continue;
    if(!/^\s*\/\//.test(line))break;
    if(!/^\s*\/\/\s*@opendesk-import\b/.test(line))continue;
    const match=/^\s*\/\/\s*@opendesk-import\s+([^\s]+)\s+(https:\/\/[^\s]+)\s*$/.exec(line);
    if(!match)throw error('E_REMOTE_IMPORT','Use // @opendesk-import package https://host/path@exact-version.mjs');
    const name=match[1];
    if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)||['react','react-dom','vue'].includes(name)||Object.hasOwn(mappings,name)||Object.keys(mappings).length>=8)
      throw error('E_REMOTE_IMPORT','Invalid, duplicate or unsupported bare package mapping: '+name);
    const target=urlOf(match[2]);
    if(!/(?:@\d+\.\d+\.\d+|\/[vV]?\d+\.\d+\.\d+\/)/.test(target))
      throw error('E_REMOTE_VERSION','Bare package maps must include an exact version in the immutable HTTPS URL: '+name);
    mappings[name]=target;
  }
  return mappings;
}
function resolveImport(spec,base,mappings,entry=false){
  if(typeof spec!=='string')throw error('E_REMOTE_IMPORT','Only literal static import specifiers are supported');
  if(spec.startsWith('https:'))return urlOf(spec);
  if((spec.startsWith('./')||spec.startsWith('../')||spec.startsWith('/'))&&!entry)return urlOf(new URL(spec,base).href);
  if(entry&&spec.startsWith('.'))throw error('E_CONTROLLER_LOCAL_PROJECT','Relative imports require the existing local multi-file project builder');
  if(Object.hasOwn(mappings,spec))return mappings[spec];
  throw error('E_REMOTE_IMPORT','Unmapped import '+JSON.stringify(spec)+'; add a pinned @opendesk-import mapping or use a fixed HTTPS ESM URL');
}
function astFor(babel,source,file){
  try{return babel.transform(source,{filename:file,code:false,ast:true,babelrc:false,
    configFile:false,parserOpts:{sourceType:'module',plugins:[]}}).ast.program;}
  catch(cause){throw error('E_CONTROLLER_ESM_SYNTAX',String(cause?.message||cause).slice(0,300),file);}
}
function walk(ast,file){
  let nodes=0;
  const stack=[[ast,0]];
  while(stack.length){
    const [node,depth]=stack.pop();if(!node||typeof node!=='object')continue;
    if(++nodes>MAX_NODES)throw error('E_REMOTE_LIMIT','ESM syntax exceeds analysis budget',file);
    const kind=node.type||'',functionDepth=depth+Number(/Function|Method/.test(kind)||kind==='ArrowFunctionExpression');
    const callee=node.callee;
    const dynamic=name=>['require','eval','Function','AsyncFunction'].includes(name);
    const called=callee?.type==='Identifier'?dynamic(callee.name):
      callee?.type==='MemberExpression'&&['globalThis','window','self'].includes(callee.object?.name)&&
      dynamic(callee.computed?callee.property?.value:callee.property?.name);
    if(kind==='ImportExpression'||kind==='MetaProperty'||kind==='CallExpression'&&callee?.type==='Import'||
      ['CallExpression','NewExpression'].includes(kind)&&called||
      kind==='AwaitExpression'&&!depth||kind==='ForOfStatement'&&node.await&&!depth)
      throw error('E_CONTROLLER_ESM_DYNAMIC','Dynamic import, eval, require(), module metadata or top-level await is unsupported',file);
    for(const [key,value] of Object.entries(node)){
      if(['start','end','loc','extra','tokens','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;
      if(Array.isArray(value))for(const item of value)stack.push([item,functionDepth]);
      else if(value&&typeof value==='object')stack.push([value,functionDepth]);
    }
  }
}
function declared(node,names){
  if(!node)return;
  if(node.type==='Identifier')names.add(node.name);
  else if(node.type==='ObjectPattern')for(const p of node.properties)declared(p.value||p.argument,names);
  else if(node.type==='ArrayPattern')for(const el of node.elements)declared(el,names);
  else if(node.type==='RestElement'||node.type==='AssignmentPattern')declared(node.argument||node.left,names);
}
function directExports(body){
  const names=new Set();
  for(const row of body){
    if(row.type==='ExportDefaultDeclaration')names.add('default');
    if(row.type==='ExportNamedDeclaration'){
      for(const s of row.specifiers||[])names.add(s.exported?.name??s.exported?.value);
      const d=row.declaration;
      if(d?.type==='VariableDeclaration')for(const s of d.declarations)declared(s.id,names);
      else if(d?.id?.name)names.add(d.id.name);
    }
    if(row.type==='ExportAllDeclaration'&&row.exported)names.add(row.exported.name??row.exported.value);
  }
  return names;
}
function requests(row){
  return (row.specifiers||[]).flatMap(s=>{
    if(['ImportNamespaceSpecifier','ExportNamespaceSpecifier'].includes(s.type))return [];
    if(s.type==='ImportDefaultSpecifier')return ['default'];
    const n=s.imported?.name??s.imported?.value??s.local?.name??s.local?.value;
    return n?[n]:[];
  });
}
async function inspect(input){
  const {componentSource:source,projectId,remoteModules=[],babel}=input;
  if(typeof source!=='string'||!source.trim()||size(source)>MAX_AUTHOR_BYTES||
    typeof projectId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(projectId)||
    babel?.version!=='7.29.9'||typeof babel.transform!=='function')
    throw error('E_CONTROLLER_ESM_INPUT','Invalid Controller source, program identity or pinned Babel');
  const maps=importMappings(source),entry='opendesk-controller-entry.js',ast=astFor(babel,source,entry);
  walk(ast,entry);
  const entryHasDefault=ast.body.some(row=>row.type==='ExportDefaultDeclaration');
  const hasClassicMain=ast.body.some(row=>row.type==='FunctionDeclaration'&&row.id?.name==='main');
  if(!entryHasDefault&&!hasClassicMain)throw error('E_CONTROLLER_ESM_ENTRY','A default async function main() or top-level function main() is required');
  const entryRefs=ast.body.filter(imported).map(row=>({specifier:row.source.value,
    url:resolveImport(row.source.value,entry,maps,true),requested:requests(row)}));
  if(!Array.isArray(remoteModules)||remoteModules.length>MAX_MODULES)throw error('E_REMOTE_LIMIT','At most 32 ESM modules');
  const sources=new Map();let total=0;
  for(const row of remoteModules){
    if(!row||typeof row.code!=='string'||typeof row.url!=='string'||row.url!==urlOf(row.url)||
      sources.has(row.url)||!hex.test(row.sha256)||!Number.isSafeInteger(row.bytes)||
      row.bytes<1||row.bytes>MAX_MODULE_BYTES||size(row.code)!==row.bytes||await sha(row.code)!==row.sha256)
      throw error('E_REMOTE_HASH','Corrupt, duplicate or invalid pinned module',row?.url);
    total+=row.bytes;if(total>MAX_GRAPH_BYTES)throw error('E_REMOTE_LIMIT','Browser ESM graph exceeds 256 KiB');
    const tree=astFor(babel,row.code,row.url);walk(tree,row.url);
    if(!tree.body.some(imported)&&!tree.body.some(r=>r.type==='ExportDefaultDeclaration'||r.type==='ExportNamedDeclaration'))
      throw error('E_REMOTE_ESM','Remote resource is not standard ESM',row.url);
    const refs=tree.body.filter(imported).map(r=>({specifier:r.source.value,
      url:resolveImport(r.source.value,row.url,maps),requested:requests(r),star:r.type==='ExportAllDeclaration'&&!r.exported}));
    sources.set(row.url,{...row,refs,exports:directExports(tree.body)});
  }
  const roots=[...new Set(entryRefs.map(r=>r.url))].sort(),visited=new Set(),missing=new Set(),queue=[...roots];
  while(queue.length){
    const next=queue.shift();if(visited.has(next))continue;visited.add(next);
    if(visited.size>MAX_MODULES)throw error('E_REMOTE_LIMIT','Controller browser graph exceeds 32 modules');
    const row=sources.get(next);if(!row){missing.add(next);continue;}
    for(const ref of row.refs)queue.push(ref.url);
  }
  if([...sources.keys()].some(url=>!visited.has(url)))throw error('E_REMOTE_GRAPH','An unreferenced dependency was supplied');
  if(!missing.size){
    for(let n=0;n<=sources.size;n++){
      let modified=false;
      for(const row of sources.values())for(const ref of row.refs.filter(x=>x.star))
        for(const name of sources.get(ref.url).exports)if(name!=='default'&&!row.exports.has(name)){
          row.exports.add(name);modified=true;
        }
      if(!modified)break;
    }
    for(const [owner,refs] of [[entry,entryRefs],...[...sources].map(([url,row])=>[url,row.refs])])
      for(const ref of refs)for(const name of ref.requested)
        if(!sources.get(ref.url)?.exports.has(name))throw error('E_REMOTE_EXPORT','Missing '+name+' export from '+ref.url,owner);
  }
  const ordered=[...sources.values()].sort((a,b)=>a.url.localeCompare(b.url));
  return {entry,source,entryHasDefault,entryRefs,roots,missing:[...missing].sort(),ordered,
    lock:{format:'opendesk.remote-lock.v1',modules:Object.fromEntries(ordered.map(r=>[r.url,{sha256:r.sha256,bytes:r.bytes}]))},
    totalBytes:total,sourceHash:await sha(source)};
}
function transform(babel,source,file){
  try{return babel.transform(source,{filename:file,code:true,ast:false,sourceMaps:false,
    babelrc:false,configFile:false,plugins:['transform-modules-commonjs']}).code;}
  catch(cause){throw error('E_CONTROLLER_ESM_SYNTAX',String(cause?.message||cause).slice(0,300),file);}
}
export async function inspectBrowserControllerESM(input={}){
  const graph=await inspect(input);
  return Object.freeze({framework:'controller',projectId:input.projectId,sourceHash:graph.sourceHash,
    remoteRoots:graph.roots,missingUrls:graph.missing,totalBytes:graph.totalBytes,
    complete:!graph.missing.length,remoteLock:graph.lock,
    modules:graph.ordered.map(r=>({url:r.url,sha256:r.sha256,bytes:r.bytes,
      children:[...new Set(r.refs.map(x=>x.url))].sort()}))});
}
export async function prepareBrowserControllerESM(input={}){
  const graph=await inspect(input);
  if(graph.missing.length)throw error('E_REMOTE_UNLOCKED','The approved module graph is incomplete: '+graph.missing[0]);
  const lock=input.remoteLock;
  if(graph.roots.length){
    if(!plain(lock)||lock.format!=='opendesk.remote-lock.v1'||!plain(lock.modules)||
      Object.keys(lock.modules).length!==graph.ordered.length||
      graph.ordered.some(r=>!plain(lock.modules[r.url])||lock.modules[r.url].sha256!==r.sha256||lock.modules[r.url].bytes!==r.bytes))
      throw error('E_REMOTE_LOCK','Controller requires an approved exact dependency lock');
  }else if(lock&&(!plain(lock.modules)||Object.keys(lock.modules).length))
    throw error('E_REMOTE_LOCK','Controller without imports cannot reuse another dependency lock');
  const compiled=graph.ordered.map(r=>({url:r.url,code:transform(input.babel,r.code,r.url),
    refs:Object.fromEntries(r.refs.map(ref=>[ref.specifier,ref.url]))}));
  const entrySource=graph.entryHasDefault?graph.source:graph.source+'\nexport default main;';
  const entryCode=transform(input.babel,entrySource,graph.entry);
  const rootRefs=Object.fromEntries(graph.entryRefs.map(r=>[r.specifier,r.url]));
  const body=[
    '/* OpenDesk Controller ESM · frozen source graph; runtime network loading disabled */',
    'const __odESMFactories=Object.create(null),__odESMCache=Object.create(null);',
    ...compiled.map(r=>'__odESMFactories['+JSON.stringify(r.url)+']=[function(module,exports,require){\n'+r.code+'\n},'+JSON.stringify(r.refs)+'];'),
    'function __odESMLoad(id){',
    "  if(!Object.hasOwn(__odESMFactories,id))throw Error('E_REMOTE_UNLOCKED');",
    '  if(Object.hasOwn(__odESMCache,id))return __odESMCache[id].exports;',
    '  const module={exports:{}};__odESMCache[id]=module;const row=__odESMFactories[id];',
    "  const require=name=>{if(!Object.hasOwn(row[1],name))throw Error('E_REMOTE_UNLOCKED');return __odESMLoad(row[1][name]);};",
    '  row[0](module,module.exports,require);return module.exports;',
    '}',
    'const __odESMEntry=(function(){',
    '  const module={exports:{}};const refs='+JSON.stringify(rootRefs)+';',
    "  const require=name=>{if(!Object.hasOwn(refs,name))throw Error('E_REMOTE_UNLOCKED');return __odESMLoad(refs[name]);};",
    '  (function(module,exports,require){\n'+entryCode+'\n})(module,module.exports,require);',
    '  return module.exports.default;',
    '})();',
    "async function main(){if(typeof __odESMEntry!=='function')throw Error('E_CONTROLLER_ESM_ENTRY');return await __odESMEntry();}",
    ''
  ].join('\n');
  if(size(body)>MAX_COMPILED_BYTES)throw error('E_CONTROLLER_ESM_LIMIT','Compiled Controller source exceeds 48 KB; use the existing local multi-file builder');
  return Object.freeze({framework:'controller',projectId:input.projectId,entryFormat:'async-main',sourceUtf8:body,
    sourceHash:await sha(body),authoringSourceHash:graph.sourceHash,compilerVersion:input.babel.version,
    remoteLock:graph.lock,remoteModules:graph.ordered.map(({url,sha256,bytes})=>({url,sha256,bytes}))});
}
