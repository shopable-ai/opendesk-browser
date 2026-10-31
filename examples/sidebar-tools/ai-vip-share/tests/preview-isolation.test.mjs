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
  const member=await request({method:'GET',url:'http://127.0.0.1:7898/api/member'});
  assert.equal(member.data.account.state,'bound');
  await assert.rejects(request({method:'GET',url:'https://example.com/api/member'}),/NO_EXTERNAL_NETWORK/);
});
