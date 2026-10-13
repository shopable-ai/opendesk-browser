// Source-data transformation only. Dependencies are evaluated by the existing
// Controller / USER_SCRIPT executor after an independent explicit Run.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const size=value=>new TextEncoder().encode(value).length;
const MAX_SOURCE=128*1024,MAX_OUTPUT=100000,MAX_MODULES=16;
function analyze(babel,source,file,{entry=false}={}){
  let ast;
  try{ast=babel.transform(source,{filename:file,code:false,ast:true,babelrc:false,configFile:false,
    parserOpts:{sourceType:'module'}}).ast.program;}
  catch(error){fail('E_STATIC_ESM_SYNTAX',String(error.message).slice(0,400));}
  const imports=[],exports=new Set();let main=null,hasDefault=false,nodes=0;
  const visit=(node,depth=0)=>{
    if(!node||typeof node!=='object')return;
    if(++nodes>80000)fail('E_STATIC_ESM_LIMIT','模块语法树超出预算');
    const functionNode=/Function|Method/.test(node.type||'');
    if(node.type==='ImportExpression'||node.type==='MetaProperty'&&node.meta?.name==='import'||
      node.type==='CallExpression'&&node.callee?.type==='Import')fail('E_STATIC_ESM_DYNAMIC','草稿不支持动态 import 或 import.meta');
    const banned=new Set(['eval','Function','AsyncFunction','GeneratorFunction','AsyncGeneratorFunction','require','Reflect','__proto__','getPrototypeOf','getOwnPropertyDescriptor','getOwnPropertyDescriptors']);
    const member=/MemberExpression$/.test(node.type||''),property=node.type==='ObjectProperty';
    const propertyName=member?(node.computed?node.property?.value:node.property?.name):property?(node.key?.name??node.key?.value):null;
    if(node.type==='Identifier'&&banned.has(node.name)||banned.has(propertyName)||propertyName==='constructor'||
      !entry&&(member||property)&&node.computed)fail('E_STATIC_ESM_DYNAMIC','模块不支持反射构造器或计算成员访问');
    const callee=node.callee;
    const target=callee?.type==='Identifier'?callee.name:
      callee?.type==='MemberExpression'&&['globalThis','window','self'].includes(callee.object?.name)?
        (callee.computed?callee.property?.value:callee.property?.name):null;
    if(['CallExpression','NewExpression'].includes(node.type)&&['require','eval','Function','AsyncFunction'].includes(target))
      fail('E_STATIC_ESM_DYNAMIC','模块不能使用运行时代码生成或 CommonJS require');
    if((node.type==='AwaitExpression'||node.type==='ForOfStatement'&&node.await)&&depth===0)
      fail('E_STATIC_ESM_ASYNC','草稿不支持顶层 await；请使用本地项目');
    for(const [key,value] of Object.entries(node)){
      if(['loc','start','end','extra','comments','leadingComments','trailingComments'].includes(key))continue;
      if(Array.isArray(value))value.forEach(child=>visit(child,depth+(functionNode?1:0)));
      else if(value&&typeof value==='object')visit(value,depth+(functionNode?1:0));
    }
  };
  for(const row of ast.body){
    if(row.type==='ImportDeclaration'){
      if(!entry)fail('E_STATIC_ESM_GRAPH','普通草稿仅支持独立 ESM 模块；含二级依赖的模块请使用本地项目');
      const rawUrl=row.source.value;
      if(typeof rawUrl!=='string'||!/^https:\/\//i.test(rawUrl))fail('E_STATIC_ESM_URL','草稿静态 import 必须声明公共 HTTPS URL');
      let url;try{url=new URL(rawUrl).href;}catch{fail('E_STATIC_ESM_URL','无效 HTTPS import URL');}
      if(row.attributes?.length||row.assertions?.length)fail('E_STATIC_ESM_IMPORT','不支持 import attributes');
      imports.push({url,rawUrl,names:(row.specifiers||[]).map(spec=>spec.type==='ImportDefaultSpecifier'?'default':
        spec.type==='ImportNamespaceSpecifier'?null:spec.imported.name??spec.imported.value).filter(name=>name!==null)});
    }
    if(row.type==='ExportAllDeclaration'||row.type==='ExportNamedDeclaration'&&row.source)
      fail('E_STATIC_ESM_GRAPH','普通草稿不支持转导出依赖图；请使用本地项目');
    if(row.type==='ExportDefaultDeclaration'){
      hasDefault=true;exports.add('default');if(entry)main=row.declaration;
    }
    if(row.type==='ExportNamedDeclaration'){
      if(entry)fail('E_STATIC_ESM_ENTRY','草稿入口仅导出 default main');
      const declaration=row.declaration;
      if(declaration?.id)exports.add(declaration.id.name);
      for(const item of declaration?.declarations||[]){
        if(item.id.type!=='Identifier')fail('E_STATIC_ESM_EXPORT','草稿模块暂不支持解构导出');
        exports.add(item.id.name);
      }
      for(const item of row.specifiers||[])exports.add(item.exported.name??item.exported.value);
    }
    if(entry&&row.type==='FunctionDeclaration'&&row.id?.name==='main'){
      if(main)fail('E_STATIC_ESM_ENTRY','草稿只能声明一个 main');main=row;
    }
    visit(row);
  }
  if(entry){
    if(!main||main.type!=='FunctionDeclaration'||!main.async||main.generator||main.params.length||main.id?.name!=='main')
      fail('E_STATIC_ESM_ENTRY','请使用零参数 async function main() 或 export default async function main()');
  }else if(!exports.size)fail('E_STATIC_ESM_MODULE','资源没有 ESM 导出；传统全局/UMD 库请使用 @require 或审核后的本地适配');
  return {imports,exports,hasDefault};
}
export function compileStaticESM({sourceUtf8,entries,sourceFormat,babel}={}){
  if(!['esm-page','esm-controller'].includes(sourceFormat)||babel?.version!=='7.29.9')
    fail('E_STATIC_ESM_COMPILER','编译器或执行世界身份不匹配');
  if(typeof sourceUtf8!=='string'||size(sourceUtf8)>MAX_SOURCE||!Array.isArray(entries)||entries.length>MAX_MODULES)
    fail('E_STATIC_ESM_LIMIT','草稿或模块数量超出预算');
  const entry=analyze(babel,sourceUtf8,'opendesk-draft.js',{entry:true}),modules=new Map();
  for(const row of entries){
    if(typeof row.url!=='string'||typeof row.code!=='string'||size(row.code)>MAX_SOURCE||modules.has(row.url))
      fail('E_STATIC_ESM_INPUT','模块编译输入无效或重复');
    modules.set(row.url,{...row,profile:analyze(babel,row.code,row.url)});
  }
  if(new Set(entry.imports.map(row=>row.url)).size!==modules.size)fail('E_STATIC_ESM_INPUT','批准模块与入口声明数量不匹配');
  for(const row of entry.imports){
    const module=modules.get(row.url);
    if(!module)fail('E_STATIC_ESM_INPUT','缺少已批准的入口模块');
    for(const name of row.names)if(!module.profile.exports.has(name))fail('E_STATIC_ESM_EXPORT','模块没有声明导出：'+name);
  }
  const transform=(source,file)=>babel.transform(source,{filename:file,ast:false,code:true,babelrc:false,configFile:false,
    plugins:[['transform-modules-commonjs',{importInterop:'none',strictMode:true}]]}).code;
  const rows=['async function main(){','  const __odModules=Object.create(null);'];
  // Static module closures are code in the output, never eval/Function strings.
  for(const url of new Set(entry.imports.map(row=>row.url))){
    const module=modules.get(url);
    rows.push('  {const exports=Object.create(null);','    (function(exports){',transform(module.code,url),
      '    })(exports);','    const namespace=Object.create(null);',
      '    for(const key of Object.getOwnPropertyNames(exports))Object.defineProperty(namespace,key,{enumerable:key!=="__esModule",get:()=>exports[key]});',
      '    __odModules['+JSON.stringify(url)+']=Object.freeze(namespace);','  }');
  }
  for(const row of entry.imports)if(row.rawUrl!==row.url)
    rows.push('  __odModules['+JSON.stringify(row.rawUrl)+']=__odModules['+JSON.stringify(row.url)+'];');
  rows.push('  const __odEntry=(function(){','    const exports=Object.create(null);',
    '    const require=name=>{if(!Object.hasOwn(__odModules,name))throw Error("E_STATIC_ESM_INPUT");return __odModules[name];};',
    '    (function(exports,require){',transform(sourceUtf8+(entry.hasDefault?'':'\nexport default main;'),'opendesk-draft.js'),
    '    })(exports,require);','    return exports;','  })();','  return await (0,__odEntry.default)();','}');
  const output=rows.join('\n');
  if(size(output)>MAX_OUTPUT)fail('E_STATIC_ESM_LIMIT','编译后的草稿超过 100 KB；请使用本地项目');
  return {sourceUtf8:output,entryFormat:'async-main',sourceFormat,compilerVersion:babel.version};
}
