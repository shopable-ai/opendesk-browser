import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,unlink,rename,readdir,link,realpath,open,appendFile,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchPinnedRemote,isPublicRemoteAddress,resolveRemoteAddress}
  from '../../scripts/remote-esm-network.mjs';
import {prepareRemoteModules,REMOTE_CACHE_DIR,REMOTE_LOCK_FILE,remoteURL}
  from '../../scripts/remote-esm-modules.mjs';

import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';

const URL_A='https://cdn.example.org/v1/add.mjs';
const good='export function add(a,b){return a+b;}';
const code=error=>error?.code;
const lookupFor=addresses=>async()=>addresses.map(address=>({address,
  family:address.includes(':')?6:4}));
const successFetch=async()=>new Response(good,{status:200,headers:{'content-type':'text/javascript'}});

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-remote-secure-'));
  const temp=join(root,'scratch');
  await mkdir(temp);
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,temp};
}

test('IPv4, IPv6, metadata, translation, mixed DNS and localhost aliases are rejected',async()=>{
  for(const addr of ['127.0.0.1','10.0.0.1','172.20.1.2','192.168.1.1',
    '100.100.100.200','169.254.169.254','0.0.0.0','198.18.0.1',
    '203.0.113.10','224.0.0.1','::1','fe80::1','fc00::1',
    '::ffff:127.0.0.1','2002:c0a8:0101::1','2001:db8::1',
    '2001::1','3fff::1','255.255.255.255','192.0.0.9','192.88.99.1',
    '198.19.255.255','198.51.100.1','64:ff9b::a00:1','64:ff9b:1::1',
    '100::1','2001:20::1','2001:30::1','5f00::1','ff02::1',
    '2001:4860:4860::8888%en0','invalid']){
    assert.equal(isPublicRemoteAddress(addr),false,addr);
  }
  for(const addr of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888']){
    assert.equal(isPublicRemoteAddress(addr),true,addr);
  }
  for(const addr of ['10.1.2.3','::1','::ffff:169.254.169.254','2002:c0a8:1::']){
    await assert.rejects(resolveRemoteAddress('cdn.example.org',{
      lookup:lookupFor([addr])}),error=>code(error)==='E_REMOTE_DNS');
  }
  await assert.rejects(resolveRemoteAddress('cdn.example.org',{
    lookup:lookupFor(['8.8.8.8','127.0.0.1'])}),error=>code(error)==='E_REMOTE_DNS');
  await assert.rejects(resolveRemoteAddress('cdn.example.org',{
    lookup:lookupFor(['2001:4860:4860::8888','fe80::1'])}),
  error=>code(error)==='E_REMOTE_DNS');
  for(const bad of ['https://localhost./x.js','https://127.1/x.js',
    'https://[::1]/x.js','https://user@cdn.example.org/x.js',
    'https://cdn.example.org:8443/x.js']){
    assert.throws(()=>remoteURL(bad),error=>code(error)==='E_REMOTE_URL',bad);
  }
});

function mockRequest({peer,statusCode=200,mime='text/javascript',
  content=good,contentLength,contentEncoding,securePeer,authorized=true,
  encrypted=true,hang=false,closeEarly=false,connectError,connectDelay=0,secureError}={},calls=[]){
  return (target,options,onResponse)=>{
    const req=new EventEmitter();
    req.destroyed=false;
    req.destroy=error=>{
      if(req.destroyed)return;
      req.destroyed=true;
      process.nextTick(()=>req.emit('error',error));
    };
    req.end=()=>process.nextTick(()=>{
      if(hang)return;
      options.lookup(target.hostname,{},(error,address,family)=>{
        if(error){req.destroy(error);return;}
        calls.push({target:target.href,options,address,family});
        const socket=new EventEmitter();
        if(connectError){
          socket.connecting=true;req.emit('socket',socket);
          const fail=()=>{if(!req.destroyed)req.destroy(connectError);};
          if(connectDelay)setTimeout(fail,connectDelay);else fail();
          return;
        }
        socket.remoteAddress=peer??address;
        socket.authorized=authorized;socket.encrypted=encrypted;
        req.emit('socket',socket);
        socket.emit('connect');
        if(req.destroyed)return;
        if(secureError){req.destroy(secureError);return;}
        if(securePeer)socket.remoteAddress=securePeer;
        socket.emit('secureConnect');
        if(req.destroyed)return;
        const res=new PassThrough();
        res.socket=socket;res.statusCode=statusCode;
        res.headers={'content-type':mime};
        if(contentEncoding)res.headers['content-encoding']=contentEncoding;
        if(contentLength!==undefined)res.headers['content-length']=String(contentLength);
        onResponse(res);
        if(closeEarly)res.destroy();else res.end(content);
      });
    });
    return req;
  };
}

