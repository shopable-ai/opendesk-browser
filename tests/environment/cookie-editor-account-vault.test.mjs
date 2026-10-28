import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCookieAccountVault,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,
  COOKIE_ACCOUNT_STORE_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-vault.js';

function storageFixture(){
  const local=new Map(),session=new Map(),records=new Map(),access=[];
  const hooks={};let queue=Promise.resolve();
  const area=store=>({async get(key){return store.has(key)?{[key]:structuredClone(store.get(key))}:{};}});
  const storage=async()=>({transaction(stores,mode,work){
    const run=queue.then(async()=>{
      assert.deepEqual(stores,['frameworkKV']);assert.ok(['readonly','readwrite'].includes(mode));
      const working=structuredClone(records);
      const tx={
        async get(store,key){assert.equal(store,'frameworkKV');
          const value=structuredClone(working.get(key));return hooks.get?hooks.get(value,mode):value;},
        async put(store,value,key){assert.equal(mode,'readwrite');assert.equal(store,'frameworkKV');
          working.set(key,structuredClone(value));if(hooks.put)await hooks.put(working,key);},
        async delete(store,key){assert.equal(mode,'readwrite');assert.equal(store,'frameworkKV');
          working.delete(key);if(hooks.delete)await hooks.delete(working,key);}
      };
      const result=await work(tx);
      if(mode==='readwrite'){
        records.clear();for(const [key,value] of working)records.set(key,value);
        if(hooks.commit)await hooks.commit(records);
      }
      return result;
    });
    queue=run.catch(()=>{});return run;
  }});
  return {api:{storage:{local:{...area(local),
    async set(){assert.fail('must not write raw accounts to Chrome local');},
    async setAccessLevel(){assert.fail('must not change the shared local access policy');}
  },session:{...area(session),async setAccessLevel({accessLevel}){
    assert.equal(accessLevel,'TRUSTED_CONTEXTS');access.push('session');
  }}}},local,session,records,storage,hooks,access};
}
const account=()=>({alias:'acct_test_01',origin:'https://example.com',displayName:'示例',
  version:1,allowAuto:false,cookies:[{name:'example',value:'synthetic'}]});
const empty=()=>({revision:0,accounts:[],settings:{autoRefresh:true,autoEnabled:false}});
const create=f=>createCookieAccountVault({api:f.api,storage:f.storage,cryptoImpl:webcrypto});
async function legacy(f,{session=true}={}){
  const bytes=webcrypto.getRandomValues(new Uint8Array(32));
  const salt=Buffer.alloc(16,1).toString('base64'),iv=Buffer.alloc(12,2);
  const key=await webcrypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt']);
  const data={...empty(),revision:7,accounts:[account()]};
  const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,
    additionalData:new TextEncoder().encode('opendesk.cookie-editor.vault.v1')},
  key,new TextEncoder().encode(JSON.stringify(data)));
  const row={format:1,iterations:420000,salt,iv:iv.toString('base64'),
    ciphertext:Buffer.from(ciphertext).toString('base64')};
  f.local.set(COOKIE_ACCOUNT_VAULT_KEY,structuredClone(row));
  if(session)f.session.set(COOKIE_ACCOUNT_SESSION_KEY,{format:1,salt,key:Buffer.from(bytes).toString('base64')});
  return {row,data};
}

test('new users are ready and can save at revision zero without a passphrase or session storage',async()=>{
  const f=storageFixture();delete f.api.storage.session;
  const store=create(f),status=await store.status();
  assert.equal(status.unlocked,true);assert.equal(status.revision,0);
  assert.equal(store.unlock,undefined);assert.equal(store.lock,undefined);
  await store.update(0,data=>data.accounts.push(account()));
  assert.equal(f.local.has(COOKIE_ACCOUNT_VAULT_KEY),false);
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts[0].cookies[0].value,'synthetic');
  const restarted=create(f);
  assert.equal((await restarted.read()).accounts[0].cookies[0].value,'synthetic');
  const metadata=await restarted.status();
  assert.equal(metadata.configured,true);assert.equal(metadata.unlocked,true);
  assert.equal(metadata.revision,1);assert.equal(metadata.accounts.length,1);
  assert.doesNotMatch(JSON.stringify(metadata),/synthetic|cookies|ciphertext|salt/);
  assert.equal(f.access.includes('local'),false);
  assert.doesNotMatch(JSON.stringify([...f.local.values()]),/synthetic/);
});

