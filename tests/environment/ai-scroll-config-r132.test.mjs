import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScrollConfig,scrollConfigForUrl,scrollPathMatches,
  SCROLL_CONFIG_EMPTY,SCROLL_CONFIG_PROGRAM_ID} from '../../src/scripting/user-scripts/scroll-config-contract.js';
import {applicableRule} from '../../examples/programs/chatgpt-jump-top/src/site-configuration.js';
import {pageInstallScope,pageInstallScopeDelta} from '../../src/scripting/user-scripts/page-install-authorization.js';

const sample={origin:'https://chatgpt.com',pathScope:'/c',
  mainSelector:'main',scrollSelector:'#thread',messageSelector:'article',
  anchorSelector:'',enabled:true};
const scope={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
const check=fn=>assert.throws(fn,err=>err?.code==='E_CONFIG_SCHEMA');

test('R132 site configuration normalizes typed inert selectors and exact HTTP(S) origins',()=>{
  assert.deepEqual(normalizeScrollConfig({version:1,sites:[sample]}),{version:1,sites:[sample]});
  check(()=>normalizeScrollConfig({version:2,sites:[]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,origin:'https://evil.test/a'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,origin:'javascript:alert(1)'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,pathScope:'//admin'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,pathScope:'/x/../admin'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,mainSelector:'div{color:red}'}]}));
  check(()=>normalizeScrollConfig({version:1,sites:[sample,sample]}));
  check(()=>normalizeScrollConfig({version:1,sites:[{...sample,untrustedScript:'alert(1)'}]}));
  assert.deepEqual(SCROLL_CONFIG_EMPTY,{version:1,sites:[]});
});
test('R132 path scopes stop at segment boundaries and support longest explicit rule',()=>{
  assert.equal(scrollPathMatches('/c','/c'),true);
  assert.equal(scrollPathMatches('/c','/c/123'),true);
  assert.equal(scrollPathMatches('/c','/crossover'),false);
  assert.equal(scrollPathMatches('/','/anything'),true);
  const second={...sample,pathScope:'/c/123',mainSelector:'#specific'};
  const config={version:1,sites:[sample,second]};
  assert.equal(scrollConfigForUrl(config,'https://chatgpt.com/c/123').mainSelector,'#specific');
  assert.equal(applicableRule(config,'https://chatgpt.com/c/123').mainSelector,'#specific');
  assert.equal(scrollConfigForUrl(config,'https://evil.test/c/123'),null);
  assert.equal(scrollConfigForUrl(config,'https://chatgpt.com/crossover'),null);
  assert.equal(applicableRule(config,'https://chatgpt.com/crossover'),null);
});
test('R132 config capability is only for scoped Program revision, and upgrade needs approval',()=>{
  assert.equal(SCROLL_CONFIG_PROGRAM_ID,'opendesk.ai-scroll-navigation');
  const oldScope=pageInstallScope(scope,SCROLL_CONFIG_PROGRAM_ID,2);
  const newScope=pageInstallScope(scope,SCROLL_CONFIG_PROGRAM_ID,3);
  assert.deepEqual(oldScope.capabilities,['page.dom']);
  assert.deepEqual(newScope.capabilities,['page.dom','page.config']);
  assert.equal(pageInstallScope(scope,'other-program',99).capabilities.includes('page.config'),false);
  assert.equal(pageInstallScopeDelta(oldScope,newScope).requiresConfirmation,true);
  assert.deepEqual(pageInstallScopeDelta(oldScope,newScope).addedCapabilities,['page.config']);
  assert.equal(pageInstallScopeDelta(newScope,newScope).requiresConfirmation,false);
});
