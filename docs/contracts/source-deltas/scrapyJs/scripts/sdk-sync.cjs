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
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateReceipt(receipt, bytes, label) {
  const invalid = reason => fail(`${label}: Invalid SDK receipt (${reason})`);
  if (!record(receipt) || receipt.schemaVersion !== 1 || receipt.packageName !== 'scrapyjs' ||
      !version(receipt.packageVersion) || receipt.protocolVersion !== PROTOCOL || !version(receipt.webpackVersion)) invalid('identity');
  if (!digest(receipt.sourceHash) || !digest(receipt.sdkHash) || bytes === null || receipt.sdkHash !== hash(bytes)) invalid('hashes');
  if (!record(receipt.inputs)) invalid('inputs');
  const required = ['src/index.js', 'package.json', 'package-lock.json', 'webpack.config.js'];
  if (!required.every(name => Object.hasOwn(receipt.inputs, name))) invalid('missing build inputs');
  for (const [name, value] of Object.entries(receipt.inputs)) {
    if (!(name.startsWith('src/') || required.includes(name)) || name.includes('\\') ||
        name.split('/').some(part => !part || part === '.' || part === '..') || !digest(value)) invalid('input path or digest');
  }
  if (hash(encode(receipt.inputs)) !== receipt.sourceHash) invalid('input fingerprint');
  if (typeof receipt.gitHead !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(receipt.gitHead) ||
      typeof receipt.gitStatus !== 'string' || typeof receipt.nodeVersion !== 'string' ||
      !receipt.nodeVersion.startsWith('v') || !version(receipt.nodeVersion.slice(1)) || !version(receipt.npmVersion) ||
      typeof receipt.builtAt !== 'string' || !Number.isFinite(Date.parse(receipt.builtAt)) ||
      new Date(receipt.builtAt).toISOString() !== receipt.builtAt) invalid('build context');
  return receipt;
}

// Timestamps and Git status are context, not candidate identity. Bind all bytes/provenance fields.
function identity(receipt) {
  return hash(encode([receipt.schemaVersion, receipt.packageName, receipt.packageVersion, receipt.protocolVersion,
    receipt.sourceHash, receipt.sdkHash, receipt.webpackVersion, receipt.inputs]));
}

function freshCandidate(core, captured) {
  const fresh = candidate(core);
  if (identity(fresh.receipt) !== identity(captured.receipt) || hash(fresh.bytes) !== hash(captured.bytes)) fail('Candidate changed after validation; retry with the fresh build');
  return fresh;
}

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
  validateReceipt(receipt, bytes, 'Stale, modified or unproven SDK; run sdk-sync build');
  const state = sourceState(core);
  if (receipt.schemaVersion !== 1 || receipt.packageName !== state.packageName || receipt.packageVersion !== state.packageVersion ||
      receipt.protocolVersion !== PROTOCOL || receipt.sourceHash !== state.sourceHash || receipt.webpackVersion !== state.webpackVersion ||
      hash(encode(receipt.inputs)) !== state.sourceHash || receipt.sdkHash !== hash(bytes)) fail('Stale, modified or unproven SDK; run sdk-sync build');
  validateBundle(bytes);
  return { bytes, receipt };
}