test('HTTPS peer uses a fresh socket pinned to a validated DNS answer',async()=>{
  const calls=[];
  let dnsCalls=0;
  const bytes=await fetchPinnedRemote(URL_A,{
    lookup:async()=>{dnsCalls++;return [{address:'8.8.8.8',family:4}];},
    httpsRequest:mockRequest({},calls)
  });
  assert.equal(bytes.toString(),good);
  assert.equal(dnsCalls,1,'the transport must NOT resolve the hostname again');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.agent,false,'no pooled sockets may bypass the pin');
  assert.equal(calls[0].address,'8.8.8.8');
  assert.equal(calls[0].options.rejectUnauthorized,true,'must override NODE_TLS_REJECT_UNAUTHORIZED=0');
  assert.equal(calls[0].options.servername,'cdn.example.org');
  assert.equal(calls[0].options.family,4);
  const verify=calls[0].options.checkServerIdentity;
  assert.equal(verify('8.8.8.8',{subjectaltname:'DNS:cdn.example.org'}),undefined,
    'certificate identity must use the URL hostname rather than the pinned address');
  assert.ok(verify('cdn.example.org',{subjectaltname:'DNS:other.example.org'}));
  assert.equal(calls[0].options.signal instanceof AbortSignal,true);
  assert.equal(calls[0].options.headers['accept-encoding'],'identity');
});

const connectRefused=()=>Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED',syscall:'connect'});

test('a refused first TCP address falls back to the next verified public IP without resolving again',async()=>{
  const calls=[];let dnsCalls=0;
  const first=mockRequest({connectError:connectRefused()},calls),second=mockRequest({},calls);
  const bytes=await fetchPinnedRemote(URL_A,{
    lookup:async()=>{dnsCalls++;return [{address:'104.17.207.5',family:4},{address:'104.17.208.5',family:4}];},
    httpsRequest:(...args)=>(calls.length?second:first)(...args)
  });
  assert.equal(bytes.toString(),good);
  assert.equal(dnsCalls,1);
  assert.deepEqual(calls.map(call=>call.address),['104.17.207.5','104.17.208.5']);
  assert.equal(calls[0].options.signal.aborted,true,'failed connection must be closed before retry');
  for(const call of calls){
    assert.equal(call.options.agent,false);assert.equal(call.options.autoSelectFamily,false);
    assert.equal(call.options.servername,'cdn.example.org');assert.equal(call.options.rejectUnauthorized,true);
    assert.ok(call.options.checkServerIdentity('cdn.example.org',{subjectaltname:'DNS:wrong.example.org'}));
  }
  const single=await resolveRemoteAddress('cdn.example.org',{
    lookup:lookupFor(['104.17.207.5','104.17.208.5'])});
  assert.deepEqual(single,{address:'104.17.207.5',family:4});
  assert.equal(Object.isFrozen(single),true,'public single-address API remains compatible');
});

test('a mixed private DNS set causes zero requests even when a public fallback would work',async()=>{
  let requests=0;
  await assert.rejects(fetchPinnedRemote(URL_A,{
    // Place the private answer beyond the four-attempt limit: the entire DNS
    // answer set must be validated before applying the retry budget.
    lookup:lookupFor(['104.17.207.5','104.17.208.5','8.8.8.8','1.1.1.1','169.254.169.254']),
    httpsRequest:()=>{requests++;throw Error('must never connect');}
  }),error=>code(error)==='E_REMOTE_DNS');
  assert.equal(requests,0);
});

