'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { main, sourceState, replaceFiles } = require('../scripts/sdk-sync.cjs');
const core = path.resolve(__dirname, '..');
const chrome = path.resolve(core, '../scrapyJsChrome');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sdk = 'assets/js/plugins/scrapyJs.js';
const receipt = 'assets/js/plugins/scrapyJs.source.json';

test('SDK workflow preserves targets under stale, incompatible, edited and failed inputs', async t => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-sync-test-')));
  const c = path.join(temp, 'core');
  const e = path.join(temp, 'extension');
  try {
    // Local shared clones only provide existing HEAD; there are no new commits.
    for (const [original, dest] of [[core, c], [chrome, e]]) {
      execFileSync('git', ['clone', '--shared', '--no-checkout', original, dest], { stdio: 'pipe' });
    }
    for (const name of ['src', 'package.json', 'package-lock.json', 'webpack.config.js', 'dist/scrapyJs.js', 'dist/scrapyJs.build.json', 'node_modules/webpack/package.json']) {
      fs.mkdirSync(path.dirname(path.join(c, name)), { recursive: true });
      fs.cpSync(path.join(core, name), path.join(c, name), { recursive: true });
    }
    for (const name of ['manifest.json', 'background-sw.js', 'sdk-compatibility.json', 'www/popup_crawl.js', 'assets/js/core/tb-bridge.js', sdk]) {
      fs.mkdirSync(path.dirname(path.join(e, name)), { recursive: true });
      fs.copyFileSync(path.join(chrome, name), path.join(e, name));
    }
    const options = ['--core', c, '--extension', e];
    const call = (mode, extra = []) => main([mode, ...options, ...extra]);
    const read = name => fs.readFileSync(path.join(e, name));
    const original = read(sdk);
    const expected = hash(original);
    const stamp = path.join(c, 'dist/scrapyJs.build.json');
    const provenReceipt = fs.readFileSync(stamp);

    await t.test('default check is read-only and unmanaged apply needs exact reviewed hash', () => {
      assert.equal(main(options.slice()).status, 'update-needed');
      assert.deepEqual(read(sdk), original);
      assert.throws(() => call('apply'), /Unmanaged SDK/);
      assert.throws(() => call('apply', ['--expected-target-sha', '0'.repeat(64)]), /Unmanaged SDK/);
      assert.deepEqual(read(sdk), original);
    });
    await t.test('source edits including untracked source invalidate receipt, not just HEAD', () => {
      const file = path.join(c, 'src/untracked-test.txt');
      fs.writeFileSync(file, 'dirty input');
      assert.throws(() => call('check'), /Stale/);
      assert.throws(() => call('apply', ['--expected-target-sha', expected]), /Stale/);
      assert.deepEqual(read(sdk), original);
      fs.unlinkSync(file);
    });
    await t.test('modified bundle and false package version are refused', () => {
      const file = path.join(c, 'dist/scrapyJs.js');
      const before = fs.readFileSync(file);
      fs.appendFileSync(file, '\n// tampered');
      assert.throws(() => call('apply', ['--expected-target-sha', expected]), /Stale/);
      fs.writeFileSync(file, before);
      const altered = JSON.parse(provenReceipt);
      altered.packageVersion = '9.9.9';
      fs.writeFileSync(stamp, JSON.stringify(altered));
      assert.throws(() => call('check'), /Stale/);
      fs.writeFileSync(stamp, provenReceipt);
      assert.deepEqual(read(sdk), original);
    });
    await t.test('compatibility version and sender protocol are gates', () => {
      const file = path.join(e, 'sdk-compatibility.json');
      const before = fs.readFileSync(file);
      fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, protocolVersion: '2.0', coreVersions: ['1.0.0'] }));
      assert.throws(() => call('apply', ['--expected-target-sha', expected]), /incompatible/);
      fs.writeFileSync(file, before);
      const sender = path.join(e, 'www/popup_crawl.js');
      const text = fs.readFileSync(sender, 'utf8');
      fs.writeFileSync(sender, text.replace('protocolVersion: "1.0"', 'protocolVersion: "2.0"'));
      assert.throws(() => call('check'), /Sender protocol/);
      fs.writeFileSync(sender, text);
      assert.deepEqual(read(sdk), original);
    });
    await t.test('wrong root, subdirectory, unknown target and symlinks are refused', () => {
      assert.throws(() => main(['check', '--core', c, '--extension', c]), /Missing path|Wrong extension/);
      assert.throws(() => main(['check', '--core', path.join(c, 'src'), '--extension', e]), /repository root/);
      assert.throws(() => main(['check', ...options, '--target', '/tmp/danger']), /Invalid option/);
      const file = path.join(e, sdk);
      fs.renameSync(file, `${file}.original`);
      fs.symlinkSync(`${file}.original`, file);
      assert.throws(() => call('apply', ['--expected-target-sha', expected]), /Symlink/);
      fs.unlinkSync(file);
      fs.renameSync(`${file}.original`, file);
      assert.deepEqual(read(sdk), original);
    });
    let update;
    await t.test('apply installs validated bytes and check/repeat apply are idempotent', () => {
      update = call('apply', ['--expected-target-sha', expected]);
      assert.equal(update.status, 'updated');
      assert.deepEqual(read(sdk), fs.readFileSync(path.join(c, 'dist/scrapyJs.js')));
      assert.equal(JSON.parse(read(receipt)).sourceHash, sourceState(c).sourceHash);
      assert.equal(call('check').status, 'current');
      const before = read(receipt);
      assert.equal(call('apply').status, 'current');
      assert.deepEqual(read(receipt), before);
      assert.equal(fs.readdirSync(path.join(e, '.sdk-backups')).length, 1);
    });
    await t.test('managed manual edits prevent update AND rollback', () => {
      const before = read(sdk);
      fs.appendFileSync(path.join(e, sdk), '\n// human edit');
      assert.throws(() => call('apply'), /edited outside/);
      assert.throws(() => call('rollback', ['--backup', update.backup]), /Target changed/);
      assert.match(read(sdk).toString(), /human edit/);
      fs.writeFileSync(path.join(e, sdk), before);
    });
    await t.test('backup corruption is refused and exact rollback restores unmanaged baseline', () => {
      const backup = path.join(e, update.backup, 'before-0');
      const before = fs.readFileSync(backup);
      fs.appendFileSync(backup, 'bad');
      assert.throws(() => call('rollback', ['--backup', update.backup]), /Corrupt backup/);
      fs.writeFileSync(backup, before);
      assert.throws(() => call('rollback', ['--backup', '../outside']), /exact .sdk-backups/);
      assert.equal(call('rollback', ['--backup', update.backup]).status, 'rolled-back');
      assert.deepEqual(read(sdk), original);
      assert.equal(fs.existsSync(path.join(e, receipt)), false);
    });
    await t.test('caught second rename failure restores first file; unrelated file unchanged', () => {
      const sandbox = path.join(temp, 'transaction');
      fs.mkdirSync(sandbox);
      fs.writeFileSync(path.join(sandbox, 'one'), 'before-one');
      fs.writeFileSync(path.join(sandbox, 'two'), 'before-two');
      fs.writeFileSync(path.join(sandbox, 'unrelated'), 'keep');
      const rename = fs.renameSync;
      let count = 0;
      fs.renameSync = (...args) => { if (++count === 2) throw new Error('injected rename failure'); return rename(...args); };
      try {
        assert.throws(() => replaceFiles(sandbox, [['one', Buffer.from('new')], ['two', Buffer.from('new')]],
          [hash('before-one'), hash('before-two')]), /injected rename failure/);
      } finally { fs.renameSync = rename; }
      assert.equal(fs.readFileSync(path.join(sandbox, 'one'), 'utf8'), 'before-one');
      assert.equal(fs.readFileSync(path.join(sandbox, 'two'), 'utf8'), 'before-two');
      assert.equal(fs.readFileSync(path.join(sandbox, 'unrelated'), 'utf8'), 'keep');
    });
    await t.test('actual failing npm build preserves previous dist and extension', () => {
      const dist = fs.readFileSync(path.join(c, 'dist/scrapyJs.js'));
      const buildReceipt = fs.readFileSync(stamp);
      // No webpack executable in this temporary fixture: real npm must fail.
      fs.writeFileSync(path.join(c, 'webpack.config.js'), "throw new Error('fixture build failure');");
      assert.throws(() => main(['build', '--core', c]));
      assert.deepEqual(fs.readFileSync(path.join(c, 'dist/scrapyJs.js')), dist);
      assert.deepEqual(fs.readFileSync(stamp), buildReceipt);
      assert.deepEqual(read(sdk), original);
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