test('missing, unavailable or readonly Foundation storage fails closed without writing local',async()=>{
  for(const storage of [undefined,async()=>null,async()=>{throw Error('unavailable');},
    async()=>({readOnly:true,transaction(){assert.fail('readonly storage');}}),
    async()=>({transaction(){throw Error('closed');}})]){
    const f=storageFixture(),store=createCookieAccountVault({api:f.api,storage});
    for(const operation of [()=>store.status(),()=>store.read(),()=>store.update(0,()=>{})])
      await assert.rejects(operation(),{code:'E_ACCOUNT_STORAGE_UNAVAILABLE'});
    assert.equal(f.local.size,0);assert.equal(f.records.size,0);
  }
});

test('valid trusted session key migrates once, preserving old ciphertext and revision',async()=>{
  const f=storageFixture(),{row,data}=await legacy(f);
  const store=create(f),status=await store.status();
  assert.equal(status.legacyLocked,false);assert.equal(status.revision,7);
  assert.deepEqual((await store.read()).accounts,data.accounts);
  assert.deepEqual(f.local.get(COOKIE_ACCOUNT_VAULT_KEY),row);
  assert.ok(f.access.includes('session'));
  f.session.clear();delete f.api.storage.session;
  await create(f).update(7,next=>{next.accounts[0].displayName='新名称';});
  assert.equal((await create(f).status()).legacyLocked,false);
  assert.deepEqual(f.local.get(COOKIE_ACCOUNT_VAULT_KEY),row);
});

test('locked or unusable legacy data stays byte-identical and is reported without blocking new saves',async()=>{
  for(const kind of ['missing','wrong','untrusted','corrupt']){
    const f=storageFixture(),{row}=await legacy(f,{session:kind!=='missing'});
    if(kind==='wrong')f.session.get(COOKIE_ACCOUNT_SESSION_KEY).key=Buffer.alloc(32,9).toString('base64');
    if(kind==='untrusted')f.api.storage.session.setAccessLevel=async()=>{throw Error('denied');};
    if(kind==='corrupt'){row.ciphertext='invalid';f.local.set(COOKIE_ACCOUNT_VAULT_KEY,structuredClone(row));}
    const store=create(f),status=await store.status();
    assert.equal(status.unlocked,true);assert.equal(status.legacyLocked,true);
    assert.equal(status.revision,0);assert.deepEqual(status.accounts,[]);
    assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
    await store.update(0,next=>next.accounts.push({...account(),alias:'acct_new'}));
    assert.equal((await create(f).status()).legacyLocked,true);
    assert.deepEqual(f.local.get(COOKIE_ACCOUNT_VAULT_KEY),row);
  }
});

test('revision and concurrent storage changes cannot overwrite newer accounts',async()=>{
  const f=storageFixture(),store=create(f);
  await store.update(0,data=>data.accounts.push(account()));
  await assert.rejects(store.update(0,()=>{}),{code:'E_VAULT_CONFLICT'});
  let competing;
  await assert.rejects(store.update(1,()=>{
    competing=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
    competing.revision++;f.records.set(COOKIE_ACCOUNT_STORE_KEY,competing);
  }),{code:'E_VAULT_CONFLICT'});
  assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),competing);
  const results=await Promise.allSettled([store.update(2,()=>{}),store.update(2,()=>{})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'E_VAULT_CONFLICT');
});

test('storage key reordering does not produce conflicts or unknown results',async()=>{
  const f=storageFixture();
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?
    Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  f.hooks.get=reorder;
  const store=create(f);
  await store.update(0,data=>data.accounts.push(account()));
  await store.update(1,data=>{data.settings.autoRefresh=false;});
  assert.equal((await store.read()).settings.autoRefresh,false);
});

test('writes and migration reject missing, altered, extra or failed readbacks as unknown',async()=>{
  for(const phase of ['first save','update','migration'])for(const kind of ['missing','changed','extra','throw','commit throws']){
    const f=storageFixture(),store=create(f);
    if(phase==='update')await store.update(0,()=>{});
    if(phase==='migration')await legacy(f);
    f.hooks.commit=records=>{
      if(kind==='missing')records.delete(COOKIE_ACCOUNT_STORE_KEY);
      if(kind==='changed')records.get(COOKIE_ACCOUNT_STORE_KEY).revision++;
      if(kind==='extra')records.get(COOKIE_ACCOUNT_STORE_KEY).extra=true;
      if(kind==='throw')f.hooks.get=()=>{throw Error('read failed');};
      if(kind==='commit throws')throw Error('unknown commit');
    };
    await assert.rejects(phase==='migration'?store.status():store.update(phase==='update'?1:0,()=>{}),
      {code:'E_OUTCOME_UNKNOWN'},phase+': '+kind);
    if(phase==='migration')assert.ok(f.local.has(COOKIE_ACCOUNT_VAULT_KEY));
  }
});

