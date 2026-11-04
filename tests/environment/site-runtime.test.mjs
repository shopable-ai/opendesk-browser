import test from 'node:test';
import assert from 'node:assert/strict';
import {startSiteRuntime} from '../../src/page-events/content-runtime.js';

const profile=(id,origin,adapter='generic')=>({id,version:'1.0.0',origin,adapter,
  adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true});
const profiles=[profile('chatgpt','https://chatgpt.com','chatgpt'),profile('example','https://example.test')];
function start(url,{top=true,versions={generic:'1.0.0',chatgpt:'1.0.0'}}={}){
  const started=[];
  const adapters=Object.fromEntries(Object.entries(versions).map(([id,version])=>[id,{version,
    start:context=>{started.push({id,profile:context.profile.id});return id;}}]));
  const win={location:{href:url}};win.top=top?win:{};
  const result=startSiteRuntime({win,profiles,adapters,protocolIds:['webflow.task.intent.v1']});
  return {result,started};
}

test('starts only the adapter selected by the exact top-level site profile',()=>{
  assert.deepEqual(start('https://chatgpt.com/c/a').started,[{id:'chatgpt',profile:'chatgpt'}]);
  assert.deepEqual(start('https://example.test/path').started,[{id:'generic',profile:'example'}]);
  assert.deepEqual(start('https://chatgpt.com.evil.test/').started,[]);
  assert.deepEqual(start('https://chatgpt.com/',{top:false}).started,[]);
});

test('fails closed on an adapter version mismatch',()=>{
  assert.throws(()=>start('https://example.test/',{versions:{generic:'2.0.0',chatgpt:'1.0.0'}}),
    {code:'E_SITE_ADAPTER_VERSION'});
});
