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
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fixtureBundle = `globalThis.Scrapy = class Scrapy {
  start() {} stop() {} pause() {} resume() {} release() {}
};
for (const name of ['ChromeSpider', 'Request', 'Response', 'ItemLoader', 'FeedExport', 'ExportManager']) {
  globalThis[name] = class {};
}`;
const senderSource = `function buildRequestMeta(source, requestId) {
  return { protocolVersion: "1.0", source, requestId, timestamp: Date.now() };
}
function sendRuntimeMessageWithProtocol(message) {
  return chrome.runtime.sendMessage(message);
}
sendRuntimeMessageWithProtocol({ meta: buildRequestMeta('fixture', 'request') });
`;

function write(root, name, data) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function stampCandidate(c, tag = 'A', sourceChanged = true) {
  if (sourceChanged) write(c, 'src/index.js', `// fixture input ${tag}\n`);
  const bytes = Buffer.from(`${fixtureBundle}\n// fixture SDK ${tag}\n`);
  const built = { schemaVersion: 1, ...sourceState(c), sdkHash: hash(bytes),
    builtAt: '2026-10-01T00:00:00.000Z', nodeVersion: process.version, npmVersion: '10.0.0' };
  write(c, 'dist/scrapyJs.js', bytes);
  write(c, 'dist/scrapyJs.build.json', encode(built));
  assert.equal(built.sourceHash, sourceState(c).sourceHash, 'Fixture receipt must describe its actual current inputs');
  return built;
}

function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-sync-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const c = path.join(temp, 'core');
  const e = path.join(temp, 'extension');
  // Only existing Git objects are shared. All build inputs and targets are synthetic.
  for (const [original, dest] of [[core, c], [chrome, e]]) {
    execFileSync('git', ['clone', '--shared', '--no-checkout', original, dest], { stdio: 'pipe' });
  }
  const pkg = { name: 'scrapyjs', version: '1.0.0', devDependencies: { webpack: '5.95.0' },
    scripts: { build: `node -e "throw new Error('fixture build failure')"` } };
  write(c, 'package.json', encode(pkg));
  write(c, 'package-lock.json', encode({ packages: { '': pkg, 'node_modules/webpack': { version: '5.95.0' } } }));
  write(c, 'node_modules/webpack/package.json', encode({ version: '5.95.0' }));
  write(c, 'webpack.config.js', 'module.exports = {};\n');
  stampCandidate(c);
  write(e, 'manifest.json', encode({ name: 'scrapyJsChrome', manifest_version: 3, version: '1.0.0',
    background: { service_worker: 'background-sw.js' } }));
  write(e, 'background-sw.js', `const scriptUrls = ["${sdk}"]; importScripts(...scriptUrls);\n`);
  write(e, 'sdk-compatibility.json', encode({ schemaVersion: 1, protocolVersion: '1.0', coreVersions: ['1.0.0'] }));
  for (const name of ['www/popup_crawl.js', 'assets/js/core/tb-bridge.js']) write(e, name, senderSource);
  write(e, sdk, `${fixtureBundle}\n// previous fixture build\n`);
  const options = ['--core', c, '--extension', e];
  return { temp, c, e, options, call: (mode, extra = []) => main([mode, ...options, ...extra]),
    read: name => fs.readFileSync(path.join(e, name)) };
}

