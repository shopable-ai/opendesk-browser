import {parse} from 'acorn';

// Pure syntax policy shared by the manager and offline compiler. No downloads,
// evaluation or rewriting of the original source bytes happens here.
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
const ensure = (yes,code,message) => { if (!yes) fail(code,message); };
export const STATIC_ESM_WORLDS = Object.freeze({'esm-page':'USER_SCRIPT','esm-controller':'CONTROLLER'});
export const STATIC_ESM_LIMITS = Object.freeze({modules:16,moduleBytes:128*1024});
const credentialParam = /^(?:token|access_token|refresh_token|id_token|auth|authorization|api_?key|secret|client_secret|password|passwd|jwt|session_?token|signature|sig|key|(?:x_amz|x_goog)_signature)$/i;

export function staticESMUrl(value) {
  ensure(typeof value==='string' && value.length<=2048 && /^https:\/\//i.test(value) && !/[\u0000-\u0020\\]/.test(value),
    'E_DEPENDENCY_URL','静态 import 必须使用公共 HTTPS 绝对 URL');
  let url; try { url=new URL(value); } catch { fail('E_DEPENDENCY_URL','静态 import URL 不合法'); }
  const host=url.hostname.toLowerCase(),authority=value.split('/')[2];
  // Match public build-time ESM URL policy. Browser DNS remains browser-managed,
  // exactly as in the existing explicitly authorized HTTPS downloader.
  ensure(![...url.searchParams.keys()].some(name=>credentialParam.test(name.replaceAll('-','_'))),
    'E_DEPENDENCY_URL','静态 import URL 不接受凭证查询参数');
  ensure(url.protocol==='https:' && !url.username && !url.password && !url.port && !authority.includes(':') && !url.hash &&
    host.includes('.') && !host.endsWith('.') && !/^\[|^\d+(?:\.\d+){0,3}$/.test(host) &&
    !/^(?:localhost|localhost\.)$|\.(?:localhost|local|internal|test|invalid)$|(?:^|\.)home\.arpa$/.test(host) && url.pathname!=='/',
    'E_DEPENDENCY_URL','静态 import 仅接受无账户、端口或片段的公共 HTTPS 主机');
  return url.href;
}

function parseModule(sourceUtf8) {
  ensure(typeof sourceUtf8==='string','E_SOURCE','ESM 源码必须为原始 UTF-8 字符串');
  const comments=[];
  let ast;
  try { ast=parse(sourceUtf8,{ecmaVersion:'latest',sourceType:'module',onComment:comments}); }
  catch(error) { fail('E_ESM_SYNTAX','源码必须是合法的普通 ESM JavaScript：'+error.message); }
  ensure(!comments.some(row=>/(?:^|\n)\s*(?:\*\s*)?@require\b/i.test(row.value)),
    'E_ESM_REQUIRE','静态 import 不能与 @require 混用');
  return ast;
}

const functions = new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
const codeGenerators = new Set(['eval','Function','AsyncFunction','GeneratorFunction','AsyncGeneratorFunction','require']);
function staticString(node) {
  if(node?.type==='Literal' && typeof node.value==='string') return node.value;
  if(node?.type==='BinaryExpression' && node.operator==='+') {
    const left=staticString(node.left),right=staticString(node.right);
    if(left!==undefined && right!==undefined) return left+right;
  }
  if(node?.type==='TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
}
function checkSyntax(ast,{leaf=false}={}) {
  const walk=(node,depth=0)=>{
    if(!node || typeof node.type!=='string') return;
    ensure(node.type!=='ImportExpression','E_ESM_DYNAMIC','不支持动态 import()');
    ensure(!(node.type==='MetaProperty' && node.meta.name==='import'),'E_ESM_META','不支持 import.meta');
    ensure(!(depth===0 && (node.type==='AwaitExpression' || node.type==='ForOfStatement' && node.await)),
      'E_ESM_TLA','不支持顶层 await');
    if(leaf) {
      const reflective=new Set(['Reflect','__proto__','getPrototypeOf','getOwnPropertyDescriptor','getOwnPropertyDescriptors']);
      const computed=node.type==='MemberExpression'&&node.computed||node.type==='Property'&&node.computed;
      ensure(!computed&&!(node.type==='Identifier'&&reflective.has(node.name)),
        'E_ESM_EVAL','普通草稿依赖不支持计算成员访问或反射构造器；请改用审核后的本地项目');
      ensure(node.type!=='ImportDeclaration' && !(['ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) && node.source),
        'E_ESM_GRAPH','依赖必须是没有二级 import 或 reexport 的独立 leaf ESM');
      const member=node.type==='MemberExpression' ? (node.computed?staticString(node.property):node.property.name) :
        node.type==='Property' ? (node.key.name??staticString(node.key)) : null;
      ensure(!(node.type==='Identifier' && codeGenerators.has(node.name)) && !codeGenerators.has(member) && member!=='constructor',
        'E_ESM_EVAL','依赖不能引用 eval、Function、require 或动态代码构造器');
      ensure(!reflective.has(member),'E_ESM_EVAL','依赖不支持反射构造器属性');
    }
    const nextDepth=depth+(functions.has(node.type)?1:0);
    for(const value of Object.values(node)) {
      if(Array.isArray(value)) { for(const child of value) walk(child,nextDepth); }
      else if(value && typeof value==='object') walk(value,nextDepth);
    }
  };
  walk(ast);
}

export function parseStaticESMSource(sourceUtf8) {
  const ast=parseModule(sourceUtf8);
  checkSyntax(ast);
  const requires=[],mains=[];
  for(const node of ast.body) {
    if(node.type==='ImportDeclaration') {
      const originalUrl=node.source.value,url=staticESMUrl(originalUrl);
      requires.push({order:requires.length,raw:originalUrl,originalUrl,url,integrity:[]});
    } else if(node.type.startsWith('Export')) {
      ensure(node.type==='ExportDefaultDeclaration' && node.declaration.type==='FunctionDeclaration',
        'E_ESM_ENTRY','仅支持 export default async function main() 或 async function main() 入口');
      mains.push(node.declaration);
    } else if(node.type==='FunctionDeclaration' && node.id?.name==='main') mains.push(node);
  }
  ensure(requires.length<=64 && new Set(requires.map(row=>row.url)).size<=STATIC_ESM_LIMITS.modules,
    'E_DEPENDENCY_LIMIT','最多支持 16 个独立模块、64 个静态依赖声明');
  ensure(mains.length===1 && mains[0].id?.name==='main' && mains[0].async && !mains[0].generator && mains[0].params.length===0,
    'E_ESM_ENTRY','ESM 草稿必须提供唯一零参数 async function main() 入口');
  return {ast,requires,entry:mains[0]};
}

export function assertStaticESMLeaf(sourceUtf8) {
  const ast=parseModule(sourceUtf8);
  ensure(ast.body.some(node=>node.type.startsWith('Export')),'E_ESM_EXPORT','依赖必须有真实 ESM export；不支持 UMD 自动转换');
  checkSyntax(ast,{leaf:true});
  const names=[];
  for(const node of ast.body) {
    if(node.type==='ExportDefaultDeclaration') names.push('default');
    if(node.type==='ExportNamedDeclaration') {
      names.push(...node.specifiers.map(row=>row.exported.name ?? row.exported.value));
      const declaration=node.declaration;
      if(declaration?.type==='VariableDeclaration') for(const row of declaration.declarations) {
        ensure(row.id.type==='Identifier','E_ESM_EXPORT','普通草稿模块暂不支持解构导出');
        names.push(row.id.name);
      }
      else if(declaration?.id) names.push(declaration.id.name);
    }
  }
  ensure(names.length>0,'E_ESM_EXPORT','依赖必须有真实 ESM export；不支持 UMD 自动转换');
  ensure(!names.includes('__esModule'),'E_ESM_EXPORT','普通草稿模块不支持保留导出 __esModule');
  return {ast,exports:names};
}