test('TCP fallback is limited to four distinct verified addresses and never repeats DNS',async()=>{
  const calls=[];let dnsCalls=0;
  const records=lookupFor(['2001:4860:4860::8888','2001:4860:4860:0:0:0:0:8888',
    '104.17.207.5','104.17.207.5','104.17.208.5','8.8.8.8','1.1.1.1']);
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:async()=>{dnsCalls++;return records();},
    httpsRequest:mockRequest({connectError:connectRefused()},calls)
  }),error=>code(error)==='E_REMOTE_FETCH'&&error.cause?.code==='ECONNREFUSED');
  assert.equal(dnsCalls,1);
  assert.deepEqual(calls.map(call=>call.address),
    ['2001:4860:4860::8888','104.17.207.5','104.17.208.5','8.8.8.8']);
  assert.equal(calls[0].options.family,6);
  assert.equal(calls.every(call=>call.options.signal.aborted),true);
});

test('only connect-stage refusals or unreachable errors may fall back',async()=>{
  for(const errorCode of ['ENETUNREACH','EHOSTUNREACH']){
    const calls=[],connectError=Object.assign(new Error('connect '+errorCode),{code:errorCode,syscall:'connect'});
    const first=mockRequest({connectError},calls),second=mockRequest({},calls);
    const bytes=await fetchPinnedRemote(URL_A,{lookup:lookupFor(['104.17.207.5','104.17.208.5']),
      httpsRequest:(...args)=>(calls.length?second:first)(...args)});
    assert.equal(bytes.toString(),good);assert.equal(calls.length,2);
  }
});

test('fallback shares the original DNS and request deadline rather than adding another budget',async()=>{
  const calls=[];let dnsCalls=0;
  const first=mockRequest({connectError:connectRefused(),connectDelay:30},calls);
  // Keep the second response open; only the common deadline should abort it.
  const second=(target,options,onResponse)=>{
    const req=new EventEmitter();req.destroy=()=>{};
    req.end=()=>options.lookup(target.hostname,{},(_error,address)=>calls.push({address,options}));
    return req;
  };
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:async()=>{dnsCalls++;await new Promise(resolve=>setTimeout(resolve,20));
      return [{address:'104.17.207.5',family:4},{address:'104.17.208.5',family:4},{address:'8.8.8.8',family:4}];},
    httpsRequest:(...args)=>(calls.length?second:first)(...args),timeoutMs:150
  }),error=>code(error)==='E_REMOTE_TIMEOUT');
  assert.equal(dnsCalls,1);assert.equal(calls.length,2,'deadline errors must not try a third address');
  assert.ok(calls[0].options.timeout<=135,'DNS time must consume the common budget');
  assert.ok(calls[1].options.timeout<=calls[0].options.timeout-20,'retry must consume first TCP attempt time');
  assert.equal(calls[1].options.signal.aborted,true);
});

test('TLS, peer, status and byte failures never fall back to another address',async()=>{
  for(const options of [
    {secureError:Object.assign(new Error('certificate mismatch'),{code:'ERR_TLS_CERT_ALTNAME_INVALID'})},
    {secureError:connectRefused()}, // errno alone is insufficient after TCP connect
    {authorized:false},{peer:'127.0.0.1'},{statusCode:302},{statusCode:503},
    {contentLength:128*1024+1},{content:'x'.repeat(128*1024+1)},
    {contentEncoding:'gzip'},{mime:'text/html'},
    {connectError:Object.assign(new Error('write ECONNREFUSED'),{code:'ECONNREFUSED',syscall:'write'})}
  ]){
    const calls=[];
    await assert.rejects(fetchPinnedRemote(URL_A,{lookup:lookupFor(['104.17.207.5','104.17.208.5']),
      httpsRequest:mockRequest(options,calls)}));
    assert.equal(calls.length,1,'security or non-connect error must stop the complete fetch');
  }
});

test('DNS rebinding at connection and redirects fail without fetching another host',async()=>{
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:lookupFor(['8.8.8.8']),httpsRequest:mockRequest({peer:'127.0.0.1'})
  }),error=>code(error)==='E_REMOTE_PEER');
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:lookupFor(['8.8.8.8']),httpsRequest:mockRequest({peer:'1.1.1.1'})
  }),error=>code(error)==='E_REMOTE_PEER');
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:lookupFor(['8.8.8.8']),httpsRequest:mockRequest({statusCode:302})
  }),error=>code(error)==='E_REMOTE_FETCH');
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:lookupFor(['8.8.8.8']),httpsRequest:mockRequest({securePeer:'127.0.0.1'})
  }),error=>code(error)==='E_REMOTE_PEER');
});

