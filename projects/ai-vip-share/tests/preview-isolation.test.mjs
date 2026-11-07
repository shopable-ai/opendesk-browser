import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import config from '../preview/vite.config.mjs';

test('preview works beside read-only real SDK globals without using real capabilities',async()=>{
  const source=await readFile(new URL('../preview/sdk-fixture.js',import.meta.url),'utf8');
  const {outputFiles}=await build({stdin:{contents:source,loader:'js'},bundle:true,
    write:false,format:'iife',globalName:'Fixture',define:config.define});
  const page={URL,structuredClone,location:{href:'http://preview.localhost/?scene=member'}};
  const realTool=Object.freeze({request(){throw Error('real tool must not be used');}});
  const realSdk=Object.freeze({browser:{network:{request(){throw Error('real SDK must not be used');}}}});
  Object.defineProperties(page,{OpenDeskTool:{value:realTool},OpenDeskSDK:{value:realSdk}});
  page.window=page;
  const context=vm.createContext(page);
  vm.runInContext(outputFiles[0].text,context);
  vm.runInContext('Fixture.installPreviewFixture({})',context);
  assert.equal(page.OpenDeskTool,realTool);
  assert.equal(page.OpenDeskSDK,realSdk);
  const request=page.__OpenDeskVipPreviewSDK.browser.network.request;
  const member=await request({method:'GET',url:'https://vip.example.com/api/member'});
  assert.equal(member.data.account.state,'bound');
  await assert.rejects(request({method:'GET',url:'https://example.com/api/member'}),/NO_EXTERNAL_NETWORK/);
  const cookies=page.__OpenDeskVipPreviewSDK.browser.cookies;
  assert.equal((await cookies.getCurrentStore({url:'https://chatgpt.com/'})).storeId,'0');
  assert.equal((await cookies.getPartitionKey({url:'https://chatgpt.com/'})).preview,true);
  await assert.rejects(cookies.getCurrentStore({url:'https://example.com/'}),/UNAPPROVED_CONTEXT/);
  await assert.rejects(cookies.setMany({url:'https://chatgpt.com/',cookies:[{name:'synthetic'}]}),/INVALID_DELIVERY/);
});

test('only the session preview supplies a website directory, including after redemption',async()=>{
  const source=await readFile(new URL('../preview/sdk-fixture.js',import.meta.url),'utf8');
  const {outputFiles}=await build({stdin:{contents:source,loader:'js'},bundle:true,
    write:false,format:'iife',globalName:'Fixture',define:config.define});
  for(const scene of [null,'member','redeem','session']){
    const page={URL,structuredClone,location:{href:'http://preview.localhost/'+(scene?'?scene='+scene:'')}};
    page.window=page;
    const context=vm.createContext(page);
    vm.runInContext(outputFiles[0].text,context);
    vm.runInContext('Fixture.installPreviewFixture({})',context);
    const sdk=page.__OpenDeskVipPreviewSDK.browser;
    const status=await sdk.proxy.managed.getStatus();
    assert.ok(status.developmentProfile,'member endpoints retain local preview configuration');
    const request=sdk.network.request;
    const readMember=async()=>(await request({method:'GET',url:'https://vip.example.com/api/member'})).data;
    const member=await readMember();
    assert.equal(member.account.state,'bound');
    if(scene==='session'){
      assert.equal(member.sharedAccounts.accounts.length,1);
      assert.equal(member.sharedAccounts.accounts[0].targetUrl,'https://chatgpt.com/');
    }else assert.equal(member.sharedAccounts,undefined,`${scene??'default'} has no website directory`);
    if(scene==='redeem'){
      const preview=await request({method:'POST',url:'https://vip.example.com/api/preview',data:{code:'DEMO-VIP-01'}});
      await request({method:'POST',url:'https://vip.example.com/api/redeem',data:{
        accountId:member.account.id,previewId:preview.data.previewId,idempotencyKey:'preview-isolation'}});
      const redeemed=await readMember();
      assert.ok(redeemed.entitlements.length>0);
      assert.equal(redeemed.sharedAccounts,undefined,'redemption does not reveal a website directory');
    }
  }
});
