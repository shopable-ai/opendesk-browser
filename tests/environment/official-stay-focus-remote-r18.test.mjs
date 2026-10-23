import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_STAY_FOCUS_RELEASE_URL,validateOfficialStayFocusRemoteDescriptor}
  from '../../src/sidebar-tools/official-catalog.js';

test('remote release has fixed publisher repository and immutable commit',()=>{
  assert.equal(OFFICIAL_STAY_FOCUS_RELEASE_URL,
    'https://raw.githubusercontent.com/shopable-ai/opendesk-browser/main/official-tools/stay-focus/latest.json');
  const release={id:'opendesk/stay-focus',toolId:'stay-focus',kind:'sidebar-tool',
    installationPolicy:'optional',version:'1.1.0',
    packageTitle:'Stay Focus',description:'Finite site-budget.v3 app',
    capabilities:['browser.siteBudget'],packagePath:'official-tools/stay-focus/stay-focus.opendesk-tool.json',
    bytes:1000,sha256:'a'.repeat(64)};
  const fixture={schema:'opendesk.official-tool.remote-release.v1',
    repository:'shopable-ai/opendesk-browser',commit:'b'.repeat(40),release};
  assert.deepEqual(validateOfficialStayFocusRemoteDescriptor(fixture),
    {...release,remoteCommit:'b'.repeat(40)});
  assert.throws(()=>validateOfficialStayFocusRemoteDescriptor({...fixture,commit:'main'}));
  assert.throws(()=>validateOfficialStayFocusRemoteDescriptor({...fixture,
    repository:'another-publisher/opendesk-browser'}));
  assert.throws(()=>validateOfficialStayFocusRemoteDescriptor({...fixture,
    release:{...release,toolId:'untrusted',id:'opendesk/untrusted',
      packagePath:'official-tools/untrusted/untrusted.opendesk-tool.json'}}));
});