test('body size, content type and deadline remain bounded',async()=>{
  for(const options of [{content:'x'.repeat(128*1024+1)},
    {mime:'text/html'},{contentLength:128*1024+1}]){
    await assert.rejects(fetchPinnedRemote(URL_A,{
      lookup:lookupFor(['8.8.8.8']),httpsRequest:mockRequest(options)
    }),error=>['E_REMOTE_LIMIT','E_REMOTE_MIME'].includes(code(error)));
  }
  await assert.rejects(fetchPinnedRemote(URL_A,{
    lookup:()=>new Promise(()=>{}),timeoutMs:25
  }),error=>code(error)==='E_REMOTE_TIMEOUT');
});

test('all A/AAAA answers are checked, including a nonpublic answer after a public first answer',async()=>{
  for(const records of [[],[{address:'8.8.8.8',family:6}],
    [{address:'8.8.8.8',family:4},{address:'169.254.169.254',family:4}],
    [{address:'8.8.8.8',family:4},{address:'2001:db8::1',family:6}],
    Array.from({length:33},()=>({address:'8.8.8.8',family:4}))]){
    let requests=0;
    await assert.rejects(fetchPinnedRemote(URL_A,{lookup:async(_host,options)=>{
      assert.deepEqual(options,{all:true,verbatim:true,family:0,hints:0});return records;
    },httpsRequest:()=>{requests++;throw Error('must not connect');}}),
    error=>code(error)==='E_REMOTE_DNS');
    assert.equal(requests,0);
  }
  const calls=[];
  await fetchPinnedRemote(URL_A,{lookup:lookupFor(['2001:4860:4860::8888','8.8.8.8']),
    httpsRequest:mockRequest({},calls)});
  assert.equal(calls[0].family,6);
  assert.equal(calls[0].options.family,6);
  await fetchPinnedRemote(URL_A,{lookup:lookupFor(['8.8.8.8']),
    httpsRequest:mockRequest({peer:'::ffff:8.8.8.8'})});
});

test('unauthenticated TLS and incomplete/encoded/empty responses fail closed',async()=>{
  for(const [options,expected] of [
    [{authorized:false},'E_REMOTE_TLS'],[{encrypted:false},'E_REMOTE_TLS'],
    [{contentEncoding:'gzip'},'E_REMOTE_MIME'],[{closeEarly:true},'E_REMOTE_FETCH'],
    [{content:''},'E_REMOTE_LIMIT'],[{contentLength:1},'E_REMOTE_FETCH'],
    [{contentLength:'-1'},'E_REMOTE_LIMIT']]){
    await assert.rejects(fetchPinnedRemote(URL_A,{lookup:lookupFor(['8.8.8.8']),
      httpsRequest:mockRequest(options)}),error=>code(error)===expected);
  }
});

test('absolute request deadline rejects a stalled handshake independently of socket timeouts',async()=>{
  await assert.rejects(fetchPinnedRemote(URL_A,{lookup:lookupFor(['8.8.8.8']),
    httpsRequest:mockRequest({hang:true}),timeoutMs:25}),error=>code(error)==='E_REMOTE_TIMEOUT');
});

test('canonical project root accepts an OS path alias while internal cache symlinks remain forbidden',async t=>{
  const {root,temp}=await fixture(t);
  // /var/folders on macOS is an alias of /private/var/folders. Also exercise an
  // explicit root alias so this regression remains meaningful on Linux CI.
  const alias=root+'-alias';await symlink(root,alias,'dir');
  t.after(()=>unlink(alias));
  await prepareRemoteModules({root:alias,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch});
  await rm(join(temp,'remote'),{recursive:true});
  const result=await prepareRemoteModules({root:await realpath(root),temp,remoteImports:[URL_A]});
  assert.equal(result.modules.length,1);
});

test('replacement of a checked cache directory during fetch is rejected before persistent writes',async t=>{
  for(const symbolic of [false,true]){
    const {root,temp}=await fixture(t);
    const external=await mkdtemp(join(tmpdir(),'opendesk-remote-race-'));
    t.after(()=>rm(external,{recursive:true,force:true}));
    const cache=join(root,REMOTE_CACHE_DIR);
    const fetchImpl=async()=>{
      await rename(cache,cache+'-original');
      if(symbolic)await symlink(external,cache,'dir');else await mkdir(cache);
      return successFetch();
    };
    await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
      remoteImports:[URL_A],fetchImpl}),error=>code(error)==='E_REMOTE_PATH');
    assert.deepEqual(await readdir(external),[],'no cache bytes written through the planted symlink');
    if(!symbolic)assert.deepEqual(await readdir(cache),[]);
    await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
  }
});

