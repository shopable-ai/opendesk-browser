import test from 'node:test';
import assert from 'node:assert/strict';
import {localProjectAllowsOrigin,validControllerProjectOrigins} from '../../src/platform/local-project-site-scope.js';

test('local Controller all-sites scope accepts only canonical HTTP(S) origins',()=>{
  const source={runtimeKind:'controller',siteOrigins:['<all_urls>']};
  for(const origin of ['https://a.example','http://b.example:8080','http://127.0.0.1:43111'])
    assert.equal(localProjectAllowsOrigin(source,origin),true,origin);
  for(const origin of ['file://','chrome://settings','chrome-extension://extension','about:blank','null',
    'https://a.example/','https://a.example/path','https://user:pass@a.example','https://a.example:443'])
    assert.equal(localProjectAllowsOrigin(source,origin),false,origin);
});

test('local exact scope remains fail closed and Page empty scope keeps existing rules checks',()=>{
  const source={runtimeKind:'controller',siteOrigins:['https://a.example']};
  assert.equal(localProjectAllowsOrigin(source,'https://a.example'),true);
  assert.equal(localProjectAllowsOrigin(source,'https://b.example'),false);
  assert.equal(localProjectAllowsOrigin({...source,siteOrigins:[]},'https://a.example'),false);
  assert.equal(localProjectAllowsOrigin({runtimeKind:'page-userscript',siteOrigins:[]},'https://b.example'),true);
  assert.equal(localProjectAllowsOrigin({runtimeKind:'page-userscript',siteOrigins:['https://a.example']},'https://b.example'),false);
  assert.equal(localProjectAllowsOrigin({...source,siteOrigins:['*']},'https://a.example'),false);
});

test('Controller project scope accepts one exact origin or explicit all-sites declaration',()=>{
  for(const origins of [['<all_urls>'],['https://a.example'],['http://127.0.0.1:43111']])
    assert.equal(validControllerProjectOrigins(origins),true);
  for(const origins of [undefined,[],['*'],['https://*.example/*'],['https://a.example/'],
    ['https://user:pass@a.example'],['https://*.example'],['http://*'],['file://'],['<all_urls>','https://a.example']])
    assert.equal(validControllerProjectOrigins(origins),false);
});


test('Controller exact list is bounded, unique and grants only listed canonical origins',()=>{
  const origins=Array.from({length:8},(_,i)=>`https://site${i}.example`);
  assert.equal(validControllerProjectOrigins(origins),true);
  for(const origin of origins)assert.equal(localProjectAllowsOrigin({runtimeKind:'controller',siteOrigins:origins},origin),true);
  assert.equal(localProjectAllowsOrigin({runtimeKind:'controller',siteOrigins:origins},'https://outside.example'),false);
  for(const invalid of [Array(1),[...origins,'https://ninth.example'],[origins[0],origins[0]],
    [''],['https://user@site.example'],['https://site.example/path'],['null'],['about:blank'],
    ['https://site.example?x'],['https://site.example#x'],['<all_urls>',...origins]])
    assert.equal(validControllerProjectOrigins(invalid),false,JSON.stringify(invalid));
});
