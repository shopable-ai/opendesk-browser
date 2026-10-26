import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCookieAccountVault} from '../../examples/sidebar-tools/cookie-editor/trusted/account-vault.js';

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