test('replacement mutex is not released by the previous writer',async t=>{
  const {root,temp}=await fixture(t);
  const mutex=join(root,'.opendesk','remote-lock-write');
  const fetchImpl=async()=>{
    await rename(mutex,mutex+'-previous');await mkdir(mutex);
    return successFetch();
  };
  await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl}),error=>code(error)==='E_REMOTE_PATH');
  assert.deepEqual(await readdir(mutex),[],'the new owner lock must remain in place');
  await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
});

test('same-content replacement of a lockfile during fetch is not silently overwritten',async t=>{
  const {root,temp}=await fixture(t),lock=join(root,REMOTE_LOCK_FILE);
  const original=JSON.stringify({format:'opendesk.remote-lock.v1',modules:{}});
  await writeFile(lock,original);
  const fetchImpl=async()=>{
    await writeFile(lock+'.replacement',original);await rename(lock+'.replacement',lock);
    return successFetch();
  };
  await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl}),error=>code(error)==='E_REMOTE_LOCK_CHANGED');
  assert.equal(await readFile(lock,'utf8'),original);
});

test('hardlinked blobs and oversized lockfiles are rejected without reading external bytes',async t=>{
  const {root,temp}=await fixture(t);
  await prepareRemoteModules({root,temp,lockRemote:true,remoteImports:[URL_A],fetchImpl:successFetch});
  await rm(join(temp,'remote'),{recursive:true});
  const lockPath=join(root,REMOTE_LOCK_FILE),lock=JSON.parse(await readFile(lockPath,'utf8'));
  const blob=join(root,REMOTE_CACHE_DIR,lock.modules[URL_A].sha256+'.mjs');
  await link(blob,join(root,'another-link'));
  await assert.rejects(prepareRemoteModules({root,temp,remoteImports:[URL_A]}),
    error=>code(error)==='E_REMOTE_PATH');
  await writeFile(lockPath,' '.repeat(128*1024+1));
  await assert.rejects(prepareRemoteModules({root,temp,remoteImports:[URL_A]}),
    error=>code(error)==='E_REMOTE_PATH');
});

test('growth after fstat cannot bypass the read byte limit',async t=>{
  const {root,temp}=await fixture(t),lockPath=join(root,REMOTE_LOCK_FILE);
  await writeFile(lockPath,JSON.stringify({format:'opendesk.remote-lock.v1',modules:{}}));
  const probe=await open(lockPath,'r'),identity=await probe.stat({bigint:true});
  const prototype=Object.getPrototypeOf(probe),original=prototype.stat;
  await probe.close();
  let grew=false;
  t.mock.method(prototype,'stat',async function(options){
    const info=await original.call(this,options);
    if(!grew&&info.dev===identity.dev&&info.ino===identity.ino){
      grew=true;await appendFile(lockPath,' '.repeat(128*1024));
    }
    return info;
  });
  await assert.rejects(prepareRemoteModules({root,temp,remoteImports:[URL_A]}),
    error=>code(error)==='E_REMOTE_PATH');
  assert.equal(grew,true);
});

test('staged lock mutation is rejected before replacing the previous lock',async t=>{
  const {root,temp}=await fixture(t),lockPath=join(root,REMOTE_LOCK_FILE);
  const previous=JSON.stringify({format:'opendesk.remote-lock.v1',modules:{}});
  await writeFile(lockPath,previous);
  const probe=await open(lockPath,'r'),prototype=Object.getPrototypeOf(probe);
  const original=prototype.sync;await probe.close();
  let changed=false;
  t.mock.method(prototype,'sync',async function(){
    await original.call(this);
    const staging=(await readdir(root)).find(name=>name.startsWith(REMOTE_LOCK_FILE+'.tmp-'));
    if(!staging)return;
    const info=await this.stat({bigint:true}),candidate=await lstat(join(root,staging),{bigint:true});
    if(info.dev===candidate.dev&&info.ino===candidate.ino){
      changed=true;await writeFile(join(root,staging),previous);
    }
  });
  await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch}),error=>code(error)==='E_REMOTE_LOCK_CHANGED');
  assert.equal(changed,true);
  assert.equal(await readFile(lockPath,'utf8'),previous);
  assert.equal((await readdir(root)).some(name=>name.startsWith(REMOTE_LOCK_FILE+'.tmp-')),false);
});

