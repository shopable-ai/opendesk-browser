import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sdkMethods} from '../../src/platform/host/sdk-methods.js';
import {automaticSdkTargetOrigins} from '../../src/framework/sdk/auto-policy.js';
import {validateSdkRequest} from '../../src/framework/sdk/registry.js';
import {verifyManifest} from '../../scripts/verify-package.mjs';

const demo='http://127.0.0.1:43111/demo-form.html';
function fixture(url=demo) {
  let journal=new Map(), tail=Promise.resolve();
  const permissions=new Set(['http://127.0.0.1/*','https://httpbingo.org/*','https://api.ipify.org/*','https://first.example/*']);
  const sender={id:'extension',url,frameId:0,documentId:'doc-1',documentLifecycle:'active',tab:{id:3,incognito:false}};
  const storage={transaction(names,mode,work){
    const run=tail.then(async()=>{
      const rows=new Map(journal);
      const tx={get:async(name,key)=>structuredClone(rows.get(name)?.get(key)),
        all:async name=>[...(rows.get(name)?.values()||[])].map(value=>structuredClone(value)),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');if(!rows.has(name))rows.set(name,new Map());rows.get(name).set(key,structuredClone(value));}};
      const result=await work(tx);if(mode==='readwrite')journal=rows;return result;
    });tail=run.catch(()=>{});return run;
  }};
  const api={runtime:{id:'extension'},webNavigation:{getAllFrames:async()=>[
    {frameId:0,documentId:'doc-1',url,documentLifecycle:'active'}]},
    permissions:{contains:async({origins=[],permissions:ps=[]})=>!ps.length&&origins.every(v=>permissions.has(v))}};
  const options={api,storage,session:'session',clock:{now:()=>1000},
    assertHost:async()=>({registrationId:'host'}),currentHost:async()=>{}};
  const make=()=>sdkMethods(options),request=(id,url)=>validateSdkRequest({
    requestId:id,method:'AXIOS_GET',args:{url},deadlineAt:10000});
  return {sender,permissions,make,request,rows:()=>journal};
}

test('manifest auto-injects both fixed worlds, no user action and no extra output',async()=>{
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert.doesNotThrow(()=>verifyManifest(manifest));
  assert.deepEqual(manifest.content_scripts.map(x=>x.world),['ISOLATED','MAIN']);
  assert(manifest.content_scripts.every(x=>x.run_at==='document_start'&&x.all_frames));
  assert.deepEqual(manifest.content_scripts.map(x=>x.js),[['agents/page-relay.js'],['framework/sdk-main.js']]);
});

test('fixed demo exception is exact, with no wildcard URL/port/frame',()=>{
  assert.deepEqual(automaticSdkTargetOrigins(demo,0),['https://httpbingo.org','https://api.ipify.org']);
  for(const [url,frame] of [[demo,1],['http://localhost:43111/demo-form.html',0],
    ['http://127.0.0.1:43113/demo-form.html',0],['http://127.0.0.1:43111/other.html',0],
    ['https://127.0.0.1:43111/demo-form.html',0],['http://127.0.0.1.evil.test:43111/demo-form.html',0]])
    assert.deepEqual(automaticSdkTargetOrigins(url,frame),[]);
  assert.equal(automaticSdkTargetOrigins('file:///tmp/demo.html',0),null);
});

test('lazy Hello establishes a single exact HTTP-only grant, not privileged services',async()=>{
  const f=fixture(),authority=f.make();
  const hello=await authority.helloSdk({sdkVersion:'1.0.0'},f.sender);
  assert.equal(hello.ready,true);assert(hello.methods.includes('AXIOS_GET'));
  assert(hello.methods.includes('AXIOS_POST'));assert(!hello.methods.includes('APPSTORAGE_GETITEM'));
  await authority.helloSdk({sdkVersion:'1.0.0'},f.sender);
  const rows=[...f.rows().get('commandJournal').values()].filter(row=>row.tag==='sdk-grant');
  assert.equal(rows.length,1);assert.equal(rows[0].automatic,true);
  assert.deepEqual(rows[0].allowedOrigins,['http://127.0.0.1:43111','https://api.ipify.org','https://httpbingo.org']);
  const admitted=await authority.admitSdk(f.request('ok','https://httpbingo.org/get'),f.sender);
  assert.equal(admitted.context.capability,'network');
  await assert.rejects(authority.admitSdk(f.request('no','https://first.example/secret'),f.sender),{code:'E_PERMISSION'});
  assert.equal([...(f.rows().get('runs')?.values()||[])].length,1);
});

test('normal external website only automatically accesses its own Origin',async()=>{
  const f=fixture('https://first.example/home'),a=f.make();
  await a.helloSdk({sdkVersion:'1.0.0'},f.sender);
  const row=[...f.rows().get('commandJournal').values()].find(x=>x.tag==='sdk-grant');
  assert.deepEqual(row.allowedOrigins,['https://first.example']);
  assert.equal((await a.admitSdk(f.request('own','https://first.example/api'),f.sender)).context.capability,'network');
  await assert.rejects(a.admitSdk(f.request('cross','https://httpbingo.org/get'),f.sender),{code:'E_PERMISSION'});
});

test('user revocation fences auto grant, Worker restart cannot restore it',async()=>{
  const f=fixture(),a=f.make();
  await a.helloSdk({sdkVersion:'1.0.0'},f.sender);
  const row=[...f.rows().get('commandJournal').values()].find(x=>x.tag==='sdk-grant');
  await a.revokeSdkGrants({tabId:3,frameId:0,documentId:'doc-1',grantIncarnation:row.grantIncarnation,reason:'user-revoked'});
  await assert.rejects(a.helloSdk({sdkVersion:'1.0.0'},f.sender),{code:'E_GRANT_REVOKED'});
  const restored=f.make();await restored.recoverSdk();
  await assert.rejects(restored.helloSdk({sdkVersion:'1.0.0'},f.sender),{code:'E_GRANT_REVOKED'});
});

test('Worker restart auto-renews fixed scope but locks old request IDs',async()=>{
  const f=fixture(),a=f.make();
  await a.helloSdk({sdkVersion:'1.0.0'},f.sender);
  await a.admitSdk(f.request('old','https://httpbingo.org/get'),f.sender);
  const initial=[...f.rows().get('commandJournal').values()].find(x=>x.tag==='sdk-grant');
  const restarted=f.make();await restarted.recoverSdk();
  assert.equal((await restarted.helloSdk({sdkVersion:'1.0.0'},f.sender)).ready,true);
  const fresh=[...f.rows().get('commandJournal').values()].filter(x=>x.tag==='sdk-grant'&&x.grantIncarnation!==initial.grantIncarnation);
  assert.equal(fresh.length,1,'one new automatic grant replaces the expired active key');
  assert.equal(fresh[0].automatic,true);
  await assert.rejects(restarted.admitSdk(f.request('old','https://httpbingo.org/get'),f.sender),{code:'E_GRANT_REVOKED'});
  assert.equal((await restarted.admitSdk(f.request('new','https://httpbingo.org/get'),f.sender)).context.capability,'network');
});

test('real Chrome sender and live permission are required to bootstrap',async()=>{
  const f=fixture(),a=f.make();
  await assert.rejects(a.helloSdk({sdkVersion:'1.0.0'},{...f.sender,id:'forged'}),{code:'E_OWNER'});
  f.permissions.delete('http://127.0.0.1/*');
  await assert.rejects(a.helloSdk({sdkVersion:'1.0.0'},f.sender),{code:'E_PERMISSION'});
  assert.equal(f.rows().get('commandJournal')?.size??0,0);
});