test('SDK workflow preserves targets under stale, incompatible, edited and failed inputs', async t => {
  const { temp, c, e, options, call, read } = fixture(t);
  try {
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
    await t.test('tampered receipt cannot report current even when SDK bytes are unchanged', () => {
      const file = path.join(e, receipt);
      const before = fs.readFileSync(file);
      const corrupt = JSON.parse(before);
      corrupt.schemaVersion = 9;
      fs.writeFileSync(file, JSON.stringify(corrupt));
      assert.throws(() => call('check'), /receipt|edited outside/i);
      assert.throws(() => call('apply'), /edited outside/);
      fs.writeFileSync(file, before);
      assert.equal(call('check').status, 'current');
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
      // A real npm subprocess runs the deliberately failing fixture build script.
      fs.writeFileSync(path.join(c, 'webpack.config.js'), "throw new Error('fixture build failure');");
      assert.throws(() => main(['build', '--core', c]));
      assert.deepEqual(fs.readFileSync(path.join(c, 'dist/scrapyJs.js')), dist);
      assert.deepEqual(fs.readFileSync(stamp), buildReceipt);
      assert.deepEqual(read(sdk), original);
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('fresh validation remains bound to the captured candidate identity and SDK hash', async t => {
  for (const scenario of ['check', 'before-lock', 'before-write', 'already-current', 'same-input-new-sdk']) {
    await t.test(scenario, st => {
      const { c, e, call, read } = fixture(st);
      if (scenario === 'already-current') call('apply', ['--expected-target-sha', hash(read(sdk))]);
      const before = read(sdk);
      const beforeReceipt = fs.existsSync(path.join(e, receipt)) ? read(receipt) : null;
      const oldIdentity = JSON.parse(fs.readFileSync(path.join(c, 'dist/scrapyJs.build.json')));
      const readFile = fs.readFileSync;
      const writeFile = fs.writeFileSync;
      let swapped = false;
      const swap = () => {
        if (swapped) return;
        swapped = true;
        stampCandidate(c, 'B', scenario !== 'same-input-new-sdk');
      };
      fs.readFileSync = (file, ...args) => {
        const result = readFile(file, ...args);
        if (String(file) === path.join(e, 'sdk-compatibility.json') && scenario !== 'before-write') swap();
        return result;
      };
      fs.writeFileSync = (file, ...args) => {
        const result = writeFile(file, ...args);
        if (String(file).endsWith('/transaction.json') && scenario === 'before-write') swap();
        return result;
      };
      try {
        const mode = scenario === 'check' ? 'check' : 'apply';
        assert.throws(() => call(mode, ['--expected-target-sha', hash(before)]), /Candidate changed/);
      } finally { fs.readFileSync = readFile; fs.writeFileSync = writeFile; }
      assert.equal(swapped, true, 'The race must actually replace the candidate');
      const fresh = JSON.parse(fs.readFileSync(path.join(c, 'dist/scrapyJs.build.json')));
      assert.equal(fresh.sourceHash, sourceState(c).sourceHash);
      assert.notEqual(fresh.sdkHash, oldIdentity.sdkHash);
      if (scenario === 'same-input-new-sdk') assert.equal(fresh.sourceHash, oldIdentity.sourceHash);
      else assert.notEqual(fresh.sourceHash, oldIdentity.sourceHash);
      assert.deepEqual(read(sdk), before);
      assert.deepEqual(fs.existsSync(path.join(e, receipt)) ? read(receipt) : null, beforeReceipt);
    });
  }
});

test('sender protocol is statically bound to literal/constant metadata at actual sends', async t => {
  const cases = [
    ['comment cannot rescue a mismatched sender', senderSource.replace('"1.0"', '"2.0"') + '// protocolVersion: "1.0"\n', false],
    ['dead literal cannot rescue a mismatched sender', senderSource.replace('"1.0"', '"2.0"') + 'const dead = { protocolVersion: "1.0" };\n', false],
    ['immutable constant is supported', 'const VERSION = "1.0";\n' + senderSource.replace('protocolVersion: "1.0"', 'protocolVersion: VERSION'), true],
    ['a mismatched constant is refused', 'const VERSION = "2.0";\n' + senderSource.replace('protocolVersion: "1.0"', 'protocolVersion: VERSION'), false],
    ['dynamic version is unproven', senderSource.replace('"1.0"', 'readVersion()'), false],
    ['a shadowed constant is refused', 'const VERSION = "1.0";\n' + senderSource.replace('source, requestId) {', 'source, requestId, VERSION = "2.0") {').replace('protocolVersion: "1.0"', 'protocolVersion: VERSION'), false],
    ['a shadowed builder is refused', senderSource.replace("sendRuntimeMessageWithProtocol({ meta:", "function fake(buildRequestMeta) { sendRuntimeMessageWithProtocol({ meta:") + '}\n', false],
    ['builder reassignment is refused', senderSource + 'buildRequestMeta = () => ({ protocolVersion: "2.0" });\n', false],
    ['an unused compliant builder is insufficient', senderSource.replace("meta: buildRequestMeta('fixture', 'request')", 'meta: { protocolVersion: "2.0" }'), false],
    ['duplicate metadata is refused', senderSource.replace('protocolVersion: "1.0",', 'protocolVersion: "1.0", protocolVersion: "2.0",'), false],
    ['spread can overwrite metadata', senderSource.replace('timestamp: Date.now()', 'timestamp: Date.now(), ...unknown'), false],
    ['a different send without metadata is refused', senderSource + 'sendRuntimeMessageWithProtocol({ detail: {} });\n', false],
    ['a wrapper forwarding a different object is refused', senderSource.replace('chrome.runtime.sendMessage(message)', 'chrome.runtime.sendMessage({ meta: { protocolVersion: "2.0" } })'), false],
    ['invalid JavaScript is refused', senderSource + 'function (', false]
  ];
  for (const [name, source, accepted] of cases) {
    await t.test(name, st => {
      const { e, call, read } = fixture(st);
      const before = read(sdk);
      write(e, 'www/popup_crawl.js', source);
      if (accepted) assert.equal(call('check').status, 'update-needed');
      else {
        assert.throws(() => call('check'), /Sender protocol/);
        assert.throws(() => call('apply', ['--expected-target-sha', hash(before)]), /Sender protocol/);
      }
      assert.deepEqual(read(sdk), before);
    });
  }
  await t.test('source side effects are never executed', st => {
    const { temp, e, call } = fixture(st);
    const sentinel = path.join(temp, 'untrusted-source-executed');
    write(e, 'www/popup_crawl.js', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'BAD');\n${senderSource}`);
    assert.equal(call('check').status, 'update-needed');
    assert.equal(fs.existsSync(sentinel), false);
  });
});

test('receipts require complete provenance, valid types and consistent input hashes', async t => {
  const { c, e, call, read } = fixture(t);
  call('apply', ['--expected-target-sha', hash(read(sdk))]);
  const complete = JSON.parse(read(receipt));
  const mutations = [
    ['null receipt', () => null],
    ['false receipt', () => false],
    ['receipt array', () => []],
    ['minimal forged receipt', () => ({ schemaVersion: 1, sdkHash: complete.sdkHash })],
    ...['packageName', 'packageVersion', 'protocolVersion', 'sourceHash', 'sdkHash', 'inputs', 'webpackVersion', 'gitHead', 'gitStatus', 'builtAt', 'nodeVersion', 'npmVersion'].map(key => [
      `missing ${key}`, value => { delete value[key]; return value; }
    ]),
    ['wrong package', value => ({ ...value, packageName: 'other' })],
    ['version type', value => ({ ...value, packageVersion: 1 })],
    ['protocol type', value => ({ ...value, protocolVersion: 1 })],
    ['webpack type', value => ({ ...value, webpackVersion: {} })],
    ['invalid sdk hash', value => ({ ...value, sdkHash: 'garbage' })],
    ['invalid source hash', value => ({ ...value, sourceHash: 'garbage' })],
    ['inputs array', value => ({ ...value, inputs: [] })],
    ['empty inputs with self-consistent hash', value => ({ ...value, inputs: {}, sourceHash: hash(encode({})) })],
    ['unsafe input path', value => { value.inputs['src/../escape'] = hash('x'); value.sourceHash = hash(encode(value.inputs)); return value; }],
    ['invalid input digest', value => { value.inputs['src/index.js'] = 1; value.sourceHash = hash(encode(value.inputs)); return value; }],
    ['inconsistent input fingerprint', value => ({ ...value, sourceHash: '0'.repeat(64) })],
    ['invalid timestamp', value => ({ ...value, builtAt: 'yesterday' })],
    ['git head type', value => ({ ...value, gitHead: 1 })],
    ['git status type', value => ({ ...value, gitStatus: [] })],
    ['node version type', value => ({ ...value, nodeVersion: 26 })],
    ['npm version type', value => ({ ...value, npmVersion: {} })]
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const corrupt = mutate(structuredClone(complete));
      write(e, receipt, encode(corrupt));
      const before = read(sdk);
      assert.throws(() => call('check'), /receipt|edited outside/i);
      assert.throws(() => call('apply', ['--expected-target-sha', hash(before)]), /receipt|edited outside/i);
      assert.deepEqual(read(sdk), before);
      assert.deepEqual(read(receipt), encode(corrupt));
      write(e, receipt, encode(complete));
      const stamp = 'dist/scrapyJs.build.json';
      const beforeBuild = fs.readFileSync(path.join(c, stamp));
      write(c, stamp, encode(corrupt));
      try { assert.throws(() => call('check'), /Stale|receipt/i); }
      finally { write(c, stamp, beforeBuild); }
      assert.equal(call('check').status, 'current');
    });
  }
  await t.test('complete older managed receipt still permits a reviewed update', () => {
    const old = read(receipt);
    stampCandidate(c, 'new');
    assert.equal(call('check').status, 'update-needed');
    assert.equal(call('apply').status, 'updated');
    assert.notDeepEqual(read(receipt), old);
    assert.equal(call('check').status, 'current');
  });
});

test('CLI reports original and recovery errors, retained preimage paths and a failing exit status', t => {
  const { temp, e, options, read } = fixture(t);
  const before = read(sdk);
  const preload = path.join(temp, 'faults.cjs');
  fs.writeFileSync(preload, `const fs = require('node:fs');
const rename = fs.renameSync;
let count = 0;
fs.renameSync = (...args) => {
  if (++count === 2) throw new Error('CLI original update failure');
  if (count === 3) throw new Error('CLI recovery rename failure');
  return rename(...args);
};\n`);
  let failure;
  try {
    execFileSync(process.execPath, ['--require', preload, path.join(core, 'scripts/sdk-sync.cjs'),
      'apply', ...options, '--expected-target-sha', hash(before)], { stdio: 'pipe' });
    assert.fail('CLI must exit nonzero on failed recovery');
  } catch (error) { failure = error; }
  assert.equal(failure.status, 1);
  const report = JSON.parse(failure.stderr.toString());
  assert.equal(report.status, 'failed');
  assert.match(report.error, /CLI original update failure/);
  assert.match(report.error, /CLI recovery rename failure/);
  assert.equal(report.originalError, 'CLI original update failure');
  assert.match(report.recoveryErrors[0].error, /CLI recovery rename failure/);
  const material = report.recoveryFiles.find(item => item.target === path.join(e, sdk));
  assert.ok(material);
  assert.equal(hash(fs.readFileSync(material.path)), hash(before));
  assert.equal(material.beforeHash, hash(before));
  assert.equal(hash(read(sdk)), material.afterHash);
  assert.equal(fs.existsSync(path.join(e, receipt)), false);
  assert.equal(fs.existsSync(path.join(e, '.sdk-sync.lock')), false);
  const backups = fs.readdirSync(path.join(e, '.sdk-backups'));
  assert.equal(backups.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(e, '.sdk-backups', backups[0], 'before-0')), before);
});

test('a concurrent target edit during fresh validation cannot be reported current', t => {
  const { c, e, call, read } = fixture(t);
  call('apply', ['--expected-target-sha', hash(read(sdk))]);
  const readFile = fs.readFileSync;
  let candidates = 0;
  fs.readFileSync = (file, ...args) => {
    const result = readFile(file, ...args);
    if (String(file) === path.join(c, 'dist/scrapyJs.js') && ++candidates === 2) fs.appendFileSync(path.join(e, sdk), '\n// concurrent human edit');
    return result;
  };
  try { assert.throws(() => call('check'), /Target changed/); }
  finally { fs.readFileSync = readFile; }
  assert.equal(candidates, 2);
  assert.match(read(sdk).toString(), /concurrent human edit/);
});

test('compensation preserves concurrent edits and retains recovery materials on restore failure', async t => {
  for (const scenario of ['human-edit', 'human-delete', 'already-restored', 'restore-rename-failure', 'restore-write-failure', 'absent-before']) {
    await t.test(scenario, st => {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-recovery-test-')));
      st.after(() => fs.rmSync(root, { recursive: true, force: true }));
      if (scenario !== 'absent-before') write(root, 'one', 'before-one');
      write(root, 'two', 'before-two');
      write(root, 'unrelated', 'keep');
      const rename = fs.renameSync;
      const writeFile = fs.writeFileSync;
      let count = 0;
      let failed = false;
      fs.renameSync = (...args) => {
        count++;
        if (count === 2) {
          if (scenario === 'human-edit' || scenario === 'absent-before') writeFile(path.join(root, 'one'), 'human');
          if (scenario === 'human-delete') fs.unlinkSync(path.join(root, 'one'));
          if (scenario === 'already-restored') writeFile(path.join(root, 'one'), 'before-one');
          failed = true;
          throw new Error('original update failure');
        }
        if (count === 3 && scenario === 'restore-rename-failure') throw new Error('recovery rename failure');
        return rename(...args);
      };
      fs.writeFileSync = (...args) => {
        if (failed && scenario === 'restore-write-failure') throw new Error('recovery write failure');
        return writeFile(...args);
      };
      let error;
      try {
        assert.throws(() => replaceFiles(root, [['one', Buffer.from('new-one')], ['two', Buffer.from('new-two')]],
          [scenario === 'absent-before' ? null : hash('before-one'), hash('before-two')]), value => { error = value; return true; });
      } finally { fs.renameSync = rename; fs.writeFileSync = writeFile; }
      assert.match(error.message, /original update failure/);
      assert.equal(fs.readFileSync(path.join(root, 'two'), 'utf8'), 'before-two');
      assert.equal(fs.readFileSync(path.join(root, 'unrelated'), 'utf8'), 'keep');
      if (scenario === 'already-restored' || scenario === 'restore-write-failure') {
        // Recovery uses a pre-staged preimage, so it also succeeds if new writes fail.
        assert.equal(fs.readFileSync(path.join(root, 'one'), 'utf8'), 'before-one');
        assert.deepEqual(fs.readdirSync(root).sort(), ['one', 'two', 'unrelated']);
      } else {
        if (scenario === 'human-delete') assert.equal(fs.existsSync(path.join(root, 'one')), false);
        else assert.equal(fs.readFileSync(path.join(root, 'one'), 'utf8'), scenario === 'restore-rename-failure' ? 'new-one' : 'human');
        assert.match(error.message, /Recovery|recovery/);
        assert.match(error.originalError.message, /original update failure/);
        assert.ok(error.recoveryErrors.length > 0);
        assert.ok(error.recoveryFiles.length > 0);
        const material = error.recoveryFiles.find(item => item.target === path.join(root, 'one'));
        assert.ok(material, 'The failed target must have an explicit recovery path');
        assert.ok(fs.existsSync(material.path));
        if (scenario === 'absent-before') assert.equal(JSON.parse(fs.readFileSync(material.path)).beforeHash, null);
        else assert.equal(hash(fs.readFileSync(material.path)), hash('before-one'));
      }
    });
  }
});
