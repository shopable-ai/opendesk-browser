import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {validEndpoint,desiredAiProxy} from '../../src/ai-smart-access/policy.js';
import {AI_PROVIDER,AI_LOCAL_TEST_ENABLED} from '../../src/ai-smart-access/provider-config.js';

test('R5.3 default runtime preserves production endpoint and Provider restrictions',()=>{
  assert.equal(AI_LOCAL_TEST_ENABLED,false);
  assert.deepEqual(AI_PROVIDER,{activateUrl:null,verifyUrl:null});
  for(const endpoint of [
    {scheme:'http',host:'127.0.0.1',port:7897},
    {scheme:'https',host:'127.0.0.1',port:7897},
    {scheme:'http',host:'proxy.example.com',port:443}
  ])assert.throws(()=>validEndpoint(endpoint),{code:'E_AI_ENDPOINT'});
});

test('R5.3 explicit compiled development adapter accepts only the fixed HTTP loopback endpoint',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    globalThis.__OPENDESK_AI_LOCAL_TEST__=true;
    globalThis.__OPENDESK_AI_LOCAL_PACKAGE_HASH__='a'.repeat(64);
    const {validEndpoint,desiredAiProxy}=await import('./src/ai-smart-access/policy.js');
    const {AI_RUNTIME_PROVIDER,AI_LOCAL_PACKAGE_HASH}=await import('./src/ai-smart-access/provider-config.js');
    const endpoint={scheme:'http',host:'127.0.0.1',port:7897};
    assert.deepEqual(validEndpoint(endpoint),endpoint);
    assert.equal(AI_LOCAL_PACKAGE_HASH,'a'.repeat(64));
    assert.equal(AI_RUNTIME_PROVIDER.activateUrl,'http://127.0.0.1:7898/api/activate');
    const pac=desiredAiProxy(endpoint);
    assert(pac.pacScript.mandatory);
    assert(pac.pacScript.data.includes('PROXY 127.0.0.1:7897'));
    assert(!pac.pacScript.data.includes('HTTPS 127.0.0.1'));
    for(const bad of [{...endpoint,host:'localhost'},{...endpoint,host:'127.0.0.2'},
      {...endpoint,port:7899},{...endpoint,scheme:'https'},
      {...endpoint,scheme:'socks5'},{...endpoint,extra:true}])
      assert.throws(()=>validEndpoint(bad),{code:'E_AI_ENDPOINT'});
  `],{cwd:process.cwd(),stdio:'pipe'});
});

test('R5.3 production PAC continues to require an encrypted HTTPS proxy or SOCKS5',()=>{
  const endpoint={scheme:'https',host:'proxy.example.com',port:443};
  assert.match(desiredAiProxy(endpoint).pacScript.data,/HTTPS proxy\.example\.com:443/);
});

test('R5.3 production build cannot opt in even when the development environment flag is set',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    process.env.OPENDESK_BUILD_MODE='production';process.env.OPENDESK_AI_LOCAL_TEST='1';
    const {default:config}=await import('./wxt.config.mjs');
    const values=config.vite().define;
    assert.equal(values.__OPENDESK_AI_LOCAL_TEST__,'false');
    assert.equal(values.__OPENDESK_AI_LOCAL_PACKAGE_HASH__,'null');
  `],{cwd:process.cwd(),stdio:'pipe'});
});