// Parse only; never evaluate extension source. Acorn is already a webpack dependency.
// Unsupported/dynamic or shadowed bindings are rejected instead of guessed.
function validateSenderProtocol(source, relative) {
  const invalid = reason => fail(`Sender protocol unproven: ${relative} (${reason})`);
  let ast;
  try {
    const acorn = require(require.resolve('acorn', { paths: [path.dirname(require.resolve('webpack/package.json'))] }));
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (error) { invalid(`cannot parse source: ${error.message}`); }
  const nodes = [];
  const parents = new Map();
  const bindings = [];
  function pattern(node) {
    if (!node) return [];
    if (node.type === 'Identifier') return [node];
    if (node.type === 'RestElement') return pattern(node.argument);
    if (node.type === 'AssignmentPattern') return pattern(node.left);
    if (node.type === 'ArrayPattern') return node.elements.flatMap(pattern);
    if (node.type === 'ObjectPattern') return node.properties.flatMap(prop => pattern(prop.type === 'RestElement' ? prop.argument : prop.value));
    return [];
  }
  function walk(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    nodes.push(node);
    parents.set(node, parent);
    if (node.type === 'VariableDeclarator') bindings.push(...pattern(node.id));
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      if (node.id) bindings.push(node.id);
      bindings.push(...node.params.flatMap(pattern));
    }
    if (['ClassDeclaration', 'ClassExpression'].includes(node.type) && node.id) bindings.push(node.id);
    if (node.type === 'CatchClause') bindings.push(...pattern(node.param));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) walk(child, node); }
      else if (value && typeof value === 'object') walk(value, node);
    }
  }
  walk(ast, null);
  function unambiguous(name, id) {
    const declarations = bindings.filter(node => node.name === name);
    if (declarations.length !== 1 || declarations[0] !== id) invalid(`ambiguous/shadowed ${name}`);
    for (const node of nodes) {
      const target = node.type === 'AssignmentExpression' ? node.left : node.type === 'UpdateExpression' ? node.argument : null;
      if (pattern(target).some(item => item.name === name) ||
          (target?.type === 'MemberExpression' && (target.property.name === name || target.property.value === name))) invalid(`mutable ${name}`);
    }
  }
  function topFunction(name) {
    const found = ast.body.filter(node => node.type === 'FunctionDeclaration' && node.id.name === name);
    if (found.length !== 1) invalid(`missing unique top-level ${name}`);
    unambiguous(name, found[0].id);
    return found[0];
  }
  function property(object, name) {
    if (object?.type !== 'ObjectExpression' || object.properties.some(prop => prop.type !== 'Property' || prop.computed || prop.kind !== 'init' || prop.method)) invalid(`unsupported ${name} object`);
    const found = object.properties.filter(prop => (prop.key.name ?? prop.key.value) === name);
    if (found.length !== 1) invalid(`missing/duplicate ${name}`);
    return found[0].value;
  }
  const builder = topFunction('buildRequestMeta');
  const body = builder.body.body;
  if (body.length !== 1 || body[0].type !== 'ReturnStatement') invalid('dynamic metadata builder');
  let protocol = property(body[0].argument, 'protocolVersion');
  if (protocol.type === 'Identifier') {
    const name = protocol.name;
    const declarations = ast.body.filter(node => node.type === 'VariableDeclaration' && node.kind === 'const')
      .flatMap(node => node.declarations).filter(node => node.id.type === 'Identifier' && node.id.name === name);
    if (declarations.length !== 1) invalid('protocol must be a literal or top-level const literal');
    unambiguous(name, declarations[0].id);
    protocol = declarations[0].init;
  }
  if (protocol?.type !== 'Literal' || protocol.value !== PROTOCOL) invalid('protocol literal mismatch');
  const sender = topFunction('sendRuntimeMessageWithProtocol');
  if (sender.params[0]?.type !== 'Identifier') invalid('unsupported message parameter');
  const parameter = sender.params[0];
  const inside = (node, ancestor) => {
    for (let current = node; current; current = parents.get(current)) { if (current === ancestor) return true; }
    return false;
  };
  if (bindings.some(node => node.name === parameter.name && node !== parameter && inside(node, sender))) invalid('shadowed message parameter');
  if (bindings.some(node => node.name === 'chrome')) invalid('shadowed chrome host binding');
  const forwards = [];
  // Account for every host reference in the wrapper, including computed/aliased sinks.
  for (const node of nodes.filter(node => inside(node, sender) && node.type === 'Identifier' && node.name === 'chrome')) {
    const runtime = parents.get(node);
    const member = parents.get(runtime);
    if (runtime?.type !== 'MemberExpression' || runtime.object !== node || runtime.computed || runtime.property.name !== 'runtime' ||
        member?.type !== 'MemberExpression' || member.object !== runtime || member.computed) invalid('indirect chrome runtime reference');
    if (member.property.name === 'lastError') continue;
    const call = parents.get(member);
    if (member.property.name !== 'sendMessage' || call?.type !== 'CallExpression' || call.callee !== member || call.optional) invalid('indirect chrome runtime send');
    forwards.push(call);
  }
  if (!forwards.length || forwards.some(node => node.arguments[0]?.type !== 'Identifier' || node.arguments[0].name !== parameter.name)) invalid('message is not forwarded to chrome.runtime.sendMessage');
  for (const forward of forwards) {
    for (let ancestor = parents.get(forward); ancestor && ancestor !== sender; ancestor = parents.get(ancestor)) {
      if (['IfStatement', 'ConditionalExpression', 'LogicalExpression', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchCase'].includes(ancestor.type)) invalid('conditional/unproven forwarding path');
      if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(ancestor.type)) {
        const promise = parents.get(ancestor);
        const returned = parents.get(promise);
        if (promise?.type !== 'NewExpression' || promise.callee.type !== 'Identifier' || promise.callee.name !== 'Promise' ||
            promise.arguments[0] !== ancestor || returned?.type !== 'ReturnStatement' || returned.argument !== promise ||
            !sender.body.body.includes(returned) || bindings.some(node => node.name === 'Promise')) invalid('unproven nested forwarding function');
      }
    }
  }
  function roots(target) {
    if (!target) return [];
    if (target.type === 'MemberExpression') return roots(target.object);
    if (target.type === 'ObjectPattern') return target.properties.flatMap(prop => roots(prop.value || prop.argument));
    if (target.type === 'ArrayPattern') return target.elements.flatMap(roots);
    if (target.type === 'RestElement') return roots(target.argument);
    return pattern(target);
  }
  for (const node of nodes.filter(node => inside(node, sender))) {
    const target = ['AssignmentExpression', 'ForInStatement', 'ForOfStatement'].includes(node.type) ? node.left :
      node.type === 'UpdateExpression' || (node.type === 'UnaryExpression' && node.operator === 'delete') ? node.argument : null;
    if (roots(target).some(item => item.name === parameter.name)) invalid('message is mutated before forwarding');
    if (node.type !== 'Identifier' || node.name !== parameter.name || node === parameter || forwards.some(call => call.arguments[0] === node)) continue;
    const parent = parents.get(node);
    // Existing wrappers only read requestId for diagnostics. Reject object escape
    // and meta aliases instead of trying to prove arbitrary helper side effects.
    if (parent?.type !== 'MemberExpression' || parent.object !== node || parent.computed || parent.property.name !== 'requestId') invalid('message alias/escape is unproven');
  }
  const sends = nodes.filter(node => node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === sender.id.name);
  if (!sends.length) invalid('no bound message construction');
  const allowed = new Set([builder.id, sender.id]);
  for (const send of sends) {
    const meta = property(send.arguments[0], 'meta');
    if (meta.type !== 'CallExpression' || meta.callee.type !== 'Identifier' || meta.callee.name !== builder.id.name) invalid('message metadata does not use the validated builder');
    allowed.add(send.callee);
    allowed.add(meta.callee);
  }
  // Reject aliases/indirect calls which would escape the proven construction paths.
  for (const node of nodes) {
    if (node.type !== 'Identifier' || ![builder.id.name, sender.id.name].includes(node.name) || allowed.has(node)) continue;
    const parent = parents.get(node);
    if ((parent?.type === 'Property' && parent.key === node && !parent.computed && parent.value !== node) ||
        (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)) continue;
    invalid(`unbound reference to ${node.name}`);
  }
}

