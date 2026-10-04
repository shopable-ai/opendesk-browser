#!/usr/bin/env node
'use strict';

// Core owns SDK generation. No arbitrary source file or target file option.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const SDK = 'assets/js/plugins/scrapyJs.js';
const RECEIPT = 'assets/js/plugins/scrapyJs.source.json';
const PROTOCOL = '1.0';
const BUILD_FILES = ['scrapyJs.js', 'scrapyJs.build.json'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function fail(message) { throw new Error(message); }

function safePath(root, relative, allowMissing = false) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) fail('Unsafe relative path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) fail('Path escapes repository');
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) {
      // existsSync follows links, including broken links; lstat must reject those too.
      try { if (fs.lstatSync(cursor).isSymbolicLink()) fail(`Symlink refused: ${cursor}`); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (!allowMissing) fail(`Missing path: ${cursor}`);
    } else if (fs.lstatSync(cursor).isSymbolicLink()) fail(`Symlink refused: ${cursor}`);
  }
  return target;
}

function repository(root, kind) {
  const resolved = path.resolve(root);
  if (fs.realpathSync(resolved) !== resolved) fail('Repository path may not contain symlinks');
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: resolved, encoding: 'utf8' }).trim();
  if (gitRoot !== resolved) fail('Pass the repository root, not a subdirectory');
  if (kind === 'core') {
    if (json(safePath(resolved, 'package.json')).name !== 'scrapyjs') fail('Wrong core repository');
    safePath(resolved, 'src/index.js');
    safePath(resolved, 'webpack.config.js');
  } else {
    const manifest = json(safePath(resolved, 'manifest.json'));
    if (manifest.name !== 'scrapyJsChrome' || manifest.manifest_version !== 3 || manifest.background?.service_worker !== 'background-sw.js') fail('Wrong extension or unsupported worker');
    const worker = fs.readFileSync(safePath(resolved, 'background-sw.js'), 'utf8');
    if (!worker.includes(`"${SDK}"`) || !worker.includes('importScripts(...scriptUrls)')) fail('SDK is not in the actual worker loader');
    safePath(resolved, SDK);
    safePath(resolved, RECEIPT, true);
  }
  return resolved;
}

function sourceState(core) {
  const inputs = {};
  function walk(relative) {
    const filename = safePath(core, relative);
    if (fs.statSync(filename).isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) walk(`${relative}/${name}`);
    } else inputs[relative] = hash(fs.readFileSync(filename));
  }
  walk('src');
  for (const name of ['package.json', 'package-lock.json', 'webpack.config.js']) walk(name);
  const pkg = json(path.join(core, 'package.json'));
  const lock = json(path.join(core, 'package-lock.json'));
  const root = lock.packages?.[''];
  if (!root || root.version !== pkg.version || root.name !== pkg.name ||
      JSON.stringify(root.dependencies) !== JSON.stringify(pkg.dependencies) ||
      JSON.stringify(root.devDependencies) !== JSON.stringify(pkg.devDependencies)) fail('Package and lockfile disagree');
  const webpack = json(safePath(core, 'node_modules/webpack/package.json')).version;
  if (webpack !== lock.packages?.['node_modules/webpack']?.version) fail('Installed webpack differs from lockfile');
  return {
    packageName: pkg.name, packageVersion: pkg.version, protocolVersion: PROTOCOL,
    sourceHash: hash(encode(inputs)), inputs,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: core, encoding: 'utf8' }).trim(),
    // HEAD is context only; byte hashes above identify dirty and untracked build inputs.
    gitStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: core, encoding: 'utf8' }).trim(),
    webpackVersion: webpack
  };
}

function validateBundle(bytes) {
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, Blob, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, AbortController });
  vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis;', context);
  vm.runInContext(bytes.toString('utf8'), context, { timeout: 10000, filename: 'scrapyJs.js' });
  for (const name of ['Scrapy', 'ChromeSpider', 'Request', 'Response', 'ItemLoader', 'FeedExport', 'ExportManager']) {
    if (typeof context[name] !== 'function') fail(`SDK global missing: ${name}`);
  }
  for (const name of ['start', 'stop', 'pause', 'resume', 'release']) {
    if (typeof context.Scrapy.prototype[name] !== 'function') fail(`SDK method missing: ${name}`);
  }
}

function candidate(core) {
  const bytes = fs.readFileSync(safePath(core, 'dist/scrapyJs.js'));
  const receipt = json(safePath(core, 'dist/scrapyJs.build.json'));
  const state = sourceState(core);
  if (receipt.schemaVersion !== 1 || receipt.packageName !== state.packageName || receipt.packageVersion !== state.packageVersion ||
      receipt.protocolVersion !== PROTOCOL || receipt.sourceHash !== state.sourceHash || receipt.webpackVersion !== state.webpackVersion ||
      hash(encode(receipt.inputs)) !== state.sourceHash || receipt.sdkHash !== hash(bytes)) fail('Stale, modified or unproven SDK; run sdk-sync build');
  validateBundle(bytes);
  return { bytes, receipt };
}

