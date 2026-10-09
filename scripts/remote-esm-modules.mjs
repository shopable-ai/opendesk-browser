// Build-time HTTPS ESM vendoring. Never used by the extension or RunHost.
// Plain builds are strictly offline; --lock-remote explicitly admits new bytes.
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';

export const REMOTE_LOCK_FILE='opendesk.remote-lock.json';
export const REMOTE_CACHE_DIR='.opendesk/remote-cache';
const FORMAT='opendesk.remote-lock.v1';
const MAX_MODULES=32, MAX_SINGLE_BYTES=128*1024, MAX_TOTAL_BYTES=256*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,phase:'remote',...details});};

export function remoteURL(value) {
  if(typeof value!=='string'||value.length>2048)fail('E_REMOTE_URL','Remote import URL is missing or too long');
  let url;
  try{url=new URL(value);}catch{fail('E_REMOTE_URL','Invalid remote import URL: '+value);}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
    !host.includes('.')||isIP(host)||host==='localhost'||host.endsWith('.localhost')||
    host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||
    host.endsWith('.invalid')||url.pathname==='/'||/[\u0000-\u001f]/.test(value))
    fail('E_REMOTE_URL','Remote ESM must use a public HTTPS host, without credentials, custom port or fragment: '+value);
  return url.href;
}

function moduleImports(source,url) {
  let ast;
  try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});}
  catch(error){fail('E_REMOTE_SYNTAX','Remote module '+url+' is not valid plain ESM: '+error.message);}
  const refs=[],seen=new Set();
  for(const row of ast.body){
    if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(row.type)||!row.source)continue;
    const spec=row.source.value;
    if(typeof spec!=='string')fail('E_REMOTE_IMPORT','Only literal remote static ESM imports are supported: '+url);
    let next;
    if(spec.startsWith('https:'))next=remoteURL(spec);
    else if(spec.startsWith('./')||spec.startsWith('../')||spec.startsWith('/')){
      next=remoteURL(new URL(spec,url).href);
    }else fail('E_REMOTE_IMPORT','Remote ESM contains an unsupported bare, HTTP or other import: '+spec);
    refs.push({start:row.source.start,end:row.source.end,url:next});
    seen.add(next);
  }
  // No runtime import()/CommonJS/eval escape path hidden in downloaded code.
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='ImportExpression'||node.type==='CallExpression'&&
      node.callee?.type==='Identifier'&&['require','eval'].includes(node.callee.name))
      fail('E_REMOTE_DYNAMIC','Remote modules cannot contain import(), require() or eval(): '+url);
    for(const val of Object.values(node)){
      if(Array.isArray(val))for(const child of val)walk(child);
      else if(val&&typeof val==='object')walk(val);
    }
  };
  walk(ast);
  return {refs,children:[...seen].sort()};
}

function validLock(raw){
  if(raw?.format!==FORMAT||!raw.modules||typeof raw.modules!=='object'||Array.isArray(raw.modules))
    fail('E_REMOTE_LOCK','Invalid remote import lock format');
  for(const [url,entry] of Object.entries(raw.modules)){
    if(remoteURL(url)!==url||!entry||Object.keys(entry).sort().join(',')!=='bytes,sha256'||
      !/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isInteger(entry.bytes)||
      entry.bytes<1||entry.bytes>MAX_SINGLE_BYTES)
      fail('E_REMOTE_LOCK','Remote import lock contains an invalid entry: '+url);
  }
  if(Object.keys(raw.modules).length>MAX_MODULES)fail('E_REMOTE_LIMIT','Too many pinned remote modules');
  return raw;
}

