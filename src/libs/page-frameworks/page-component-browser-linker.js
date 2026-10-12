// Browser component preparation is source-data transformation only. Remote
// module factories below become part of the admitted USER_SCRIPT source; this
// compiler never imports/evaluates user modules in the privileged Worker.
import {PAGE_FRAMEWORK_IMPORTS} from './contract.js';
import {validatePageProgramRules} from '../../scripting/user-scripts/page-program-rules.js';
import {remoteURL,validateRemoteLock,analyzeRemoteAST,REMOTE_LIMITS} from '../../scripting/user-scripts/remote-esm-contract.js';
import {digestUtf8} from '../../platform/protocol.js';
import {createPageComponentEntry} from '../../../scripts/page-component-entry.mjs';

const LIMIT=100000,MAX_AUTHORING=128*1024,MAX_UI_HELPER=49152;
const fail=(code,message,file,line,column)=>Object.assign(new Error(message),{
  code,location:{file,...(line!=null?{line}:{}),...(column!=null?{column}:{})}
});
const bytes=value=>new TextEncoder().encode(value).length;
function parse(text,{babel,file,jsx=false}){
  try{return babel.transform(text,{filename:file,code:false,ast:true,babelrc:false,
    configFile:false,parserOpts:{sourceType:'module',plugins:jsx?['jsx']:[]}}).ast;}
  catch(error){throw fail('E_PAGE_COMPONENT_SYNTAX',error.message,file,error.loc?.line,error.loc?.column);}
}
function bodyOf(ast){return ast.program?.body||ast.body;}
function checkDynamic(ast,file){
  let visited=0;
  const dynamic=callee=>{
    if(callee?.type==='Identifier')return ['eval','require','Function','AsyncFunction'].includes(callee.name);
    if(callee?.type!=='MemberExpression'||!['globalThis','window','self'].includes(callee.object?.name))return false;
    return ['eval','require','Function','AsyncFunction'].includes(callee.computed?callee.property?.value:callee.property?.name);
  };
  function visit(node,functionDepth=0){
    if(!node||typeof node!=='object')return;
    if(++visited>50000)throw fail('E_PAGE_COMPONENT_LIMIT','Component/module AST is too large',file);
    const nextDepth=functionDepth+Number(/Function|Method/.test(node.type||''));
    if(node.type==='ImportExpression'||node.type==='CallExpression'&&(node.callee?.type==='Import'||dynamic(node.callee))||
       node.type==='NewExpression'&&dynamic(node.callee)||node.type==='MetaProperty'||
       (node.type==='AwaitExpression'||node.type==='ForOfStatement'&&node.await)&&functionDepth===0)
      throw fail('E_PAGE_COMPONENT_DYNAMIC','Dynamic imports, eval, require, module metadata and top-level await are unavailable',file,node.loc?.start?.line,node.loc?.start?.column);
    for(const [key,value] of Object.entries(node)){
      if(['loc','start','end','extra','leadingComments','trailingComments','comments'].includes(key))continue;
      if(Array.isArray(value))value.forEach(child=>visit(child,nextDepth));
      else if(value&&typeof value==='object')visit(value,nextDepth);
    }
  }
  visit(ast);
}
function staticRows(ast){return bodyOf(ast).filter(row=>row.type==='ImportDeclaration'||row.type==='ExportAllDeclaration'||row.type==='ExportNamedDeclaration'&&row.source);}
function requestedNames(row){return (row.specifiers||[]).flatMap(member=>{
  const name=member.type==='ImportDefaultSpecifier'?'default':
    member.imported?.name??member.imported?.value??member.local?.name??member.local?.value;
  return member.type==='ImportNamespaceSpecifier'||member.type==='ExportNamespaceSpecifier'?[]:name?[name]:[];
});}
function componentReferences(ast,framework,file){
  checkDynamic(ast,file);
  if(!bodyOf(ast).some(row=>row.type==='ExportDefaultDeclaration'))
    throw fail('E_PAGE_COMPONENT_ENTRY','A default component export is required',file);
  const refs=[];
  for(const row of staticRows(ast)){
    const spec=row.source?.value,allowed=PAGE_FRAMEWORK_IMPORTS[framework]?.[spec];
    if(allowed){
      for(const name of requestedNames(row))if(name!=='default'&&!allowed.includes(name))
        throw fail('E_PAGE_FRAMEWORK_EXPORT','Unavailable '+spec+' export: '+name,file,row.loc?.start?.line,row.loc?.start?.column);
      continue;
    }
    if(typeof spec!=='string'||!spec.startsWith('https:'))
      throw fail('E_PAGE_COMPONENT_IMPORT','Use the fixed '+framework+' runtime or a prepared static HTTPS module',file,row.loc?.start?.line,row.loc?.start?.column);
    refs.push({specifier:spec,url:remoteURL(spec),requested:requestedNames(row)});
  }
  return refs;
}
function namesFromPattern(node,out){
  if(!node)return;
  if(node.type==='Identifier')out.add(node.name);
  else if(node.type==='ObjectPattern')for(const property of node.properties)namesFromPattern(property.value||property.argument,out);
  else if(node.type==='ArrayPattern')node.elements.forEach(child=>namesFromPattern(child,out));
  else if(node.type==='RestElement')namesFromPattern(node.argument,out);
  else if(node.type==='AssignmentPattern')namesFromPattern(node.left,out);
}
function directExports(ast){
  const names=new Set();
  for(const row of bodyOf(ast)){
    if(row.type==='ExportDefaultDeclaration')names.add('default');
    if(row.type==='ExportNamedDeclaration'){
      for(const specifier of row.specifiers||[])names.add(specifier.exported?.name??specifier.exported?.value);
      const declaration=row.declaration;
      if(declaration?.type==='VariableDeclaration')for(const item of declaration.declarations)namesFromPattern(item.id,names);
      else if(declaration?.id)names.add(declaration.id.name);
    }
    if(row.type==='ExportAllDeclaration'&&row.exported)names.add(row.exported.name??row.exported.value);
  }
  return names;
}
function validateIdentity(framework,projectId,babel){
  if(!['react','vue'].includes(framework)||typeof projectId!=='string'||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(projectId)||
    !babel||typeof babel.transform!=='function'||babel.version!=='7.29.9')
    throw fail('E_PAGE_COMPONENT_IDENTITY','Invalid framework, project or pinned compiler','component');
}
async function componentText({componentSource,framework,projectId,babel,transformSFC}){
  validateIdentity(framework,projectId,babel);
  const entry='src/App.'+(framework==='react'?'jsx':'vue');
  if(typeof componentSource!=='string'||!componentSource.trim()||bytes(componentSource)>MAX_AUTHORING)
    throw fail('E_PAGE_COMPONENT_LIMIT','Empty or excessive component source',entry);
  let script=componentSource,css='',scopeId;
  if(framework==='vue'){
    if(typeof transformSFC!=='function')throw fail('E_PAGE_COMPONENT_COMPILER','Vue SFC compiler unavailable',entry);
    const converted=await transformSFC({sourceUtf8:componentSource,file:entry,projectId});
    script=converted.code;css=converted.css||'';scopeId=converted.scopeId;
  }
  const ast=parse(script,{babel,file:entry,jsx:framework==='react'});
  return {entry,script,css,scopeId,refs:componentReferences(ast,framework,entry)};
}
async function inspectGraph({componentSource,framework,projectId,babel,transformSFC,remoteModules=[]}){
  const component=await componentText({componentSource,framework,projectId,babel,transformSFC});
  if(!Array.isArray(remoteModules)||remoteModules.length>REMOTE_LIMITS.modules)
    throw fail('E_REMOTE_LIMIT','At most 32 pinned modules may be prepared in the browser',component.entry);
  const sources=new Map();let totalBytes=0;
  for(const row of remoteModules){
    if(!row||typeof row.code!=='string'||!Number.isInteger(row.bytes)||row.bytes<1||row.bytes>REMOTE_LIMITS.moduleBytes||
       !/^[a-f0-9]{64}$/.test(row.sha256)||remoteURL(row.url)!==row.url||sources.has(row.url))
      throw fail('E_REMOTE_LOCK','Invalid or duplicate remote module data',component.entry);
    if(bytes(row.code)!==row.bytes||await digestUtf8(row.code)!==row.sha256)
      throw fail('E_REMOTE_HASH','Pinned module bytes changed: '+row.url,row.url);
    totalBytes+=row.bytes;
    if(totalBytes>REMOTE_LIMITS.totalBytes)throw fail('E_REMOTE_LIMIT','浏览器源码准备整图上限 256 KiB（最多 32 个模块）；更大依赖请使用已构建并冻结的 JSON 项目',row.url);
    const ast=parse(row.code,{babel,file:row.url});
    checkDynamic(ast,row.url);
    // A requested module must actually expose ESM syntax; a UMD distribution
    // is not accepted merely because a parser permits script text in a module.
    if(!bodyOf(ast).some(node=>/^Import|^Export/.test(node.type)))
      throw fail('E_REMOTE_ESM','The remote file has no ESM imports or exports: '+row.url,row.url);
    const graph=analyzeRemoteAST(ast,row.url),rows=staticRows(ast);
    sources.set(row.url,{...row,ast,children:graph.children,refs:rows.map((ref,index)=>({
      specifier:ref.source.value,url:graph.refs[index].url,requested:requestedNames(ref),
      star:ref.type==='ExportAllDeclaration'&&!ref.exported
    })),exports:directExports(ast)});
  }
  const roots=[...new Set(component.refs.map(row=>row.url))].sort(),seen=new Set(),missing=new Set(),todo=[...roots];
  while(todo.length){
    const url=todo.shift();if(seen.has(url))continue;seen.add(url);
    if(seen.size>REMOTE_LIMITS.modules)throw fail('E_REMOTE_LIMIT','浏览器源码准备最多 32 个模块、整图 256 KiB；更大依赖请使用已构建并冻结的 JSON 项目',url);
    const row=sources.get(url);if(!row){missing.add(url);continue;}
    for(const child of row.children)if(!seen.has(child))todo.push(child);
  }
  if([...sources.keys()].some(url=>!seen.has(url)))throw fail('E_REMOTE_GRAPH','Snapshot contains an unrelated remote module',component.entry);
  if(!missing.size){
    // Resolve export-star names without evaluating modules. Named/default
    // imports missing from the full frozen graph fail before Page admission.
    for(let round=0;round<=sources.size;round++){
      let changed=false;
      for(const row of sources.values())for(const ref of row.refs.filter(ref=>ref.star))
        for(const name of sources.get(ref.url).exports)if(name!=='default'&&!row.exports.has(name)){row.exports.add(name);changed=true;}
      if(!changed)break;
    }
    for(const [owner,refs] of [[component.entry,component.refs],...[...sources].map(([url,row])=>[url,row.refs])])
      for(const ref of refs)for(const name of ref.requested)
        if(!sources.get(ref.url)?.exports.has(name))throw fail('E_REMOTE_EXPORT','Unavailable export '+name+' from '+ref.url,owner);
  }
  const ordered=[...sources.values()].sort((a,b)=>a.url.localeCompare(b.url));
  const lock={format:'opendesk.remote-lock.v1',modules:Object.fromEntries(ordered.map(row=>[row.url,{sha256:row.sha256,bytes:row.bytes}]))};
  return {component,roots,missing:[...missing].sort(),ordered,lock,totalBytes,sourceHash:await digestUtf8(componentSource)};
}
export async function inspectBrowserPageComponent(input={}){
  const graph=await inspectGraph(input);
  return Object.freeze({framework:input.framework,projectId:input.projectId,entry:graph.component.entry,
    sourceHash:graph.sourceHash,remoteRoots:graph.roots,missingUrls:graph.missing,
    totalBytes:graph.totalBytes,complete:!graph.missing.length,
    remoteLock:graph.lock,modules:graph.ordered.map(row=>({url:row.url,sha256:row.sha256,bytes:row.bytes,children:row.children}))});
}
function compile(babel,text,file,jsx=false){
  try{return babel.transform(text,{filename:file,sourceMaps:true,code:true,ast:false,
    babelrc:false,configFile:false,plugins:[...(jsx?[['transform-react-jsx',{runtime:'classic',
      pragma:'globalThis.OpenDeskPageReact.createElement',pragmaFrag:'globalThis.OpenDeskPageReact.Fragment'}]]:[]),'transform-modules-commonjs']});}
  catch(error){throw fail('E_PAGE_COMPONENT_SYNTAX',error.message,file,error.loc?.line,error.loc?.column);}
}
function header(project){
  const timing={document_start:'document-start',document_end:'document-end',document_idle:'document-idle'},rules=project.pageRules;
  return ['// ==UserScript==','// @name '+project.id,'// @version 0.0.1',...rules.matches.map(s=>'// @match '+s),
    ...rules.excludeMatches.map(s=>'// @exclude-match '+s),'// @run-at '+timing[rules.runAt],...(!rules.allFrames?['// @noframes']:[]),
    '// @opendesk-lib '+project.framework,'// ==/UserScript==',''].join('\n');
}
export async function prepareBrowserPageComponent(input={}){
  const {componentSource,framework,projectId,pageRules,babel,transformSFC,uiHelperSource,remoteLock,remoteModules=[]}=input;
  const graph=await inspectGraph({componentSource,framework,projectId,babel,transformSFC,remoteModules});
  const {entry,script,css,scopeId}=graph.component;
  if(graph.missing.length)throw fail('E_REMOTE_UNLOCKED','请先点击「准备依赖」确认并固定 HTTPS 模块：'+graph.missing[0],entry);
  if(graph.roots.length){
    if(!remoteLock)throw fail('E_REMOTE_UNLOCKED','请先确认固定远端依赖版本',entry);
    const validated=validateRemoteLock(remoteLock);
    if(Object.keys(validated.modules).length!==Object.keys(graph.lock.modules).length||
      Object.entries(graph.lock.modules).some(([url,row])=>validated.modules[url]?.sha256!==row.sha256||validated.modules[url]?.bytes!==row.bytes))
      throw fail('E_REMOTE_LOCK','Approved remote lock does not match the complete source graph',entry);
  }else if(remoteLock&&Object.keys(validateRemoteLock(remoteLock).modules).length)
    throw fail('E_REMOTE_LOCK','Component does not declare the supplied remote graph',entry);
  if(typeof uiHelperSource!=='string'||!uiHelperSource.includes('__opendeskPageUIR243')||
    !uiHelperSource.includes('createPageUI')||bytes(uiHelperSource)>MAX_UI_HELPER)
    throw fail('E_PAGE_COMPONENT_HELPER','Trusted UI helper not available',entry);
  const rules=validatePageProgramRules(pageRules),project={runtimeKind:'page-userscript',entryMode:'component',id:projectId,entry,framework,pageRules:rules};
  const app=compile(babel,script,entry,framework==='react');
  const generated=createPageComponentEntry(project,{componentStyles:css?[{path:entry,css,scopeId}]:[]});
  const wrapper=compile(babel,generated,'opendesk-generated-entry.js');
  const modules=graph.ordered.map(row=>({url:row.url,code:compile(babel,row.code,row.url).code,
    refs:Object.fromEntries(row.refs.map(ref=>[ref.specifier,ref.url]))}));
  const moduleFactories=modules.map(row=>'  __factories['+JSON.stringify(row.url)+']=[function(module,exports,require){\n'+row.code+'\n},'+JSON.stringify(row.refs)+'];').join('\n');
  const moduleMap=Object.fromEntries(graph.component.refs.map(ref=>[ref.specifier,ref.url]));
  const remoteProgram=graph.roots.length?[
    '// Fixed HTTPS ESM '+JSON.stringify(graph.lock),
    ';const __odRequireRemoteR243=(function(){',
    '  const __factories=Object.create(null),__cache=Object.create(null);',moduleFactories,
    '  function load(id){',
    "    if(!Object.hasOwn(__factories,id))throw new Error('E_REMOTE_UNLOCKED');",
    '    if(Object.hasOwn(__cache,id))return __cache[id].exports;',
    '    const module={exports:{}};__cache[id]=module;const row=__factories[id];',
    "    const require=name=>{if(!Object.hasOwn(row[1],name))throw new Error('E_REMOTE_UNLOCKED');return load(row[1][name]);};",
    '    row[0](module,module.exports,require);return module.exports;',
    '  }return load;',
    '})();'
  ]:[];
  const program=[header(project),uiHelperSource,...remoteProgram,
    ';const __odComponentR243=(function(){',
    graph.roots.length?'  const exports={},remotes='+JSON.stringify(moduleMap)+';':'  const exports={};',
    '  const require=function(name){',
    "    if(name==='react'||name==='react-dom/client'||name==='react/jsx-runtime')return globalThis.OpenDeskPageReact;",
    "    if(name==='vue')return globalThis.OpenDeskPageVue;",
    ...(graph.roots.length?['    if(Object.hasOwn(remotes,name))return __odRequireRemoteR243(remotes[name]);']:[]),
    "    throw new Error('E_PAGE_COMPONENT_IMPORT');",
    '  };','  (function(exports,require){',app.code,'  })(exports,require);','  return exports;','})();',
    'const __odEntryR243=(function(){','  const exports={};','  const require=function(name){',
    "    if(name==='./"+entry+"')return __odComponentR243;",
    "    if(name==='@opendesk/ui')return __opendeskPageUIR243;",
    "    if(name==='react'||name==='react-dom/client'||name==='react/jsx-runtime')return globalThis.OpenDeskPageReact;",
    "    if(name==='vue')return globalThis.OpenDeskPageVue;",
    "    throw new Error('E_PAGE_COMPONENT_IMPORT');",'  };',
    '  (function(exports,require){',wrapper.code,'  })(exports,require);','  return exports;','})();',
    'async function main(){return await __odEntryR243.default();}',''
  ].join('\n');
  if(bytes(program)>LIMIT)throw fail('E_PAGE_COMPONENT_LIMIT','浏览器组件链接结果超过 100 KB 上限；请缩小导入范围，或导入已构建并冻结的 JSON 项目',entry);
  return Object.freeze({sourceUtf8:program,entryFormat:'async-main',framework,entry,projectId,cssBytes:bytes(css),
    remoteModules:graph.ordered.map(({url,sha256,bytes})=>({url,sha256,bytes})),remoteLock:graph.lock,
    sourceMap:{app:app.map,generated:wrapper.map},compilerVersion:babel.version});
}
