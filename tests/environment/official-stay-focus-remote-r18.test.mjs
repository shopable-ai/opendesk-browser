import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {OFFICIAL_STAY_FOCUS_RELEASE_URL,validateOfficialStayFocusRemoteDescriptor,
  officialStayFocusSignedPayload,verifyOfficialStayFocusRemoteDescriptor,
  OFFICIAL_STAY_FOCUS_RELEASE_KEY_ID}
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

test('official independent Focus release requires a pinned Ed25519 trust anchor',async()=>{
  const release={id:'opendesk/stay-focus',toolId:'stay-focus',kind:'sidebar-tool',
    installationPolicy:'optional',version:'1.1.0',
    packageTitle:'Stay Focus',description:'Finite site-budget.v3 app',
    capabilities:['browser.siteBudget'],
    packagePath:'official-tools/stay-focus/stay-focus.opendesk-tool.json',
    bytes:1000,sha256:'a'.repeat(64)};
  const unsigned={schema:'opendesk.official-tool.remote-release.v1',
    repository:'shopable-ai/opendesk-browser',commit:'b'.repeat(40),release};
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const signature=sign(null,Buffer.from(officialStayFocusSignedPayload(unsigned)),privateKey)
    .toString('base64');
  const signed={...unsigned,signature:{algorithm:'Ed25519',
    keyId:OFFICIAL_STAY_FOCUS_RELEASE_KEY_ID,value:signature}};
  await assert.rejects(verifyOfficialStayFocusRemoteDescriptor(signed),
    {code:'E_RELEASE_TRUST_UNCONFIGURED'},'unprovisioned Browser must never trust a remote hash');
  assert.deepEqual(await verifyOfficialStayFocusRemoteDescriptor(signed,{publicKeyBase64:key}),
    {...release,remoteCommit:'b'.repeat(40)});
  await assert.rejects(verifyOfficialStayFocusRemoteDescriptor({...signed,
    release:{...release,version:'1.1.1'}},{publicKeyBase64:key}),
    {code:'E_RELEASE_SIGNATURE'},'version change requires a new publisher signature');
  await assert.rejects(verifyOfficialStayFocusRemoteDescriptor({...signed,
    release:{...release,sha256:'c'.repeat(64)}},{publicKeyBase64:key}),
    {code:'E_RELEASE_SIGNATURE'},'different executable bytes require new signature');
  await assert.rejects(verifyOfficialStayFocusRemoteDescriptor({...unsigned},
    {publicKeyBase64:key}),{code:'E_RELEASE_SIGNATURE'});
});
