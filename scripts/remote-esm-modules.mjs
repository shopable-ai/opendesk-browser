// Build-time HTTPS ESM vendoring. Never used by the extension or RunHost.
// Plain builds are strictly offline; --lock-remote explicitly admits new bytes.
import {readFile,writeFile,mkdir,rename,rm,open,lstat,rmdir,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,relative,dirname} from 'node:path';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {fetchPinnedRemote} from './remote-esm-network.mjs';

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
    !host.includes('.')||host.endsWith('.')||isIP(host.replace(/^\[|\]$/g,''))||host==='localhost'||host.endsWith('.localhost')||
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
  if(raw?.format!==FORMAT||Object.keys(raw).sort().join(',')!=='format,modules'||
    !raw.modules||typeof raw.modules!=='object'||Array.isArray(raw.modules))
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

// The project root is realpath()'d by the builder. Every cache directory
// component must stay a REAL directory: an in-project symlink may not redirect
// module bytes or writes outside the granted project.
async function safeDir(root,path,{create=false}={}){
  if(create){
    try{await mkdir(path);}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  let info;
  try{info=await lstat(path);}catch(error){
    if(error.code==='ENOENT')fail('E_REMOTE_CACHE','Remote cache directory is missing');
    throw error;
  }
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==path)
    fail('E_REMOTE_PATH','Remote ESM cache directory must not be a symlink: '+path);
  if(path!==root&&!path.startsWith(root+'/'))
    fail('E_REMOTE_PATH','Remote cache directory escaped the project');
}

async function cacheDir(root,{create=false}={}){
  const base=join(root,'.opendesk'),dir=join(root,REMOTE_CACHE_DIR);
  await safeDir(root,base,{create});
  await safeDir(root,dir,{create});
  return dir;
}

async function readNoFollow(path,limit,missingCode='E_REMOTE_CACHE'){
  let handle;
  try{
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const info=await handle.stat();
    if(!info.isFile()||info.size>limit||info.size<0)
      fail('E_REMOTE_PATH','Remote ESM file is not a bounded regular file: '+path);
    return await handle.readFile();
  }catch(error){
    if(error.code==='ENOENT')throw error;
    if(error.code?.startsWith('E_REMOTE_'))throw error;
    fail(missingCode,'Cannot read a safe remote ESM file: '+path);
  }finally{await handle?.close();}
}

async function readLock(root){
  const file=join(root,REMOTE_LOCK_FILE);
  let bytes;
  try{bytes=await readNoFollow(file,128*1024,'E_REMOTE_LOCK');}
  catch(error){
    if(error.code==='ENOENT')return {format:FORMAT,modules:{}};
    throw error;
  }
  try{return validLock(JSON.parse(bytes.toString('utf8')));}
  catch(error){
    if(error.code?.startsWith('E_REMOTE_'))throw error;
    fail('E_REMOTE_LOCK','Cannot parse remote import lock: '+error.message);
  }
}

async function lockedBytes(root,entry,url){
  await cacheDir(root);
  const filename=join(root,REMOTE_CACHE_DIR,entry.sha256+'.mjs');
  let bytes;
  try{bytes=await readNoFollow(filename,MAX_SINGLE_BYTES);}
  catch(error){
    if(error.code==='ENOENT')fail('E_REMOTE_CACHE','Pinned remote module is missing: '+url);
    throw error;
  }
  if(bytes.byteLength!==entry.bytes||hash(bytes)!==entry.sha256)
    fail('E_REMOTE_HASH','Pinned remote module has changed: '+url);
  return bytes;
}

// Directory creation is atomic: no concurrent --lock-remote operation may
// create another lock based on stale state. A crashed writer may require the
// developer to inspect and manually remove the clearly named lock directory.
async function acquireLockWriter(root){
  await safeDir(root,join(root,'.opendesk'),{create:true});
  const mutex=join(root,'.opendesk','remote-lock-write');
  try{await mkdir(mutex);}
  catch(error){
    if(error.code==='EEXIST')fail('E_REMOTE_LOCK_BUSY',
      'Another remote dependency update is in progress (or a stale lock requires inspection)');
    throw error;
  }
  return async()=>{await rmdir(mutex);};
}

async function download(url,fetchImpl) {
  // fetchImpl is a trusted test-only injection. CLI builds always use the
  // pinned native transport, never undici/fetch with an unverified DNS hop.
  if(!fetchImpl)return fetchPinnedRemote(url);
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
    }catch(error){
      await reader.cancel().catch(()=>{});
      throw error;
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

async function immutableCache(root,entry,bytes){
  const dir=await cacheDir(root,{create:true});
  const filename=join(dir,entry.sha256+'.mjs');
  let handle;
  try{
    handle=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{await handle.writeFile(bytes);await handle.sync();}
    finally{await handle.close();handle=null;}
  }catch(error){
    await handle?.close();
    if(error.code!=='EEXIST')throw error;
    const previous=await readNoFollow(filename,MAX_SINGLE_BYTES);
    if(!previous.equals(bytes))
      fail('E_REMOTE_HASH','Existing cache blob differs from pinned SHA-256');
  }
}

export async function prepareRemoteModules({root,remoteImports=[],temp,lockRemote=false,fetchImpl}) {
  if(!remoteImports.length)return {aliases:new Map(),modules:[]};
  root=await realpath(root);
  const release=lockRemote?await acquireLockWriter(root):null;
  try{
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
    const staging=lockPath+'.tmp-'+process.pid+'-'+createHash('sha256').update(String(Math.random())).digest('hex').slice(0,12);
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
    for(const ref of [...entry.refs].sort((a,b)=>b.start-a.start)){
      // Webpack 5.95 treats https: as a runtime external. Never pass a URL
      // specifier into the compiler: rewrite it to a verified *local* module.
      const child=aliases.get(ref.url);
      if(!child)fail('E_REMOTE_UNLOCKED','Child dependency is missing from the pinned graph: '+ref.url);
      let spec=relative(dirname(aliases.get(url)),child).replaceAll('\\','/');
      if(!spec.startsWith('.'))spec='./'+spec;
      code=code.slice(0,ref.start)+JSON.stringify(spec)+code.slice(ref.end);
    }
    await writeFile(aliases.get(url),code,{flag:'wx'});
  }
  return {aliases,modules:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([url,row])=>({
    url,sha256:row.sha256,bytes:row.bytes}))};
  }finally{await release?.();}
}
