import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCookieAccountVault,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-vault.js';

function storageFixture(){
  const local=new Map(),session=new Map();
  const area=store=>({
    async get(key){return store.has(key)?{[key]:structuredClone(store.get(key))}:{};},
    async set(value){for(const [key,item] of Object.entries(value))store.set(key,structuredClone(item));},
    async remove(key){store.delete(key);}
  });
  return {api:{storage:{local:area(local),session:{
    ...area(session),async setAccessLevel({accessLevel}){
      assert.equal(accessLevel,'TRUSTED_CONTEXTS');
    }
  }}},local,session};
}

function reorderLocalReads(fixture){
  const get=fixture.api.storage.local.get;
  let reads=0;
  fixture.api.storage.local.get=async key=>{
    const result=await get(key);
    if(result[key]){
      const keys=Object.keys(result[key]).sort();
      if(reads++%2)keys.reverse();
      result[key]=Object.fromEntries(keys.map(field=>[field,result[key][field]]));
    }
    return result;
  };
}

test('first configuration accepts Chrome storage envelope key reordering',async()=>{
  const fixture=storageFixture();
  reorderLocalReads(fixture);
  const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
  assert.equal((await vault.unlock('sample-passphrase-only')).unlocked,true);
  assert.equal((await vault.read()).revision,0);
  await vault.lock();
  assert.equal((await vault.unlock('sample-passphrase-only')).unlocked,true);
});

test('update accepts reordered envelopes both before and after writing',async()=>{
  const fixture=storageFixture();
  const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
  await vault.unlock('sample-passphrase-only');
  reorderLocalReads(fixture);
  assert.equal(await vault.update(0,data=>{data.settings.autoRefresh=false;}),1);
  assert.equal((await vault.read()).settings.autoRefresh,false);
  await assert.rejects(vault.update(0,()=>{}),{code:'E_VAULT_CONFLICT'});
});

test('wrong passphrases and changed ciphertext remain rejected',async()=>{
  const fixture=storageFixture();
  const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
  await vault.unlock('sample-passphrase-only');
  await vault.lock();
  await assert.rejects(vault.unlock('different-passphrase-only'),
    {code:'E_VAULT_LOCKED_OR_CORRUPT'});
  const row=fixture.local.get(COOKIE_ACCOUNT_VAULT_KEY);
  row.ciphertext=(row.ciphertext[0]==='A'?'B':'A')+row.ciphertext.slice(1);
  await assert.rejects(vault.unlock('sample-passphrase-only'),
    {code:'E_VAULT_LOCKED_OR_CORRUPT'});
  assert.equal(fixture.session.has(COOKIE_ACCOUNT_SESSION_KEY),false);
});

test('update refuses a concurrent envelope change without overwriting it',async()=>{
  const fixture=storageFixture();
  const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
  await vault.unlock('sample-passphrase-only');
  reorderLocalReads(fixture);
  let competing;
  await assert.rejects(vault.update(0,async()=>{
    competing=structuredClone(fixture.local.get(COOKIE_ACCOUNT_VAULT_KEY));
    competing.iv=Buffer.alloc(12,42).toString('base64');
    fixture.local.set(COOKIE_ACCOUNT_VAULT_KEY,competing);
  }),{code:'E_VAULT_CONFLICT'});
  assert.deepEqual(fixture.local.get(COOKIE_ACCOUNT_VAULT_KEY),competing);
});

test('configuration and update reject incomplete, invalid or different readbacks',async t=>{
  const fields=['format','iterations','salt','iv','ciphertext'];
  const mutations=[
    ...fields.map(field=>[`missing ${field}`,row=>{delete row[field];}]),
    ...fields.map(field=>[`different ${field}`,row=>{
      row[field]=typeof row[field]==='number'?row[field]+1:
        (row[field][0]==='A'?'B':'A')+row[field].slice(1);
    }]),
    ['extra field',row=>{row.extra=true;}],
    ['invalid ciphertext',row=>{row.ciphertext='!';}]
  ];
  for(const phase of ['configuration','update'])for(const [name,mutate] of mutations){
    await t.test(`${phase}: ${name}`,async()=>{
      const fixture=storageFixture();
      const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
      if(phase==='update')await vault.unlock('sample-passphrase-only');
      const set=fixture.api.storage.local.set;
      fixture.api.storage.local.set=async value=>{
        await set(value);
        mutate(fixture.local.get(COOKIE_ACCOUNT_VAULT_KEY));
      };
      const operation=phase==='configuration'?vault.unlock('sample-passphrase-only'):
        vault.update(0,data=>{data.settings.autoRefresh=false;});
      await assert.rejects(operation,{code:'E_OUTCOME_UNKNOWN'});
      if(phase==='configuration')
        assert.equal(fixture.session.has(COOKIE_ACCOUNT_SESSION_KEY),false);
    });
  }
});

test('local account vault returns only metadata and encrypts its persistent state',async()=>{
  const fixture=storageFixture();
  const vault=createCookieAccountVault({api:fixture.api,cryptoImpl:webcrypto});
  assert.equal((await vault.status()).configured,false);
  assert.equal((await vault.unlock('sample-passphrase-only')).unlocked,true);
  await vault.update(0,data=>data.accounts.push({
    alias:'acct_test_01',origin:'https://example.com',displayName:'示例',
    version:1,allowAuto:false,cookies:[{name:'example',value:'synthetic'}]
  }));
  const status=await vault.status();
  assert.equal(status.accounts.length,1);
  assert.equal(Object.hasOwn(status.accounts[0],'cookies'),false);
  assert.doesNotMatch(JSON.stringify([...fixture.local.values()]),/synthetic/);
  await assert.rejects(vault.update(0,()=>{}),{code:'E_VAULT_CONFLICT'});
  await vault.lock();
  assert.equal((await vault.status()).unlocked,false);
});
