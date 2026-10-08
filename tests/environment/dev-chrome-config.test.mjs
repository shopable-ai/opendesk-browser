import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {developmentProfilePath, developmentChromeArgs} from '../../scripts/dev-chrome-config.mjs';

const home = path.resolve('/tmp','a-user');
const workspace = path.resolve('/tmp','worktrees','opendesk-browser');

test('daily development profile is deterministic per worktree, not fresh every invocation', () => {
  const a = developmentProfilePath({home, workspace});
  const b = developmentProfilePath({home, workspace});
  const anotherWorktree = developmentProfilePath({home, workspace: workspace + '-other'});
  const anotherName = developmentProfilePath({home, workspace, name:'sdk'});
  assert.equal(a,b);
  assert.notEqual(a,anotherWorktree);
  assert.notEqual(a,anotherName);
  assert.ok(a.startsWith(path.join(home,'.opendesk-browser','dev-profiles') + path.sep));
  assert.equal(a.startsWith(workspace),false);
});

test('profile path rejects relative, unsafe or ambiguous names', () => {
  for (const name of ['', '../Chrome', 'foo/bar', 'foo bar', 'CAPS', 'a'.repeat(33)])
    assert.throws(() => developmentProfilePath({home,workspace,name}),TypeError);
  assert.throws(() => developmentProfilePath({home:'relative',workspace}),TypeError);
  assert.throws(() => developmentProfilePath({home,workspace:'relative'}),TypeError);
});

test('interactive CFT flags preserve a single stable profile and extension location without bypasses', () => {
  const profile = developmentProfilePath({home,workspace});
  const extension = path.join(workspace,'dist','development');
  const argv = developmentChromeArgs({profile,extension});
  assert.deepEqual(argv.filter(a=>a.startsWith('--user-data-dir=')),['--user-data-dir='+profile]);
  assert.ok(argv.includes('--load-extension='+extension));
  assert.ok(argv.includes('--disable-extensions-except='+extension));
  assert.ok(argv.includes('--use-mock-keychain'));
  assert.ok(argv.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(argv.includes('about:blank'));
  assert.equal(argv.some(a=>/grant-permissions|auto-confirm|disable-web-security|no-sandbox|headless/.test(a)),false);
  assert.throws(()=>developmentChromeArgs({profile:'/',extension}),TypeError);
  assert.throws(()=>developmentChromeArgs({profile:'relative',extension}),TypeError);
});

test('the formal native launcher remains isolated and unmodified', async () => {
  const {readFile} = await import('node:fs/promises');
  const source = await readFile('tests/framework/k5-sdk-native-launcher.mjs','utf8');
  assert.match(source,/The wrapper owns every Chrome process and its fresh profile/);
  assert.match(source,/startsWith\('codex-cft-'\)/);
  assert.doesNotMatch(source,/developmentProfilePath|dev-chrome-config/);
});