test('a FIFO lockfile is rejected without blocking at open',async t=>{
  const {root,temp}=await fixture(t);
  await promisify(execFile)('mkfifo',[join(root,REMOTE_LOCK_FILE)]);
  const moduleURL=new URL('../../scripts/remote-esm-modules.mjs',import.meta.url).href;
  const script=`import {prepareRemoteModules} from ${JSON.stringify(moduleURL)};
    try {await prepareRemoteModules(${JSON.stringify({root,temp,remoteImports:[URL_A]})});process.exitCode=1;}
    catch(error){if(error.code!=='E_REMOTE_PATH')throw error;console.log(error.code);}`;
  // Isolate the open: removing NONBLOCK must fail this test by subprocess
  // timeout, rather than leaving the entire test runner waiting on a FIFO.
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{timeout:5000});
  assert.equal(stdout.trim(),'E_REMOTE_PATH');
});

test('symbolic cache directory, cache module and lockfile cannot escape the project',async t=>{
  const {root,temp}=await fixture(t);
  const external=await mkdtemp(join(tmpdir(),'opendesk-remote-external-'));
  t.after(()=>rm(external,{recursive:true,force:true}));
  await symlink(external,join(root,'.opendesk'),'dir');
  await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch}),error=>code(error)==='E_REMOTE_PATH');
  await unlink(join(root,'.opendesk'));
  await prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch});
  const lock=JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8'));
  const file=join(root,REMOTE_CACHE_DIR,lock.modules[URL_A].sha256+'.mjs');
  const copy=join(external,'valid.mjs');
  await writeFile(copy,good);
  await unlink(file);await symlink(copy,file);
  await assert.rejects(prepareRemoteModules({root,temp,remoteImports:[URL_A]}),
    error=>code(error)==='E_REMOTE_CACHE');
  await unlink(file);
  await writeFile(file,good);
  await unlink(join(root,REMOTE_LOCK_FILE));
  await symlink(copy,join(root,REMOTE_LOCK_FILE));
  await assert.rejects(prepareRemoteModules({root,temp,remoteImports:[URL_A]}),
    error=>code(error)==='E_REMOTE_LOCK');
});

test('simultaneous remote lock updates cannot overwrite each other',async t=>{
  const {root,temp}=await fixture(t);
  let begin,finish;
  const started=new Promise(resolve=>{begin=resolve;});
  const pending=new Promise(resolve=>{finish=resolve;});
  const slow=async()=>{begin();await pending;return successFetch();};
  const first=prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:slow});
  await started;
  await assert.rejects(prepareRemoteModules({root,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch}),
  error=>code(error)==='E_REMOTE_LOCK_BUSY');
  finish();
  await first;
  assert.ok(JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8')).modules[URL_A]);
});

test('remote cache checks canonicalize the granted project root before checking children',async t=>{
  const {root,temp}=await fixture(t);
  const alias=join(root,'project-root-alias');
  await symlink(root,alias,'dir');
  const result=await prepareRemoteModules({root:alias,temp,lockRemote:true,
    remoteImports:[URL_A],fetchImpl:successFetch});
  assert.equal(result.modules.length,1);
  assert.ok(JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8')).modules[URL_A]);
});

test('Page Sidebar preserves plain async main but never silently executes unbundled ESM',()=>{
  const client={ready:Promise.resolve()};
  const ordinary=createPageDependencyResolver({client,
    getSource:()=> 'async function main() { return 42; }'});
  assert.equal(ordinary.capture().entryFormat,'async-main');
  ordinary.dispose();
  for(const input of [
    "import {add} from 'https://cdn.example.org/add.js';",
    "import * as ns from 'https://cdn.example.org/ns.js';",
    "import 'https://cdn.example.org/effect.js';",
    "export * from './local.js';",
    "export default async function main() { return 42; }"
  ]){
    const resolver=createPageDependencyResolver({client,getSource:()=>input});
    assert.throws(()=>resolver.capture(),error=>code(error)==='E_ESM_BUILD_REQUIRED',input);
    resolver.dispose();
  }
});
