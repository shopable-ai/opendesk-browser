// Build-time HTTPS ESM vendoring. Never used by the extension or RunHost.
// Plain builds are strictly offline; --lock-remote explicitly admits new bytes.
import {writeFile,mkdir,rename,rm,open,lstat,rmdir,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,relative,dirname} from 'node:path';
import {isIP} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
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

const sameInode=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const fileVersion=info=>[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');

// Hold directory descriptors so inode reuse cannot hide replacement across
// asynchronous work. Check before/after IO, including lock release. Node has
// no portable openat/renameat API: these checks detect replacement, but are NOT
// a sandbox against a hostile same-UID process racing between syscalls. The
// caller must own/trust the local project directory and its ancestors.
function directoryGuard(root){
  const dirs=new Map();
  const check=async()=>{
    for(const [path,{info}] of dirs){
      let current;
      try{current=await lstat(path,{bigint:true});}
      catch{fail('E_REMOTE_PATH','Remote directory disappeared during IO: '+path);}
      if(!current.isDirectory()||!sameInode(info,current)||await realpath(path)!==path)
        fail('E_REMOTE_PATH','Remote directory changed during IO: '+path);
    }
  };
  const pin=async(path,{create=false}={})=>{
    if(path!==root&&!path.startsWith(root+'/'))fail('E_REMOTE_PATH','Remote directory escaped the project');
    await check();
    if(dirs.has(path))return path;
    if(create){
      try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    }
    let handle;
    try{
      const info=await lstat(path,{bigint:true});
      if(!info.isDirectory()||await realpath(path)!==path)
        fail('E_REMOTE_PATH','Remote cache directory must not be a symlink: '+path);
      handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      if(!sameInode(info,await handle.stat({bigint:true})))
        fail('E_REMOTE_PATH','Remote directory changed while opening: '+path);
      dirs.set(path,{handle,info});handle=null;
      await check();
      return path;
    }catch(error){
      if(error.code==='ENOENT')fail('E_REMOTE_CACHE','Remote cache directory is missing');
      if(error.code?.startsWith('E_REMOTE_'))throw error;
      fail('E_REMOTE_PATH','Cannot pin a safe remote directory: '+path);
    }finally{await handle?.close();}
  };
  return {root,check,pin,
    drop:async path=>{const entry=dirs.get(path);dirs.delete(path);await entry?.handle.close();},
    close:async()=>{await Promise.all([...dirs.values()].map(entry=>entry.handle.close()));dirs.clear();}};
}

async function cacheDir(guard,{create=false}={}){
  await guard.pin(join(guard.root,'.opendesk'),{create});
  return guard.pin(join(guard.root,REMOTE_CACHE_DIR),{create});
}

async function readNoFollow(guard,path,limit,missingCode='E_REMOTE_CACHE'){
  let handle;
  try{
    await guard.check();
    // NONBLOCK prevents a planted FIFO from hanging before fstat rejects it.
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const info=await handle.stat({bigint:true});
    if(!info.isFile()||info.nlink!==1n||info.size>BigInt(limit)||info.size<0n)
      fail('E_REMOTE_PATH','Remote ESM file is not a bounded regular file: '+path);
    await guard.check();
    const buffer=Buffer.alloc(limit+1);let size=0;
    while(size<buffer.length){
      const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);
      if(!bytesRead)break;
      size+=bytesRead;
    }
    if(size>limit)fail('E_REMOTE_PATH','Remote ESM file grew past its byte limit: '+path);
    const after=await handle.stat({bigint:true}),current=await lstat(path,{bigint:true});
    await guard.check();
    if(fileVersion(info)!==fileVersion(after)||fileVersion(after)!==fileVersion(current)||
      after.nlink!==1n||!current.isFile())
      fail('E_REMOTE_PATH','Remote ESM file changed during read: '+path);
    return {bytes:buffer.subarray(0,size),version:fileVersion(after)};
  }catch(error){
    if(error.code==='ENOENT')throw error;
    if(error.code?.startsWith('E_REMOTE_'))throw error;
    fail(missingCode,'Cannot read a safe remote ESM file: '+path);
  }finally{await handle?.close();}
}

async function readLock(guard){
  const file=join(guard.root,REMOTE_LOCK_FILE);
  let record;
  try{record=await readNoFollow(guard,file,128*1024,'E_REMOTE_LOCK');}
  catch(error){
    if(error.code==='ENOENT'){
      await guard.check();
      return {lock:{format:FORMAT,modules:{}},version:'missing'};
    }
    throw error;
  }
  try{return {lock:validLock(JSON.parse(record.bytes.toString('utf8'))),version:record.version};}
  catch(error){
    if(error.code?.startsWith('E_REMOTE_'))throw error;
    fail('E_REMOTE_LOCK','Cannot parse remote import lock: '+error.message);
  }
}

