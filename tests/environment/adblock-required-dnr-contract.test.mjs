import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REQUIRED_BROWSER_API_PERMISSIONS,OPTIONAL_PLUGIN_API_PERMISSIONS} from '../../src/platform/chrome/permission-gate.js';
import {verifyManifest} from '../../scripts/verify-package.mjs';

const manifest=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url),'utf8'));
test('filtering API is required at extension load without expanding site scope',()=>{
  const permission='declarativeNetRequestWithHostAccess';
  assert.equal(manifest.permissions.filter(value=>value===permission).length,1);
  assert.equal(manifest.optional_permissions.includes(permission),false);
  assert.deepEqual(manifest.host_permissions,['<all_urls>']);
  for(const other of ['declarativeNetRequest','declarativeNetRequestFeedback']){
    assert.equal(manifest.permissions.includes(other),false);
    assert.equal(manifest.optional_permissions.includes(other),false);
  }
  assert.equal(manifest.declarative_net_request,undefined);
  assert.deepEqual(manifest.permissions,REQUIRED_BROWSER_API_PERMISSIONS);
  assert.deepEqual(manifest.optional_permissions,OPTIONAL_PLUGIN_API_PERMISSIONS);
  verifyManifest(manifest,{source:true});
});
