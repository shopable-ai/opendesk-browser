// A versioned, self-contained linked Page resource. It stays in the existing
// source revision store, so updates, grants and deletion keep their old identity
// rules. Nothing in this module evaluates source or fetches a URL.
import {digest,digestUtf8,invariant} from '../../platform/protocol.js';
import {remoteURL,REMOTE_PAGE_LIBRARY_LIMITS} from './remote-esm-contract.js';
export const PAGE_BUNDLE_FORMAT='opendesk.page-linked-resource.v1';
export const PAGE_BUNDLE_PREFIX='// OpenDesk Page linked resource v1 ';
export const PAGE_BUNDLE_LIMITS=Object.freeze({linkedBytes:512*1024,descriptorBytes:4096,draftBytes:768*1024});
const encoder=new TextEncoder(),bytes=text=>encoder.encode(text).length;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function inspectPageSource(sourceUtf8,{plainLimit=128*1024}={}){
  invariant(typeof sourceUtf8==='string'&&sourceUtf8.trim(),'E_SOURCE','页面源码必须为非空文本');
  if(!sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX)){
    invariant(bytes(sourceUtf8)<=plainLimit,'E_SOURCE','普通页面源码超过原有容量；大型依赖须使用固定 Page 资源格式');
    return null;
  }
  const end=sourceUtf8.indexOf('\n');
  invariant(end>PAGE_BUNDLE_PREFIX.length&&end<PAGE_BUNDLE_LIMITS.descriptorBytes&&
    bytes(sourceUtf8.slice(0,end+1))<=PAGE_BUNDLE_LIMITS.descriptorBytes,
    'E_PAGE_BUNDLE','固定 Page 资源描述无效或过大');
  let descriptor;try{descriptor=JSON.parse(sourceUtf8.slice(PAGE_BUNDLE_PREFIX.length,end));}catch{
    invariant(false,'E_PAGE_BUNDLE','固定 Page 资源描述必须为 JSON');
  }
  invariant(exact(descriptor,['format','world','linkedBytes','linkedSha256','producer','dependencies'])&&
    descriptor.format===PAGE_BUNDLE_FORMAT&&descriptor.world==='USER_SCRIPT'&&
    ['webpack-5.111.1','babel-7.29.9'].includes(descriptor.producer)&&
    Number.isInteger(descriptor.linkedBytes)&&descriptor.linkedBytes>0&&
    descriptor.linkedBytes<=PAGE_BUNDLE_LIMITS.linkedBytes&&hash(descriptor.linkedSha256),
    'E_PAGE_BUNDLE','不支持的 Page 资源版本、世界、编译器或大小');
  const graph=descriptor.dependencies;
  invariant(exact(graph,['lockSha256','moduleCount','sourceBytes','roots'])&&hash(graph.lockSha256)&&
    Number.isInteger(graph.moduleCount)&&graph.moduleCount>0&&graph.moduleCount<=REMOTE_PAGE_LIBRARY_LIMITS.modules&&
    Number.isInteger(graph.sourceBytes)&&graph.sourceBytes>0&&graph.sourceBytes<=REMOTE_PAGE_LIBRARY_LIMITS.totalBytes&&
    Array.isArray(graph.roots)&&graph.roots.length>0&&graph.roots.length<=8&&graph.moduleCount>=graph.roots.length&&
    graph.roots.every(row=>exact(row,['url','sha256'])&&hash(row.sha256)&&remoteURL(row.url)===row.url)&&
    new Set(graph.roots.map(row=>row.url)).size===graph.roots.length,
    'E_PAGE_BUNDLE','固定 Page 资源缺少完整的依赖图身份');
  const linked=sourceUtf8.slice(end+1);
  invariant(bytes(linked)===descriptor.linkedBytes&&!linked.startsWith(PAGE_BUNDLE_PREFIX),
    'E_PAGE_BUNDLE','固定 Page 资源字节数不符或含嵌套资源');
  return {descriptor,linked};
}
export async function validatePageSource(sourceUtf8,options){
  const bundle=inspectPageSource(sourceUtf8,options);
  if(bundle)invariant(await digestUtf8(bundle.linked)===bundle.descriptor.linkedSha256,
    'E_PAGE_BUNDLE_HASH','固定 Page 执行资源 SHA-256 不符；不会下载或回退其它版本');
  return bundle;
}
export async function createPageBundle(sourceUtf8,{remoteModules,remoteImports,remoteLock,producer='webpack-5.111.1'}={}){
  invariant(Array.isArray(remoteModules)&&remoteModules.length&&Array.isArray(remoteImports),
    'E_PAGE_BUNDLE','需要实际已校验的远端模块图');
  const byURL=new Map(remoteModules.map(row=>[row.url,row]));
  const dependencies={lockSha256:await digest(remoteLock),moduleCount:remoteModules.length,
    sourceBytes:remoteModules.reduce((n,row)=>n+row.bytes,0),
    roots:[...new Set(remoteImports)].sort().map(url=>({url,sha256:byURL.get(url)?.sha256}))};
  const descriptor={format:PAGE_BUNDLE_FORMAT,world:'USER_SCRIPT',linkedBytes:bytes(sourceUtf8),
    linkedSha256:await digestUtf8(sourceUtf8),producer,dependencies};
  const result=PAGE_BUNDLE_PREFIX+JSON.stringify(descriptor)+'\n'+sourceUtf8;
  await validatePageSource(result);return result;
}
