// R24.3 single-component browser preparation as PURE DATA: no user source
// execution, no Chrome API, no permission grant and no alternative Page runtime.
import {PAGE_FRAMEWORK_IMPORTS} from './contract.js';
import {validatePageProgramRules} from '../../scripting/user-scripts/page-program-rules.js';
import {createPageComponentEntry} from '../../../scripts/page-component-entry.mjs';

const LIMIT=100000,MAX_AUTHORING=128*1024,MAX_UI_HELPER=49152;
const fail=(code,message,file,line,column)=>Object.assign(new Error(message),{
  code,location:{file,...(line!=null?{line}:{}),...(column!=null?{column}:{})}
});
const bytes=value=>new TextEncoder().encode(value).length;

function parseAndCheck(text,{babel,file,framework,jsx=false}){
  let ast;
  try{
    ast=babel.transform(text,{filename:file,code:false,ast:true,babelrc:false,
      configFile:false,parserOpts:{sourceType:'module',plugins:jsx?['jsx']:[]}}).ast;
  }catch(error){throw fail('E_PAGE_COMPONENT_SYNTAX',error.message,file,error.loc?.line,error.loc?.column);}
  const available=PAGE_FRAMEWORK_IMPORTS[framework];
  let defaultExport=false,visited=0;
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(++visited>50000)throw fail('E_PAGE_COMPONENT_LIMIT','Component AST is too large',file);
    if(node.type==='ImportExpression'||
      node.type==='CallExpression'&&(node.callee?.type==='Import'||
        ['eval','require','Function','AsyncFunction'].includes(node.callee?.name))||
      node.type==='NewExpression'&&['Function','AsyncFunction'].includes(node.callee?.name)||
      node.type==='MetaProperty')
      throw fail('E_PAGE_COMPONENT_DYNAMIC','Dynamic imports, eval, require and module metadata are unavailable',
        file,node.loc?.start?.line,node.loc?.start?.column);
    for(const [key,value] of Object.entries(node)){
      if(['loc','start','end','extra','leadingComments','trailingComments','comments'].includes(key))continue;
      if(Array.isArray(value))value.forEach(visit);
      else if(value&&typeof value==='object')visit(value);
    }
  }
  for(const row of ast.program.body){
    if(row.type==='ExportDefaultDeclaration')defaultExport=true;
    if(row.type==='ImportDeclaration'||row.type==='ExportAllDeclaration'||
       row.type==='ExportNamedDeclaration'&&row.source){
      const spec=row.source?.value,allowed=available?.[spec];
      if(!allowed)throw fail('E_PAGE_COMPONENT_IMPORT','Only fixed '+framework+' modules are supported',
        file,row.loc?.start?.line,row.loc?.start?.column);
      for(const member of row.specifiers||[]){
        const imported=member.imported?.name??member.imported?.value??
          (member.type==='ImportDefaultSpecifier'?'default':null);
        if(imported&&imported!=='default'&&!allowed.includes(imported))
          throw fail('E_PAGE_FRAMEWORK_EXPORT','Unavailable '+spec+' export: '+imported,
            file,member.loc?.start?.line,member.loc?.start?.column);
      }
    }
    visit(row);
  }
  if(!defaultExport)throw fail('E_PAGE_COMPONENT_ENTRY','A default component export is required',file);
}
function compile(babel,text,file,jsx=false){
  try{
    return babel.transform(text,{filename:file,sourceMaps:true,code:true,ast:false,
      babelrc:false,configFile:false,
      plugins:[...(jsx?[['transform-react-jsx',{runtime:'classic',
        pragma:'globalThis.OpenDeskPageReact.createElement',
        pragmaFrag:'globalThis.OpenDeskPageReact.Fragment'}]]:[]),
        'transform-modules-commonjs']});
  }catch(error){throw fail('E_PAGE_COMPONENT_SYNTAX',error.message,file,error.loc?.line,error.loc?.column);}
}
function header(project){
  const timing={document_start:'document-start',document_end:'document-end',document_idle:'document-idle'};
  const rules=project.pageRules;
  return ['// ==UserScript==','// @name '+project.id,'// @version 0.0.1',
    ...rules.matches.map(s=>'// @match '+s),
    ...rules.excludeMatches.map(s=>'// @exclude-match '+s),
    '// @run-at '+timing[rules.runAt],...(!rules.allFrames?['// @noframes']:[]),
    '// @opendesk-lib '+project.framework,'// ==/UserScript==',''].join('\n');
}
export async function prepareBrowserPageComponent({
  componentSource,framework,projectId,pageRules,babel,transformSFC,uiHelperSource
}={}){
  if(!['react','vue'].includes(framework)||typeof projectId!=='string'||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(projectId)||
    !babel||typeof babel.transform!=='function'||babel.version!=='7.29.9')
    throw fail('E_PAGE_COMPONENT_IDENTITY','Invalid framework, project or pinned compiler','component');
  const entry='src/App.'+(framework==='react'?'jsx':'vue');
  if(typeof componentSource!=='string'||!componentSource.trim()||bytes(componentSource)>MAX_AUTHORING)
    throw fail('E_PAGE_COMPONENT_LIMIT','Empty or excessive component source',entry);
  if(typeof uiHelperSource!=='string'||!uiHelperSource.includes('__opendeskPageUIR243')||
     !uiHelperSource.includes('createPageUI')||bytes(uiHelperSource)>MAX_UI_HELPER)
    throw fail('E_PAGE_COMPONENT_HELPER','Trusted UI helper not available',entry);
  const rules=validatePageProgramRules(pageRules);
  const project={runtimeKind:'page-userscript',entryMode:'component',
    id:projectId,entry,framework,pageRules:rules};
  let script=componentSource,css='',scopeId;
  if(framework==='vue'){
    if(typeof transformSFC!=='function')
      throw fail('E_PAGE_COMPONENT_COMPILER','Vue SFC compiler unavailable',entry);
    const converted=await transformSFC({sourceUtf8:componentSource,file:entry,projectId});
    script=converted.code;css=converted.css||'';scopeId=converted.scopeId;
  }
  parseAndCheck(script,{babel,file:entry,framework,jsx:framework==='react'});
  const app=compile(babel,script,entry,framework==='react');
  const generated=createPageComponentEntry(project,{componentStyles:css?[{path:entry,css,scopeId}]:[]});
  const wrapper=compile(babel,generated,'opendesk-generated-entry.js');
  const program=[
    header(project),uiHelperSource,
    ';const __odComponentR243=(function(){',
    '  const exports={};',
    '  const require=function(name){',
    "    if(name==='react'||name==='react-dom/client'||name==='react/jsx-runtime')return globalThis.OpenDeskPageReact;",
    "    if(name==='vue')return globalThis.OpenDeskPageVue;",
    "    throw new Error('E_PAGE_COMPONENT_IMPORT');",
    '  };',
    '  (function(exports,require){',app.code,'  })(exports,require);',
    '  return exports;',
    '})();',
    'const __odEntryR243=(function(){',
    '  const exports={};',
    '  const require=function(name){',
    "    if(name==='./"+entry+"')return __odComponentR243;",
    "    if(name==='@opendesk/ui')return __opendeskPageUIR243;",
    "    if(name==='react'||name==='react-dom/client'||name==='react/jsx-runtime')return globalThis.OpenDeskPageReact;",
    "    if(name==='vue')return globalThis.OpenDeskPageVue;",
    "    throw new Error('E_PAGE_COMPONENT_IMPORT');",
    '  };',
    '  (function(exports,require){',wrapper.code,'  })(exports,require);',
    '  return exports;',
    '})();',
    'async function main(){return await __odEntryR243.default();}',''
  ].join('\n');
  if(bytes(program)>LIMIT)
    throw fail('E_PAGE_COMPONENT_LIMIT','Compiled Page exceeds the 100 KB budget',entry);
  return Object.freeze({sourceUtf8:program,entryFormat:'async-main',framework,entry,
    projectId,cssBytes:bytes(css),
    sourceMap:{app:app.map,generated:wrapper.map},
    compilerVersion:babel.version});
}