function compatibility(extension, receipt) {
  const compat = json(safePath(extension, 'sdk-compatibility.json'));
  if (compat.schemaVersion !== 1 || compat.protocolVersion !== receipt.protocolVersion ||
      !Array.isArray(compat.coreVersions) || !compat.coreVersions.includes(receipt.packageVersion)) fail('Unreviewed package version or incompatible bridge protocol');
  for (const relative of ['www/popup_crawl.js', 'assets/js/core/tb-bridge.js']) {
    const source = fs.readFileSync(safePath(extension, relative), 'utf8');
    if (!new RegExp(`protocolVersion:\\s*["']${PROTOCOL.replace('.', '\\.')}["']`).test(source)) fail(`Sender protocol mismatch: ${relative}`);
  }
}

function readOptional(root, relative) {
  const file = safePath(root, relative, true);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
function byteHash(bytes) { return bytes === null ? null : hash(bytes); }

// Each rename is atomic on this filesystem; the pair is not crash-atomic.
// Recover caught errors and keep a persistent preimage for explicit rollback.
function replaceFiles(root, changes, expected) {
  const token = crypto.randomUUID();
  const before = changes.map(([relative]) => readOptional(root, relative));
  const temps = [];
  let updated = 0;
  try {
    for (let i = 0; i < changes.length; i++) {
      const [relative, bytes] = changes[i];
      if (byteHash(before[i]) !== expected[i]) fail('Target changed before update');
      const dest = safePath(root, relative, true);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const temp = `${dest}.${token}.tmp`;
      if (bytes !== null) fs.writeFileSync(temp, bytes, { flag: 'wx' });
      temps.push(temp);
    }
    for (let i = 0; i < changes.length; i++) {
      const [relative, bytes] = changes[i];
      const dest = safePath(root, relative, true);
      if (byteHash(readOptional(root, relative)) !== expected[i]) fail('Target changed during update');
      if (bytes === null) fs.rmSync(dest, { force: true });
      else fs.renameSync(temps[i], dest);
      updated++;
    }
  } catch (error) {
    for (let i = updated - 1; i >= 0; i--) {
      const dest = safePath(root, changes[i][0], true);
      if (before[i] === null) fs.rmSync(dest, { force: true });
      else { fs.writeFileSync(temps[i], before[i]); fs.renameSync(temps[i], dest); }
    }
    throw error;
  } finally {
    for (const temp of temps) fs.rmSync(temp, { force: true });
  }
}

function withLock(root, relative, work) {
  const file = safePath(root, relative, true);
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, `${process.pid}\n`); return work(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file); }
}

