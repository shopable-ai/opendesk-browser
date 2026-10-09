import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyManifest} from '../../scripts/verify-package.mjs';
import {REQUIRED_BROWSER_API_PERMISSIONS, OPTIONAL_PLUGIN_API_PERMISSIONS, REQUIRED_HOST_PATTERNS,
  optionalPluginPermissionRequest, hasOptionalPluginPermissions, requestOptionalPluginPermissions,
  requireOptionalPluginPermissions} from '../../src/platform/chrome/permission-gate.js';

test('manifest and build verifier accept broad required sites and a finite API permission catalog', async () => {
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert.deepEqual(REQUIRED_HOST_PATTERNS,['<all_urls>']);
  assert.deepEqual(manifest.host_permissions,REQUIRED_HOST_PATTERNS);
  assert.deepEqual(manifest.permissions,REQUIRED_BROWSER_API_PERMISSIONS);
  assert.deepEqual(manifest.optional_permissions,OPTIONAL_PLUGIN_API_PERMISSIONS);
  assert.equal(manifest.optional_host_permissions,undefined);
  assert.equal(verifyManifest(manifest),undefined);
  assert(!manifest.permissions.includes('nativeMessaging'),'Native must remain a user-authorized optional permission');
  assert(manifest.optional_permissions.includes('nativeMessaging'));
  assert(manifest.permissions.every(name=>!manifest.optional_permissions.includes(name)));
  const escalated=structuredClone(manifest);
  escalated.permissions.push('nativeMessaging');
  assert.throws(()=>verifyManifest(escalated),/required browser API/);
  assert.deepEqual(REQUIRED_BROWSER_API_PERMISSIONS.slice(-2),['cookies','notifications']);
  for (const prohibited of ['debugger','proxy','management'])
    assert(!manifest.permissions.includes(prohibited),prohibited+' must not be permanently granted');
  const invalid=structuredClone(manifest);
  invalid.host_permissions=['https://*/*'];
  assert.throws(()=>verifyManifest(invalid),/default all-site/);
  const duplicated=structuredClone(manifest);
  duplicated.optional_permissions.push('cookies');
  assert.throws(()=>verifyManifest(duplicated),/optional plugin/);
});

test('declared optional plugin permission requests reject unknown, required and duplicate names', () => {
  assert.deepEqual(optionalPluginPermissionRequest(['bookmarks','history']),
    {permissions:['bookmarks','history']});
  for (const permissions of [[],['debugger'],['cookies'],['bookmarks','bookmarks'],['proxy'],['unknown']])
    assert.throws(()=>optionalPluginPermissionRequest(permissions),{code:'E_SCHEMA'});
});

test('API grant starts synchronously inside trusted UI click and verifies the native state',async()=>{
  const native=new Set(),calls=[];
  const api={permissions:{
    request(request){calls.push(request);request.permissions.forEach(p=>native.add(p));return Promise.resolve(true);},
    contains:async request=>request.permissions.every(p=>native.has(p))
  }};
  const result=requestOptionalPluginPermissions({api,event:{isTrusted:true},permissions:['bookmarks','contextMenus']});
  assert.deepEqual(calls,[{permissions:['bookmarks','contextMenus']}]);
  assert.deepEqual(await result,{permissions:['bookmarks','contextMenus']});
  assert.equal(await hasOptionalPluginPermissions({api,permissions:['bookmarks']}),true);
  assert.equal(await requireOptionalPluginPermissions({api,permissions:['bookmarks']}),true);
  native.delete('bookmarks');
  assert.equal(await hasOptionalPluginPermissions({api,permissions:['bookmarks']}),false);
  await assert.rejects(requireOptionalPluginPermissions({api,permissions:['bookmarks']}),{code:'E_PERMISSION'});
});

test('a plugin cannot silently escalate permissions on deny or an untrusted event',async()=>{
  const calls=[];
  const api={permissions:{
    request(request){calls.push(request);return Promise.resolve(false);},
    contains:async()=>false
  }};
  await assert.rejects(requestOptionalPluginPermissions({api,event:{isTrusted:false},permissions:['history']}),{code:'E_GESTURE'});
  assert.equal(calls.length,0);
  await assert.rejects(requestOptionalPluginPermissions({api,event:{isTrusted:true},permissions:['history']}),{code:'E_PERMISSION'});
  assert.deepEqual(calls,[{permissions:['history']}]);
});
