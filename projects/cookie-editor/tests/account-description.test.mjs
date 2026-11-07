import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccountDescription,COOKIE_ACCOUNT_STORE_KEY,
  COOKIE_ACCOUNT_OPERATIONS,COOKIE_ACCOUNT_EFFECTS} from '../trusted/account-contract.js';
import {createCookieAccountVault} from '../trusted/account-vault.js';

const clone=value=>structuredClone(value);
function fixture(initial){
  const records=new Map();
  if(initial)records.set(COOKIE_ACCOUNT_STORE_KEY,clone(initial));
  const storage=async()=>({transaction:async(_stores,_mode,action)=>action({
    get:(_table,key)=>clone(records.get(key)),
    put:(_table,value,key)=>{records.set(key,clone(value));},
    delete:(_table,key)=>{records.delete(key);}
  })});
  const api={storage:{local:{get:async()=>({})}}};
  return {records,create:()=>createCookieAccountVault({api,storage})};
}
const legacyRow=()=>({
  format:1,revision:6,legacyMigrated:false,
  settings:{autoRefresh:true,autoEnabled:false},
  accounts:[{alias:'acct_legacy_001',origin:'https://shop.example.com',
    displayName:'旧版工作账号',version:3,allowAuto:true,
    cookies:[{name:'sid',value:'SECRET_NEVER_FOR_REACT'}]}]
});

test('trusted description validation accepts optional metadata, normalizes whitespace and rejects unsafe input',()=>{
  assert.equal(normalizeAccountDescription(undefined),'');
  assert.equal(normalizeAccountDescription(undefined,'旧描述'),'旧描述');
  assert.equal(normalizeAccountDescription('  客服团队\n 日常使用  '),'客服团队 日常使用');
  assert.equal(normalizeAccountDescription('a'.repeat(120)).length,120);
  for(const value of ['a'.repeat(121),'bad\u0000text',42,null,{}])
    assert.throws(()=>normalizeAccountDescription(value),{code:'E_ACCOUNT_DESCRIPTION'});
});

test('legacy account reads default description, never expose Cookie values, and survive reopen',async()=>{
  const f=fixture(legacyRow()),vault=f.create();
  const before=await vault.read();
  assert.equal(before.revision,6);
  assert.equal(before.accounts[0].description,'');
  const status=await vault.status();
  assert.equal(status.accounts[0].description,'');
  assert.equal(status.accounts[0].cookieCount,1);
  assert.equal(status.accounts[0].version,3);
  assert.doesNotMatch(JSON.stringify(status),/SECRET_NEVER_FOR_REACT|cookies/);
  assert.equal((await vault.update(6,data=>{
    data.accounts[0].description='客服团队日常使用';
  })),7);
  const reopened=await f.create().read();
  assert.equal(reopened.accounts[0].description,'客服团队日常使用');
  assert.equal(reopened.accounts[0].displayName,'旧版工作账号');
  assert.equal(reopened.accounts[0].alias,'acct_legacy_001');
  assert.equal(reopened.accounts[0].version,3);
  assert.deepEqual(reopened.accounts[0].cookies,before.accounts[0].cookies);
  assert.equal((await f.create().status()).accounts[0].description,'客服团队日常使用');
});

test('vault refuses malformed persisted descriptions rather than exposing corrupt metadata',async()=>{
  const row=legacyRow();
  row.accounts[0].description='a'.repeat(121);
  const f=fixture(row);
  await assert.rejects(()=>f.create().read(),{code:'E_VAULT_CORRUPT'});
});

test('empty account metadata survives trusted Vault readback, rename and deletion',async()=>{
  const f=fixture(),vault=f.create();
  const account={alias:'acct_empty_001',origin:'https://shop.example.com',
    displayName:'工作账号',description:'客服团队日常使用',version:1,
    allowAuto:false,cookies:[]};
  assert.equal(await vault.update(0,data=>{data.accounts.push(account);}),1);
  const initial=await f.create().status();
  assert.equal(initial.revision,1);
  assert.equal(initial.accounts[0].cookieCount,0);
  assert.equal(initial.accounts[0].displayName,'工作账号');
  assert.equal(initial.accounts[0].description,'客服团队日常使用');
  assert.equal(initial.accounts[0].allowAuto,false);
  assert.deepEqual((await vault.read()).accounts[0].cookies,[]);
  assert.equal(await vault.update(1,data=>{
    data.accounts[0].displayName='工作账号（改名）';
    data.accounts[0].description='重新编辑';
  }),2);
  assert.equal((await f.create().status()).accounts[0].displayName,'工作账号（改名）');
  assert.equal((await f.create().status()).accounts[0].cookieCount,0);
  assert.equal(await vault.update(2,data=>{data.accounts.splice(0,1);}),3);
  assert.deepEqual((await f.create().status()).accounts,[]);
});

test('first Cookie association is a trusted-click mutation, not a status read',()=>{
  assert.ok(COOKIE_ACCOUNT_OPERATIONS.includes('attach'));
  assert.ok(COOKIE_ACCOUNT_EFFECTS.includes('attach'));
  assert.equal(COOKIE_ACCOUNT_EFFECTS.includes('status'),false);
});