function build(core) {
  safePath(core, 'dist', true);
  fs.mkdirSync(path.join(core, 'dist'), { recursive: true });
  return withLock(core, 'dist/.sdk-build.lock', () => {
    const before = sourceState(core);
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-sdk-build-'));
    try {
      execFileSync('npm', ['run', 'build', '--', '--output-path', stage], { cwd: core, stdio: ['ignore', 2, 2], timeout: 120000 });
      const after = sourceState(core);
      if (before.sourceHash !== after.sourceHash) fail('Build inputs changed during build');
      const bytes = fs.readFileSync(path.join(stage, 'scrapyJs.js'));
      validateBundle(bytes);
      const receipt = { schemaVersion: 1, ...after, sdkHash: hash(bytes), builtAt: new Date().toISOString(),
        nodeVersion: process.version, npmVersion: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() };
      const changes = [[`dist/${BUILD_FILES[0]}`, bytes], [`dist/${BUILD_FILES[1]}`, encode(receipt)]];
      replaceFiles(core, changes, changes.map(([name]) => byteHash(readOptional(core, name))));
      return { status: 'built', ...receipt, core };
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  });
}

function targetState(extension, expectedTargetHash) {
  const bytes = readOptional(extension, SDK);
  const receiptBytes = readOptional(extension, RECEIPT);
  if (receiptBytes) {
    const receipt = JSON.parse(receiptBytes);
    if (receipt.schemaVersion !== 1 || receipt.sdkHash !== hash(bytes)) fail('SDK was edited outside the sync workflow; preserve and reconcile it first');
  } else if (!expectedTargetHash || expectedTargetHash !== hash(bytes)) {
    fail('Unmanaged SDK: apply requires --expected-target-sha from the reviewed current asset');
  }
  return [bytes, receiptBytes];
}

function synchronize(core, extension, mode, expectedTargetHash) {
  const { bytes, receipt } = candidate(core);
  compatibility(extension, receipt);
  const current = readOptional(extension, SDK);
  const currentReceipt = readOptional(extension, RECEIPT);
  const installed = currentReceipt && JSON.parse(currentReceipt);
  const currentMatches = installed && installed.schemaVersion === 1 && installed.packageName === receipt.packageName &&
    byteHash(current) === receipt.sdkHash && installed.sdkHash === receipt.sdkHash && installed.inputs &&
    hash(encode(installed.inputs)) === receipt.sourceHash && installed.sourceHash === receipt.sourceHash &&
    installed.packageVersion === receipt.packageVersion && installed.protocolVersion === receipt.protocolVersion &&
    installed.webpackVersion === receipt.webpackVersion;
  const result = { status: currentMatches ? 'current' : 'update-needed', core, extension,
    coreVersion: receipt.packageVersion, extensionVersion: json(path.join(extension, 'manifest.json')).version,
    protocolVersion: receipt.protocolVersion, sourceHash: receipt.sourceHash, sdkHash: receipt.sdkHash,
    targetHash: hash(current) };
  if (mode === 'check') return result;
  return withLock(extension, '.sdk-sync.lock', () => {
    const before = targetState(extension, expectedTargetHash);
    if (byteHash(before[0]) !== byteHash(current) || byteHash(before[1]) !== byteHash(currentReceipt)) fail('Target changed before update');
    candidate(core);
    if (currentMatches) return result;
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const backupRelative = `.sdk-backups/${id}`;
    const backup = safePath(extension, backupRelative, true);
    fs.mkdirSync(backup, { recursive: true });
    before.forEach((data, i) => { if (data !== null) fs.writeFileSync(path.join(backup, `before-${i}`), data); });
    const changes = [[SDK, bytes], [RECEIPT, encode(receipt)]];
    const transaction = { schemaVersion: 1, files: [SDK, RECEIPT], before: before.map(byteHash), after: changes.map(([, b]) => hash(b)) };
    fs.writeFileSync(path.join(backup, 'transaction.json'), encode(transaction));
    // Recheck source immediately before updating; no filesystem-wide lock is promised.
    candidate(core);
    replaceFiles(extension, changes, transaction.before);
    return { ...result, status: 'updated', backup: backupRelative };
  });
}

function rollback(extension, backupRelative) {
  if (!backupRelative || !/^\.sdk-backups\/[a-zA-Z0-9-]+$/.test(backupRelative)) fail('Use the exact .sdk-backups/<id> returned by apply');
  return withLock(extension, '.sdk-sync.lock', () => {
    const backup = safePath(extension, backupRelative);
    const transaction = json(safePath(extension, `${backupRelative}/transaction.json`));
    if (transaction.schemaVersion !== 1 || JSON.stringify(transaction.files) !== JSON.stringify([SDK, RECEIPT]) ||
        !Array.isArray(transaction.before) || !Array.isArray(transaction.after) || transaction.before.length !== 2 || transaction.after.length !== 2 ||
        !transaction.before.every(value => value === null || /^[a-f0-9]{64}$/.test(value)) ||
        !transaction.after.every(value => /^[a-f0-9]{64}$/.test(value))) fail('Invalid backup transaction');
    const changes = transaction.files.map((name, i) => {
      const data = transaction.before[i] === null ? null : fs.readFileSync(safePath(extension, `${backupRelative}/before-${i}`));
      if (byteHash(data) !== transaction.before[i]) fail('Corrupt backup');
      return [name, data];
    });
    replaceFiles(extension, changes, transaction.after);
    return { status: 'rolled-back', extension, backup: path.relative(extension, backup) };
  });
}

function main(argv) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'check';
  if (!['build', 'check', 'apply', 'rollback'].includes(mode)) fail('Modes: build, check (default), apply, rollback');
  const options = {};
  while (argv.length) {
    const flag = argv.shift();
    if (!['--core', '--extension', '--expected-target-sha', '--backup'].includes(flag) || options[flag] || !argv[0] || argv[0].startsWith('--')) fail(`Invalid option: ${flag}`);
    options[flag] = argv.shift();
  }
  const core = repository(options['--core'] || path.resolve(__dirname, '..'), 'core');
  if (mode === 'build') return build(core);
  const extension = repository(options['--extension'] || path.resolve(core, '../scrapyJsChrome'), 'extension');
  if (core === extension) fail('Core and extension must be distinct');
  if (mode === 'rollback') return rollback(extension, options['--backup']);
  return synchronize(core, extension, mode, options['--expected-target-sha']);
}

module.exports = { main, sourceState, validateBundle, replaceFiles };
if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'update-needed') process.exitCode = 2;
  } catch (error) { console.error(JSON.stringify({ status: 'failed', error: error.message })); process.exitCode = 1; }
}
