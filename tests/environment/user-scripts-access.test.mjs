import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from '../../src/ui/user-scripts-access.js';

test('read-only User Scripts probe distinguishes missing, disabled and available native APIs', async () => {
  assert.equal(await inspectUserScriptsAccess({}), false);
  assert.equal(await inspectUserScriptsAccess({userScripts:{getScripts:async()=>[]}}), false);
  let calls = 0, enabled = false;
  const scripts={getScripts:async()=>{calls++;return [];},execute:()=>assert.fail('never execute')};
  const api={get userScripts(){return enabled?scripts:undefined;}};
  assert.equal(await inspectUserScriptsAccess(api),false);
  enabled=true;
  assert.equal(await inspectUserScriptsAccess(api),true);
  scripts.getScripts=async()=>{calls++;return {};};
  await assert.rejects(inspectUserScriptsAccess(api),{code:'E_USER_SCRIPTS_NATIVE'});
  assert.equal(calls,2);
});

test('extension-settings URL accepts only a genuine Chrome extension identifier', () => {
  assert.equal(userScriptsSettingsURL({runtime:{id:'a'.repeat(32)}}), 'chrome://extensions/?id='+'a'.repeat(32));
  for (const id of ['abc', 'x'.repeat(32), '../bad', 'a'.repeat(32)+'&x=1'])
    assert.equal(userScriptsSettingsURL({runtime:{id}}), null);
  assert.equal(userScriptsSettingsURL({}), null);
});

test('Chrome retained namespace after user-scripts revocation remains unavailable', async () => {
  const api={userScripts:{getScripts(){throw Error("'userScripts.getScripts' is not available in this context.");},
    execute:()=>assert.fail('must not execute')}};
  assert.equal(await inspectUserScriptsAccess(api),false);
});

test('unexpected native read failures retain their cause instead of requesting the switch', async () => {
  for (const error of [Object.assign(Error('quota exceeded'), {code:'E_QUOTA'}), Error('Extension context invalidated.')]) {
    const api={userScripts:{getScripts:async()=>{throw error;},execute:()=>assert.fail('must not execute')}};
    await assert.rejects(inspectUserScriptsAccess(api), e=>e.code===(error.code||'E_USER_SCRIPTS_NATIVE') && e.message===error.message);
  }
});
