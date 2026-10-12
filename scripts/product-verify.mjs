import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parse}=require('acorn');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const matches=(left,right)=>JSON.stringify([...left].sort())===JSON.stringify([...right].sort());

export function verifyProductManifest(manifest,plan) {
  if(!manifest||manifest.manifest_version!==3)throw Error('Product is not Manifest V3');
  if(manifest.name!==plan.manifest.name||manifest.version!==plan.version||
     manifest.description!==plan.manifest.description||
     manifest.minimum_chrome_version!==plan.manifest.minimum_chrome_version)
    throw Error('Product manifest identity or version drift');
  if(!matches(manifest.permissions||[],plan.permissions))
    throw Error('Product manifest permissions differ from feature grant plan');
  if(manifest.host_permissions?.length||manifest.optional_host_permissions?.length||
     manifest.optional_permissions?.length||manifest.background||manifest.content_scripts||
     manifest.web_accessible_resources||manifest.externally_connectable||
     manifest.side_panel||manifest.options_ui||manifest.sandbox||
     manifest.devtools_page||manifest.chrome_url_overrides||manifest.key)
    throw Error('Product inherited privileged OpenDesk or unrelated extension capabilities');
  if(manifest.action?.default_title!==plan.manifest.action.default_title||
     manifest.action?.default_popup!=='popup.html'||
     Object.keys(manifest.action).some(name=>!['default_title','default_popup'].includes(name)))
    throw Error('Unexpected Page QA action surface');
  if(manifest.incognito!=='not_allowed')throw Error('Page QA incognito policy drift');
  if(manifest.content_security_policy?.extension_pages!==
    "script-src 'self'; object-src 'self'")
    throw Error('Product extension CSP drift');
  const allowed=new Set(['manifest_version','name','version','description',
    'minimum_chrome_version','permissions','action','incognito','content_security_policy',
    'host_permissions','optional_host_permissions','optional_permissions']);
  if(Object.keys(manifest).some(key=>!allowed.has(key)))
    throw Error('Unreviewed generated manifest field');
  return true;
}
function inspectBundledJs(content,path) {
  const ast=parse(content,{ecmaVersion:'latest',sourceType:'module'});
  function walk(node) {
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression')throw Error('Dynamic import in packaged product: '+path);
    if(node.type==='ImportDeclaration'&&/^(https?:|data:)/.test(node.source?.value||''))
      throw Error('Remote JS import in product: '+path);
    const callee=node.callee;
    if(['CallExpression','NewExpression'].includes(node.type)&&
      callee?.type==='Identifier'&&
      ['eval','Function','fetch','WebSocket','XMLHttpRequest','EventSource'].includes(callee.name))
      throw Error('Unreviewed code evaluation or network API in product: '+path);
    for(const value of Object.values(node)) {
      if(Array.isArray(value)){
        for(const item of value)if(item?.type)walk(item);
      } else if(value?.type) walk(value);
    }
  }
  walk(ast);
}
async function listPaths(root,at='') {
  const rows=await readdir(join(root,at),{withFileTypes:true});
  const result=[];
  for(const entry of rows){
    const name=at?at+'/'+entry.name:entry.name;
    if(entry.isDirectory())result.push(...await listPaths(root,name));
    else if(entry.isFile())result.push(name);
    else throw Error('Symlink or unknown package entry: '+name);
  }
  return result;
}
export async function verifyProduct(root,plan) {
  const paths=(await listPaths(root)).sort();
  if(!paths.includes('manifest.json')||!paths.includes('popup.html')||paths.length<3)
    throw Error('Missing product popup or manifest');
  if(paths.some(name=>!['manifest.json','popup.html'].includes(name)&&
      !/^assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(name)))
    throw Error('Unapproved Page QA package file');
  const rawManifest=await readFile(join(root,'manifest.json'),'utf8');
  verifyProductManifest(JSON.parse(rawManifest),plan);
  const html=await readFile(join(root,'popup.html'),'utf8');
  const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if(!tags.length)throw Error('Page QA popup has no packaged script');
  for(const [,attributes,inline] of tags) {
    const match=attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if(!match||/^(?:https?:|data:|\/\/)/i.test(match[2])||inline.trim())
      throw Error('Unexpected inline or remote product HTML script');
  }
  if(/<\s*(?:iframe|object|embed)\b/i.test(html))
    throw Error('Unapproved embedded page in product HTML');
  const scripts=paths.filter(path=>path.endsWith('.js'));
  if(!scripts.length)throw Error('No packaged Page QA application script');
  const rows=[];let totalJsBytes=0,totalBytes=0;
  for(const path of paths){
    const bytes=await readFile(join(root,path));
    totalBytes+=bytes.length;
    if(path.endsWith('.js')){
      totalJsBytes+=bytes.length;
      inspectBundledJs(bytes.toString('utf8'),path);
    }
    if(path.endsWith('.css')&&/@import\s|url\(\s*['"]?https?:/i.test(bytes.toString('utf8')))
      throw Error('Remote CSS is forbidden in Page QA');
    rows.push({path,bytes:bytes.length,sha256:digest(bytes)});
  }
  if(totalJsBytes>plan.budgets.maxJsBytes)throw Error('Page QA JS byte budget exceeded');
  if(totalBytes>plan.budgets.maxZipBytes)throw Error('Page QA unpacked resource budget exceeded');
  return {productId:plan.productId,version:plan.version,files:rows,
    totalJsBytes,totalBytes,packageHash:digest(Buffer.from(JSON.stringify(rows)))};
}
