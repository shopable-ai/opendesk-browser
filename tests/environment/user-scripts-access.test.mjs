import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from '../../src/ui/user-scripts-access.js';

test('read-only User Scripts probe distinguishes missing, disabled and available native APIs', async () => {
  assert.equal(await inspectUserScriptsAccess({}), false);
  assert.equal(await inspectUserScriptsAccess({userScripts:{getScripts:async()=>[]}}), false);
  let calls = 0;
  const api = {userScripts:{getScripts:async()=>{calls++;throw Error('toggle disabled');},execute:()=>{throw Error('never execute');}}};
  assert.equal(await inspectUserScriptsAccess(api), false);
  api.userScripts.getScripts = async()=>{calls++;return [];};
  assert.equal(await inspectUserScriptsAccess(api), true);
  api.userScripts.getScripts = async()=>{calls++;return {};};
  assert.equal(await inspectUserScriptsAccess(api), false);
  assert.equal(calls, 3);
});

test('extension-settings URL accepts only a genuine Chrome extension identifier', () => {
  assert.equal(userScriptsSettingsURL({runtime:{id:'a'.repeat(32)}}), 'chrome://extensions/?id='+'a'.repeat(32));
  for (const id of ['abc', 'x'.repeat(32), '../bad', 'a'.repeat(32)+'&x=1'])
    assert.equal(userScriptsSettingsURL({runtime:{id}}), null);
  assert.equal(userScriptsSettingsURL({}), null);
});