async function lockedBytes(guard,entry,url){
  await cacheDir(guard);
  const filename=join(guard.root,REMOTE_CACHE_DIR,entry.sha256+'.mjs');
  let bytes;
  try{({bytes}=await readNoFollow(guard,filename,MAX_SINGLE_BYTES));}
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
async function acquireLockWriter(guard){
  await guard.pin(join(guard.root,'.opendesk'),{create:true});
  const mutex=join(guard.root,'.opendesk','remote-lock-write');
  try{await mkdir(mutex,{mode:0o700});}
  catch(error){
    if(error.code==='EEXIST')fail('E_REMOTE_LOCK_BUSY',
      'Another remote dependency update is in progress (or a stale lock requires inspection)');
    throw error;
  }
  await guard.pin(mutex);
  return async()=>{
    await guard.check();
    await rmdir(mutex);
    await guard.drop(mutex);
  };
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

async function immutableCache(guard,entry,bytes){
  const dir=await cacheDir(guard,{create:true});
  const filename=join(dir,entry.sha256+'.mjs');
  let handle;
  try{
    handle=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{
      const info=await handle.stat({bigint:true});
      await guard.check();
      if(info.nlink!==1n||!sameInode(info,await lstat(filename,{bigint:true})))
        fail('E_REMOTE_PATH','Remote cache blob changed before write');
      await handle.writeFile(bytes);await handle.sync();
      await guard.check();
      if(!sameInode(info,await lstat(filename,{bigint:true})))
        fail('E_REMOTE_PATH','Remote cache blob changed during write');
    }
    finally{await handle.close();handle=null;}
    const {bytes:persisted}=await readNoFollow(guard,filename,MAX_SINGLE_BYTES);
    if(!persisted.equals(bytes))fail('E_REMOTE_HASH','Cache blob changed during persistence');
  }catch(error){
    await handle?.close();
    if(error.code!=='EEXIST')throw error;
    const {bytes:previous}=await readNoFollow(guard,filename,MAX_SINGLE_BYTES);
    if(!previous.equals(bytes))
      fail('E_REMOTE_HASH','Existing cache blob differs from pinned SHA-256');
  }
}

export async function prepareRemoteModules({root,remoteImports=[],temp,lockRemote=false,fetchImpl}) {
  if(!remoteImports.length)return {aliases:new Map(),modules:[]};
  // Canonicalize the grant root once (macOS /var -> /private/var is valid).
  // Internal cache components still must be real directories, never symlinks.
  root=await realpath(root);
  const guard=directoryGuard(root);let release;
  try{
  await guard.pin(root);
  release=lockRemote?await acquireLockWriter(guard):null;
  if(lockRemote)await cacheDir(guard,{create:true});
  const {lock,version}=await readLock(guard),original=JSON.stringify(lock),sources=new Map(),additions=new Map();
  let totalBytes=0;
  const todo=[...new Set(remoteImports.map(remoteURL))].sort();
  while(todo.length){
    const url=todo.shift();
    if(sources.has(url))continue;
    if(sources.size>=MAX_MODULES)fail('E_REMOTE_LIMIT','Remote graph exceeds 32 JavaScript modules');
    const entry=lock.modules[url],bytes=entry
      ?await lockedBytes(guard,entry,url)
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
    for(const url of additions.keys()){
      const record=sources.get(url);
      next.modules[url]={sha256:record.sha256,bytes:record.bytes};
    }
    validLock(next); // Existing pins plus new graph must fit the lock contract.
    for(const [url,bytes] of additions)await immutableCache(guard,next.modules[url],bytes);
    next.modules=Object.fromEntries(Object.entries(next.modules).sort(([a],[b])=>a.localeCompare(b)));
    const lockPath=join(root,REMOTE_LOCK_FILE);
    const latest=await readLock(guard);
    if(JSON.stringify(latest.lock)!==original||latest.version!==version)
      fail('E_REMOTE_LOCK_CHANGED','Remote dependency lock changed during fetch; retry');
    const staging=lockPath+'.tmp-'+process.pid+'-'+randomUUID();
    const expected=Buffer.from(JSON.stringify(next,null,2)+'\n');
    let handle,stagedInfo;
    try{
      await guard.check();
      handle=await open(staging,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      stagedInfo=await handle.stat({bigint:true});
      await guard.check();
      if(stagedInfo.nlink!==1n||!sameInode(stagedInfo,await lstat(staging,{bigint:true})))
        fail('E_REMOTE_PATH','Staged remote lock changed before write');
      await handle.writeFile(expected);await handle.sync();
      await handle.close();handle=null;
      const staged=await readNoFollow(guard,staging,128*1024,'E_REMOTE_LOCK');
      if(!staged.bytes.equals(expected))
        fail('E_REMOTE_LOCK_CHANGED','Staged remote lock bytes changed before commit');
      const beforeRename=await readLock(guard);
      if(JSON.stringify(beforeRename.lock)!==original||beforeRename.version!==version)
        fail('E_REMOTE_LOCK_CHANGED','Remote dependency lock changed before commit; retry');
      const stagedCurrent=await lstat(staging,{bigint:true});
      if(!sameInode(stagedInfo,stagedCurrent)||fileVersion(stagedCurrent)!==staged.version||stagedCurrent.nlink!==1n)
        fail('E_REMOTE_PATH','Staged remote lock changed before commit');
      await rename(staging,lockPath);
      await guard.check();
      const committed=await readLock(guard);
      if(JSON.stringify(committed.lock)!==JSON.stringify(next))
        fail('E_REMOTE_LOCK_CHANGED','Remote dependency lock changed during commit');
    }finally{
      await handle?.close();
      // Never remove another writer's staging file after directory replacement.
      if(stagedInfo){
        await guard.check();
        try{
          if(sameInode(stagedInfo,await lstat(staging,{bigint:true})))await rm(staging);
        }catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }
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
  await guard.check();
  return {aliases,modules:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([url,row])=>({
    url,sha256:row.sha256,bytes:row.bytes}))};
  }finally{try{await release?.();}finally{await guard.close();}}
}