test('account validation and byte capacity still reject invalid saves before writing',async()=>{
  for(const change of [data=>{data.accounts=[account(),account()];},
    data=>{data.accounts=[{...account(),origin:'file:///tmp'}];},
    data=>{data.accounts=[{...account(),displayName:' bad '}];},
    data=>{data.accounts=[{...account(),cookies:Array(101).fill({})}];}]){
    const f=storageFixture();
    await assert.rejects(create(f).update(0,change),{code:'E_VAULT_CORRUPT'});
    assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
  }
  const f=storageFixture();
  await assert.rejects(create(f).update(0,data=>{
    data.accounts=[{...account(),cookies:[{value:'x'.repeat(512000)}]}];
  }),{code:'E_VAULT_LIMIT'});
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
});

test('migration refuses a concurrent legacy or new-store change without replacing either writer',async()=>{
  for(const key of [COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_STORE_KEY]){
    const f=storageFixture(),{row}=await legacy(f),get=f.api.storage.session.get;
    let competing;
    f.api.storage.session.get=async name=>{
      const value=await get(name);
      competing=key===COOKIE_ACCOUNT_VAULT_KEY?{...row,iv:Buffer.alloc(12,5).toString('base64')}:
        {format:1,...empty(),revision:5,legacyMigrated:false};
      (key===COOKIE_ACCOUNT_STORE_KEY?f.records:f.local).set(key,structuredClone(competing));
      return value;
    };
    await assert.rejects(create(f).status(),{code:'E_VAULT_CONFLICT'});
    assert.deepEqual((key===COOKIE_ACCOUNT_STORE_KEY?f.records:f.local).get(key),competing);
    if(key===COOKIE_ACCOUNT_VAULT_KEY)assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
    else assert.deepEqual(f.local.get(COOKIE_ACCOUNT_VAULT_KEY),row);
  }
});

test('corrupt new account records fail closed instead of falling back to legacy or empty data',async()=>{
  for(const row of [null,{}, {format:1,...empty(),legacyMigrated:false,extra:true},
    {format:1,...empty(),revision:-1,legacyMigrated:false}]){
    const f=storageFixture();f.records.set(COOKIE_ACCOUNT_STORE_KEY,row);
    const store=create(f);
    for(const operation of [()=>store.status(),()=>store.read(),()=>store.update(0,()=>{})])
      await assert.rejects(operation(),{code:'E_VAULT_CORRUPT'});
    assert.deepEqual(f.records.get(COOKIE_ACCOUNT_STORE_KEY),row);
  }
});

test('separate store instances serialize compare-and-write through Foundation transactions',async()=>{
  const f=storageFixture(),first=create(f),second=create(f);
  const results=await Promise.allSettled([
    first.update(0,data=>data.accounts.push(account())),
    second.update(0,data=>data.accounts.push({...account(),alias:'acct_other'}))
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'E_VAULT_CONFLICT');
  assert.equal((await create(f).read()).accounts.length,1);
});

test('clear deletes only the Foundation account key and preserves legacy ciphertext byte-for-byte',async()=>{
  const f=storageFixture(),{row}=await legacy(f),store=create(f);
  await store.status();f.records.set('unrelated',{value:'protected'});
  assert.deepEqual(await store.clear(),{cleared:true});
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),false);
  assert.deepEqual(f.records.get('unrelated'),{value:'protected'});
  assert.deepEqual(f.local.get(COOKIE_ACCOUNT_VAULT_KEY),row);
  assert.deepEqual(await store.clear(),{cleared:true});
});

test('clear reports unknown on unconfirmed deletion, failed commit or failed readback',async()=>{
  for(const kind of ['retained','commit throws','read throws']){
    const f=storageFixture(),store=create(f);
    await store.update(0,data=>data.accounts.push(account()));
    const before=structuredClone(f.records.get(COOKIE_ACCOUNT_STORE_KEY));
    if(kind==='retained')f.hooks.delete=(records,key)=>records.set(key,before);
    if(kind==='commit throws')f.hooks.commit=()=>{throw Error('unknown commit');};
    if(kind==='read throws')f.hooks.commit=()=>{f.hooks.get=()=>{throw Error('read failed');};};
    await assert.rejects(store.clear(),{code:'E_OUTCOME_UNKNOWN'});
  }
});
