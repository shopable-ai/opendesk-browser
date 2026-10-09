import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchPinnedRemote,isPublicRemoteAddress,resolveRemoteAddress}
  from '../../scripts/remote-esm-network.mjs';
import {prepareRemoteModules,REMOTE_CACHE_DIR,REMOTE_LOCK_FILE,remoteURL}
  from '../../scripts/remote-esm-modules.mjs';

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
    '2001::1','3fff::1']){
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
  content=good,contentLength}={},calls=[]){
  return (target,options,onResponse)=>{
    const req=new EventEmitter();
    req.destroyed=false;
    req.destroy=error=>{
      if(req.destroyed)return;
      req.destroyed=true;
      process.nextTick(()=>req.emit('error',error));
    };
    req.end=()=>process.nextTick(()=>{
      options.lookup(target.hostname,{},(error,address,family)=>{
        if(error){req.destroy(error);return;}
        calls.push({target:target.href,options,address,family});
        const socket=new EventEmitter();
        socket.remoteAddress=peer??address;
        req.emit('socket',socket);
        socket.emit('connect');
        if(req.destroyed)return;
        socket.emit('secureConnect');
        if(req.destroyed)return;
        const res=new PassThrough();
        res.socket=socket;res.statusCode=statusCode;
        res.headers={'content-type':mime};
        if(contentLength!==undefined)res.headers['content-length']=String(contentLength);
        onResponse(res);
        res.end(content);
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
  assert.equal(calls[0].options.rejectUnauthorized,false===true);
  assert.equal(calls[0].options.signal instanceof AbortSignal,true);
  assert.equal(calls[0].options.headers['accept-encoding'],'identity');
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
