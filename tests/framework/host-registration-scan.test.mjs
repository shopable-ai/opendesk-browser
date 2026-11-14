import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {CONTRACT_VERSION,CONTRACT_HASH} from '../../src/platform/protocol.js';

async function fixture({scan=true}={}){
  const journal=new Map(),reads=[],transactions=[];
  let guarded=false,failScan=false;
  const storage={async transaction(names,mode,work){
    const transaction={names,mode};transactions.push(transaction);
    const store=name=>{assert.ok(names.includes(name));return name==='commandJournal'?journal:new Map();};
    const materialize=(name,key,value)=>{
      if(guarded)reads.push({kind:'value',name,key,transaction});
      return structuredClone(value);
    };
    const tx={
      get:async(name,key)=>{
        if(guarded)reads.push({kind:'get',name,key,transaction});
        return materialize(name,key,store(name).get(key));
      },
      all:async name=>{
        if(guarded){
          reads.push({kind:'all',name,transaction});
          assert.ok(!scan||name!=='commandJournal','Default host lookup must not materialize the full journal');
        }
        return [...store(name)].map(([key,value])=>materialize(name,key,value));
      },
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');store(name).set(key,structuredClone(value));}
    };
    if(scan)tx.scanEntries=async(name,options)=>{
      assert.equal(name,'commandJournal');assert.equal(options.prefix,'host:');assert.equal(options.limit,256);
      if(guarded)reads.push({kind:'scan',...options,transaction});
      if(failScan)throw new Error('host cursor failed');
      return [...store(name)].filter(([key])=>key>=options.prefix&&key<options.prefix+'\uffff'&&
        (options.afterKey===undefined||key>options.afterKey)).sort(([a],[b])=>a<b?-1:a>b?1:0)
        .slice(0,options.limit).map(([key,value])=>({key,value:materialize(name,key,value)}));
    };
    return work(tx);
  }};
  const extensionId='abcdefghijklmnopabcdefghijklmnop';
  const api={runtime:{id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`}};
  const sender={id:extensionId,url:api.runtime.getURL('sidepanel.html'),documentId:'host-document',frameId:0};
  const authority=createRunAuthority({storage,api,session:'browser-session',clock:{now:()=>1000},cloudFactory:null});
  const registration=await authority.registerHost({hostInstanceId:'host-instance',
    claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},sender);
  const key='host:'+registration.registrationId;
  guarded=true;reads.length=0;transactions.length=0;
  return {authority,sender,registration,key,journal,reads,transactions,
    patch:changes=>journal.set(key,{...journal.get(key),...changes}),
    failScan:()=>{failScan=true;}};
}

const ownerError={code:'E_OWNER',message:'Host registration has expired or belongs to another document'};

test('default admission pages host primary keys in one readonly transaction without decoding unrelated history',async()=>{
  const f=await fixture();
  for(let n=0;n<520;n++)f.journal.set('host:!'+String(n).padStart(4,'0'),{
    ...f.journal.get(f.key),registrationId:'other-'+n,hostDocumentId:'other-document-'+n});
  f.journal.set('controller-op:large',{tag:'controller-operation',payload:'x'.repeat(8*1024*1024)});
  const sentinel={tag:'page-task-request'};
  Object.defineProperty(sentinel,'payload',{enumerable:true,get(){throw new Error('Unrelated sentinel decoded');}});
  f.journal.set('page-task-request:sentinel',sentinel);
  f.patch({namespace:'untrusted-namespace',principal:'untrusted-principal'});
  const host=await f.authority.assertHost(f.sender);
  assert.equal(host.registrationId,f.registration.registrationId);
  assert.equal(host.namespace,`tool:${f.sender.id}`);
  assert.equal(host.principal,`extension-tool:${f.sender.id}`);
  const pages=f.reads.filter(read=>read.kind==='scan');
  assert.equal(pages.length,3);
  assert.deepEqual(pages.map(page=>page.afterKey),[undefined,'host:!0255','host:!0511']);
  assert.equal(f.transactions.length,1);
  assert.deepEqual(f.transactions[0],{names:['commandJournal'],mode:'readonly'});
  assert.ok(f.reads.every(read=>read.transaction===f.transactions[0]));
  const values=f.reads.filter(read=>read.kind==='value');
  assert.equal(values.length,521);
  assert.ok(values.every(read=>read.key.startsWith('host:')));
});

for(const scan of [true,false]){
  const path=scan?'paged scan':'legacy all fallback';
  test(`${path} preserves host admission, stable identity and exact registration lookup`,async()=>{
    const f=await fixture({scan});
    f.patch({namespace:'legacy',principal:'legacy'});
    const host=await f.authority.assertHost(f.sender);
    assert.equal(host.registrationId,f.registration.registrationId);
    assert.equal(host.namespace,`tool:${f.sender.id}`);
    assert.equal(host.principal,`extension-tool:${f.sender.id}`);
    assert.equal(f.reads.some(read=>read.kind==='all'),!scan);
    f.reads.length=0;f.failScan();
    assert.deepEqual(await f.authority.assertHost(f.sender,f.registration.registrationId),host);
    assert.deepEqual(f.reads.filter(read=>read.kind!=='value').map(({kind,key})=>({kind,key})),
      [{kind:'get',key:f.key}]);
    await assert.rejects(f.authority.assertHost(f.sender,'missing-registration'),ownerError);
  });

  for(const [reason,changes] of Object.entries({tag:{tag:'command'},document:{hostDocumentId:'other-document'},
    inactive:{active:false},session:{browserSessionIncarnation:'previous-session'},url:{hostUrl:'https://foreign.example/'}})){
    test(`${path} rejects a host with mismatched ${reason} for default and exact lookup`,async()=>{
      const f=await fixture({scan});f.patch(changes);
      await assert.rejects(f.authority.assertHost(f.sender),ownerError);
      await assert.rejects(f.authority.assertHost(f.sender,f.registration.registrationId),ownerError);
    });
  }

  test(`${path} does not bypass the first matching document when its URL differs`,async()=>{
    const f=await fixture({scan}),original={...f.journal.get(f.key)};
    f.patch({hostUrl:'https://stale.example/'});
    f.journal.set('host:zzzz-later-match',{...original,registrationId:'later-match'});
    await assert.rejects(f.authority.assertHost(f.sender),ownerError);
  });

  test(`${path} rejects an untrusted sender before touching storage`,async()=>{
    const f=await fixture({scan});
    await assert.rejects(f.authority.assertHost({...f.sender,id:'foreign-extension'}),
      {code:'E_OWNER',message:'Only an actual packaged tool document may own a run'});
    assert.equal(f.transactions.length,0);
  });
}

test('missing hosts exhausts a full page and cursor failure does not fall back to full history',async()=>{
  const f=await fixture();f.journal.delete(f.key);
  for(let n=0;n<256;n++)f.journal.set('host:'+String(n).padStart(4,'0'),{tag:'host',hostDocumentId:'other'});
  await assert.rejects(f.authority.assertHost(f.sender),ownerError);
  assert.deepEqual(f.reads.filter(read=>read.kind==='scan').map(read=>read.afterKey),[undefined,'host:0255']);
  f.failScan();
  await assert.rejects(f.authority.assertHost(f.sender),{message:'host cursor failed'});
  assert.equal(f.reads.some(read=>read.kind==='all'),false);
});