function compatibility(extension, receipt) {
  const compat = json(safePath(extension, 'sdk-compatibility.json'));
  if (compat.schemaVersion !== 1 || compat.protocolVersion !== receipt.protocolVersion ||
      !Array.isArray(compat.coreVersions) || !compat.coreVersions.includes(receipt.packageVersion)) fail('Unreviewed package version or incompatible bridge protocol');
  for (const relative of ['www/popup_crawl.js', 'assets/js/core/tb-bridge.js']) {
    const source = fs.readFileSync(safePath(extension, relative), 'utf8');
    validateSenderProtocol(source, relative);
  }
}

function readOptional(root, relative) {
  const file = safePath(root, relative, true);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
function byteHash(bytes) { return bytes === null ? null : hash(bytes); }

// Each rename is atomic on this filesystem; the pair is not crash-atomic.
// Stage recovery preimages before mutating anything. Compensation may only replace
// our postimage; preserve external edits and retained materials when recovery fails.
function replaceFiles(root, changes, expected) {
  const token = crypto.randomUUID();
  const before = changes.map(([relative]) => readOptional(root, relative));
  const temps = [];
  const recoveryFiles = [];
  const retained = new Set();
  const recoveryErrors = [];
  let originalError;
  let updated = 0;
  try {
    for (let i = 0; i < changes.length; i++) {
      const [relative, bytes] = changes[i];
      if (byteHash(before[i]) !== expected[i]) fail('Target changed before update');
      const dest = safePath(root, relative, true);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const temp = `${dest}.${token}.tmp`;
      temps.push(temp);
      if (bytes !== null) fs.writeFileSync(temp, bytes, { flag: 'wx' });
      const recovery = { target: dest, path: `${dest}.${token}.recovery`, beforeHash: expected[i], afterHash: byteHash(bytes) };
      recoveryFiles.push(recovery);
      fs.writeFileSync(recovery.path, before[i] === null ? encode({ schemaVersion: 1, target: dest, beforeHash: null }) : before[i], { flag: 'wx' });
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
    originalError = error;
    for (let i = updated - 1; i >= 0; i--) {
      try {
        const relative = changes[i][0];
        const dest = safePath(root, relative, true);
        const currentHash = byteHash(readOptional(root, relative));
        if (currentHash === expected[i]) continue; // Already restored by another actor.
        if (currentHash !== byteHash(changes[i][1])) fail(`Recovery conflict: target changed outside this transaction: ${dest}`);
        if (before[i] === null) fs.rmSync(dest, { force: true });
        else {
          // Hash the retained preimage too; never restore corrupt recovery material.
          if (hash(fs.readFileSync(recoveryFiles[i].path)) !== expected[i]) fail(`Recovery preimage changed: ${recoveryFiles[i].path}`);
          fs.renameSync(recoveryFiles[i].path, dest);
        }
      } catch (recoveryError) {
        retained.add(i);
        recoveryErrors.push({ target: recoveryFiles[i].target, error: recoveryError.message });
      }
    }
  }
  for (const file of [...temps, ...recoveryFiles.filter((_, i) => !retained.has(i)).map(item => item.path)]) {
    try { fs.rmSync(file, { force: true }); }
    catch (error) { recoveryErrors.push({ target: file, error: `Recovery cleanup failed: ${error.message}` }); }
  }
  if (recoveryErrors.length) {
    const error = new AggregateError([...(originalError ? [originalError] : []), ...recoveryErrors.map(item => new Error(item.error))],
      `${originalError?.message || 'Update cleanup failed'}; Recovery incomplete: ${recoveryErrors.map(item => item.error).join('; ')}`,
      { cause: originalError });
    error.originalError = originalError;
    error.recoveryErrors = recoveryErrors;
    error.recoveryFiles = recoveryFiles.filter((item, i) => retained.has(i) || fs.existsSync(item.path));
    throw error;
  }
  if (originalError) throw originalError;
}

function withLock(root, relative, work) {
  const file = safePath(root, relative, true);
  const fd = fs.openSync(file, 'wx');
  let result;
  let error;
  try { fs.writeFileSync(fd, `${process.pid}\n`); result = work(); }
  catch (caught) { error = caught; }
  for (const cleanup of [() => fs.closeSync(fd), () => fs.unlinkSync(file)]) {
    try { cleanup(); }
    catch (cleanupError) {
      const previous = error;
      error = new AggregateError([...(previous ? [previous] : []), cleanupError],
        `${previous?.message || 'Lock cleanup failed'}; Lock cleanup failed: ${cleanupError.message}`, { cause: previous });
      error.originalError = previous?.originalError || previous;
      error.recoveryErrors = [...(previous?.recoveryErrors || []), { target: file, error: cleanupError.message }];
      error.recoveryFiles = previous?.recoveryFiles || [];
    }
  }
  if (error) throw error;
  return result;
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
    validateReceipt(receipt, bytes, 'SDK was edited outside the sync workflow; preserve and reconcile it first');
  } else if (!expectedTargetHash || expectedTargetHash !== hash(bytes)) {
    fail('Unmanaged SDK: apply requires --expected-target-sha from the reviewed current asset');
  }
  return [bytes, receiptBytes];
}

function synchronize(core, extension, mode, expectedTargetHash) {
  const captured = candidate(core);
  const { bytes, receipt } = captured;
  compatibility(extension, receipt);
  const current = readOptional(extension, SDK);
  const currentReceipt = readOptional(extension, RECEIPT);
  const installed = currentReceipt && JSON.parse(currentReceipt);
  if (currentReceipt !== null) validateReceipt(installed, current, 'SDK was edited outside the sync workflow; preserve and reconcile it first');
  const currentMatches = installed && identity(installed) === identity(receipt);
  const result = { status: currentMatches ? 'current' : 'update-needed', core, extension,
    coreVersion: receipt.packageVersion, extensionVersion: json(path.join(extension, 'manifest.json')).version,
    protocolVersion: receipt.protocolVersion, sourceHash: receipt.sourceHash, sdkHash: receipt.sdkHash,
    targetHash: hash(current) };
  const freshValidation = () => {
    freshCandidate(core, captured);
    compatibility(extension, receipt);
  };
  const unchangedTarget = () => {
    if (byteHash(readOptional(extension, SDK)) !== byteHash(current) ||
        byteHash(readOptional(extension, RECEIPT)) !== byteHash(currentReceipt)) fail('Target changed during validation');
  };
  if (mode === 'check') { freshValidation(); unchangedTarget(); return result; }
  return withLock(extension, '.sdk-sync.lock', () => {
    const before = targetState(extension, expectedTargetHash);
    if (byteHash(before[0]) !== byteHash(current) || byteHash(before[1]) !== byteHash(currentReceipt)) fail('Target changed before update');
    freshValidation();
    unchangedTarget();
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
    freshValidation();
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

module.exports = { main, sourceState, validateBundle, replaceFiles, validateSenderProtocol };
if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'update-needed') process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: error.message,
      originalError: error.originalError?.message, recoveryErrors: error.recoveryErrors, recoveryFiles: error.recoveryFiles }));
    process.exitCode = 1;
  }
}
