import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channels } from '../channels/catalog.js';
import { assertOfficialUrl } from '../lib/guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

test('manifest uses only sidePanel and storage permissions and no host permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage']);
  assert.equal('host_permissions' in manifest, false);
  assert.equal('content_scripts' in manifest, false);
});

test('every channel action points to a hard-coded allowlisted official HTTPS URL', () => {
  assert.equal(channels.length, 6);
  for (const channel of channels) {
    assert.ok(channel.actions.length > 0);
    for (const action of channel.actions) {
      assert.equal(assertOfficialUrl(action.url), action.url);
      assert.match(action.buttonLabel, /不会/);
      assert.ok(action.confirmer);
    }
  }
});

test('no action claims to complete a payment or activation', () => {
  const source = fs.readFileSync(path.join(root, 'sidepanel', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /PAID|GIFT_SENT|REDEEMED|ACTIVATED|SUCCESS/);
  assert.match(source, /OFFICIAL_PAGE_OPENED_UNVERIFIED/);
  assert.match(source, /HANDOFF_UNKNOWN/);
});

test('extension runtime contains no direct network, cookie, or content-script integration', () => {
  const source = [
    fs.readFileSync(path.join(root, 'sidepanel', 'app.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'),
    ...fs.readdirSync(path.join(root, 'channels')).map((name) => fs.readFileSync(path.join(root, 'channels', name), 'utf8'))
  ].join('\n');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|chrome\.cookies|chrome\.scripting|chrome\.webRequest/);
});