async function readLock(root) {
  try{return validLock(JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8')));}
  catch(error){
    if(error.code==='ENOENT')return {format:FORMAT,modules:{}};
    if(error.code)throw error;
    fail('E_REMOTE_LOCK','Cannot parse remote import lock: '+error.message);
  }
}

async function lockedBytes(root,entry,url) {
  const pathname=join(root,REMOTE_CACHE_DIR,entry.sha256+'.mjs');
  let bytes;
  try{bytes=await readFile(pathname);}catch{fail('E_REMOTE_CACHE','Pinned remote module is missing: '+url);}
  if(bytes.byteLength!==entry.bytes||hash(bytes)!==entry.sha256)
    fail('E_REMOTE_HASH','Pinned remote module has changed: '+url);
  return bytes;
}

async function download(url,fetchImpl) {
  let response;
  try{
    response=await fetchImpl(url,{redirect:'manual',credentials:'omit',
      signal:AbortSignal.timeout(10000),headers:{accept:'text/javascript,application/javascript,*/*;q=0.3'}});
  }catch(error){fail('E_REMOTE_FETCH','Cannot fetch HTTPS module '+url+': '+error.message);}
  if(response.status!==200||response.redirected||response.url&&response.url!==url)
    fail('E_REMOTE_FETCH','Remote module must return HTTP 200 without redirects: '+url);
  const type=response.headers?.get?.('content-type')||'';
  if(type&&!/^(?:text\/javascript|application\/javascript|application\/ecmascript|text\/ecmascript|text\/plain)(?:\s*;|$)/i.test(type))
    fail('E_REMOTE_MIME','Remote ESM has an unsupported content type: '+type);
  const length=Number(response.headers?.get?.('content-length')||0);
  if(length>MAX_SINGLE_BYTES)fail('E_REMOTE_LIMIT','Remote JS file exceeds 128 KiB: '+url);
  // Bound streamed responses even when the server omits Content-Length.
  let bytes;
  if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{
      for(;;){
        const {value,done}=await reader.read();if(done)break;
        total+=value.byteLength;
        if(total>MAX_SINGLE_BYTES)fail('E_REMOTE_LIMIT','Remote JS file exceeds 128 KiB: '+url);
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)),total);
  }else {
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(bytes.length===0||bytes.length>MAX_SINGLE_BYTES)
    fail('E_REMOTE_LIMIT','Remote JS must be nonempty and <=128 KiB: '+url);
  return bytes;
}

function utf8(bytes,url) {
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{fail('E_REMOTE_ENCODING','Remote ESM must be valid UTF-8: '+url);}
}

async function immutableCache(root,entry,bytes) {
  const dir=join(root,REMOTE_CACHE_DIR),filename=join(dir,entry.sha256+'.mjs');
  await mkdir(dir,{recursive:true});
  try{await writeFile(filename,bytes,{flag:'wx'});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const previous=await readFile(filename);
    if(!previous.equals(bytes))fail('E_REMOTE_HASH','Existing cache blob differs from pinned SHA-256');
  }
}

export async function prepareRemoteModules({root,remoteImports=[],temp,lockRemote=false,fetchImpl=globalThis.fetch}) {
  if(!remoteImports.length)return {aliases:new Map(),modules:[]};
  const lock=await readLock(root),original=JSON.stringify(lock),sources=new Map(),additions=new Map();
  let totalBytes=0;
  const todo=[...new Set(remoteImports.map(remoteURL))].sort();
  while(todo.length){
    const url=todo.shift();
    if(sources.has(url))continue;
    if(sources.size>=MAX_MODULES)fail('E_REMOTE_LIMIT','Remote graph exceeds 32 JavaScript modules');
    const entry=lock.modules[url],bytes=entry
      ?await lockedBytes(root,entry,url)
      :lockRemote?await download(url,fetchImpl):fail('E_REMOTE_UNLOCKED',
        'Remote import is not pinned: '+url+'. Run the local build once with --lock-remote and commit the cache and lockfile.');
    totalBytes+=bytes.byteLength;
    if(totalBytes>MAX_TOTAL_BYTES)fail('E_REMOTE_LIMIT','Remote source graph exceeds 256 KiB');
    const code=utf8(bytes,url),parsed=moduleImports(code,url);
    sources.set(url,{code,refs:parsed.refs,sha256:hash(bytes),bytes:bytes.byteLength});
    if(!entry)additions.set(url,bytes);
    for(const child of parsed.children)if(!sources.has(child)&&!todo.includes(child))todo.push(child);
    todo.sort();
  }
  // Commit fetched bytes to persistent content-addressed files, not to the
  // extension. A failed/partial network graph never writes a lockfile.
  if(additions.size){
    const next={format:FORMAT,modules:{...lock.modules}};
    for(const [url,bytes] of additions){
      const record=sources.get(url);
      next.modules[url]={sha256:record.sha256,bytes:record.bytes};
      await immutableCache(root,next.modules[url],bytes);
    }
    next.modules=Object.fromEntries(Object.entries(next.modules).sort(([a],[b])=>a.localeCompare(b)));
    const lockPath=join(root,REMOTE_LOCK_FILE);
    const latest=await readLock(root);
    if(JSON.stringify(latest)!==original)
      fail('E_REMOTE_LOCK_CHANGED','Remote dependency lock changed during fetch; retry');
    const staging=lockPath+'.tmp-'+process.pid;
    try{
      await writeFile(staging,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
      await rename(staging,lockPath);
    }finally{await rm(staging,{force:true});}
  }
  // Rewrite only temporary copies; originals in the pinned cache remain
  // byte-for-byte identical to what was downloaded and hashed.
  const moduleDir=join(temp,'remote');await mkdir(moduleDir,{recursive:true});
  const aliases=new Map();
  for(const url of sources.keys())aliases.set(url,join(moduleDir,hash(url)+'.mjs'));
  for(const [url,entry] of sources){
    let code=entry.code;
    for(const ref of [...entry.refs].sort((a,b)=>b.start-a.start))
      code=code.slice(0,ref.start)+JSON.stringify(ref.url)+code.slice(ref.end);
    await writeFile(aliases.get(url),code,{flag:'wx'});
  }
  return {aliases,modules:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([url,row])=>({
    url,sha256:row.sha256,bytes:row.bytes}))};
}
