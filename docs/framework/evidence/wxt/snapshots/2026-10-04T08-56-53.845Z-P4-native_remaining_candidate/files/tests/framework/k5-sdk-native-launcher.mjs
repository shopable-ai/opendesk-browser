import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, readdir, realpath, stat, lstat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

export const LAUNCHER = '/Users/shopme/.codex/browser-testing/launch.py';
const RESTART_HELPER = fileURLToPath(new URL('./k5-sdk-native-restart.py', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// The wrapper owns every Chrome process and its fresh profile. Inspectors only
// disconnect CDP sockets; termination signals go to this still-running wrapper.
export async function launchChrome({root, binary, extension, headed, directory, label, sameProfileRestart = false}) {
  const launcherSource = await readFile(LAUNCHER), startedAt = Date.now();
  const temporaryRoot = await realpath(os.tmpdir()), existing = new Set(await readdir(temporaryRoot));
  const metadataFile = path.join(directory, `launcher-${label}.json`);
  const argv = [LAUNCHER, '--executable', binary, '--report', metadataFile, '--remote-debugging-port=0',
    `--load-extension=${extension}`, `--disable-extensions-except=${extension}`, ...(headed ? [] : ['--headless=new']), 'about:blank'];
  const processArgs = sameProfileRestart ? [RESTART_HELPER, ...argv] : argv;
  const launcher = spawn('/usr/bin/python3', processArgs, {cwd: root, stdio: [sameProfileRestart ? 'pipe' : 'ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '', metadata;
  launcher.stdout.on('data', bytes => { stdout += bytes.toString(); });
  launcher.stderr.on('data', bytes => { stderr += bytes.toString(); });
  let spawnError;
  launcher.on('error', error => { spawnError = error; });
  const exited = new Promise(resolve => {
    launcher.once('exit', (code, signal) => resolve({code, signal, observedEvent: 'exit'}));
    launcher.once('close', (code, signal) => resolve({code, signal, observedEvent: 'close'}));
  });
  async function copyLog() {
    if (metadata?.log) try { await writeFile(path.join(directory, `chrome-${label}.log`), await readFile(metadata.log)); } catch {}
  }
  const cleanup = createCleanupController({launcher, binary, directory, label, metadataFile, sameProfileRestart,
    exited, getOutput: () => ({stdout, stderr})});
  const stop = () => cleanup.stop();
  try {
    for (let count = 0; count < 400; count++) {
      if (spawnError) throw spawnError;
      try { metadata = JSON.parse(await readFile(metadataFile, 'utf8')); cleanup.track(metadata); break; } catch {}
      if (launcher.exitCode !== null) throw new Error(`Launcher exited before metadata: ${stderr}`);
      await sleep(30);
    }
    assert(metadata, 'Launcher native process metadata was not observed');
    assert(Number.isSafeInteger(metadata.pid) && metadata.pid > 0);
    assert.equal(await realpath(metadata.executable), await realpath(binary));
    assert.equal(metadata.args.filter(arg => arg === '--use-mock-keychain').length, 1);
    assert.deepEqual(metadata.args.filter(arg => arg.startsWith('--user-data-dir=')), [`--user-data-dir=${metadata.profile}`]);
    assert(metadata.args.includes('--remote-debugging-port=0') && metadata.args.includes(`--load-extension=${extension}`));
    assert(!metadata.args.includes('--'), 'Chrome argv must not contain a switch terminator');
    const profile = await realpath(metadata.profile), profileInfo = await stat(profile);
    assert.equal(path.dirname(profile), temporaryRoot);
    assert(path.basename(profile).startsWith('codex-cft-') && !existing.has(path.basename(profile)));
    assert(profileInfo.isDirectory() && profileInfo.birthtimeMs >= startedAt - 2000 && (profileInfo.mode & 0o777) === 0o700);
    cleanup.bindProfile(metadata.profile, profileInfo);
    const nativeProcess = execFileSync('/bin/ps', ['-p', String(metadata.pid), '-o', 'pid=,ppid=,command='], {cwd: root, encoding: 'utf8'}).trim();
    assert(nativeProcess.includes('--use-mock-keychain') && nativeProcess.includes(`--user-data-dir=${metadata.profile}`) &&
      nativeProcess.includes('--remote-debugging-port=0') && nativeProcess.includes(`--load-extension=${extension}`));
    assert.equal(Number(nativeProcess.split(/\s+/)[1]), launcher.pid, 'Actual Chrome main process must remain a child of the live launcher');
    assert(launcher.exitCode === null && launcher.signalCode === null);
    let endpoint;
    for (let count = 0; count < 600; count++) {
      try { const [port, route] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
        if (/^\d+$/.test(port) && route.startsWith('/devtools/browser/')) { endpoint = `ws://127.0.0.1:${port}${route}`; break; } } catch {}
      if (launcher.exitCode !== null) throw new Error('Owned browser exited before native DevTools endpoint');
      await sleep(30);
    }
    assert(endpoint, 'Owned native DevTools endpoint was not observed');
    let evidence = {...metadata, launcherPid: launcher.pid, python: '/usr/bin/python3', launcher: LAUNCHER,
      launcherSha256: hash(launcherSource), launcherArgs: argv, actualMainProcess: nativeProcess,
      freshProfileObserved: {path: profile, birthtimeMs: profileInfo.birthtimeMs, previouslyPresent: false, mode: '0700'}, endpoint};
    if (sameProfileRestart) Object.assign(evidence, {restartHelper: RESTART_HELPER, restartHelperSha256: hash(await readFile(RESTART_HELPER)), actualLauncherArgs: processArgs});
    await writeFile(path.join(directory, `launcher-${label}-verified.json`), JSON.stringify(evidence, null, 2) + '\n');
    async function restart() {
      assert(sameProfileRestart && !cleanup.stopped, 'Same-run restart requires the live controlled adapter');
      assert.equal(evidence.generation ?? 1, 1, 'Only one restart is allowed');
      const previous = evidence;
      try {
      launcher.stdin.write(JSON.stringify({action: 'restart'}) + '\n');
      let next;
      for (let count = 0; count < 1000; count++) {
        if (launcher.exitCode !== null || launcher.signalCode !== null) throw new Error(`Restart launcher exited: ${stderr}`);
        try { const observed = JSON.parse(await readFile(metadataFile, 'utf8')); if (observed.generation === 2) { next = observed; cleanup.track(next); metadata = next; break; } } catch {}
        await sleep(30);
      }
      assert(next, 'Same-profile generation two metadata not observed');
      assert.equal(next.previousPid, previous.pid); assert.notEqual(next.pid, previous.pid);
      assert.equal(next.profile, previous.profile); assert.equal(next.executable, previous.executable);
      assert.deepEqual(next.args, previous.args);
      assert.equal(await realpath(next.profile), profile);
      const after = await stat(profile);
      assert.equal(after.dev, profileInfo.dev); assert.equal(after.ino, profileInfo.ino); assert.equal(after.mode & 0o777, 0o700);
      // Update cleanup ownership before any subsequent validation can fail.
      metadata = next;
      const processLine = execFileSync('/bin/ps', ['-p', String(next.pid), '-o', 'pid=,ppid=,command='], {cwd: root, encoding: 'utf8'}).trim();
      assert.equal(Number(processLine.split(/\s+/)[1]), launcher.pid);
      assert(processLine.includes(binary) && processLine.includes('--use-mock-keychain') && processLine.includes(`--user-data-dir=${next.profile}`));
      let oldAlive = true; try { process.kill(previous.pid, 0); } catch (error) { if (error.code === 'ESRCH') oldAlive = false; else throw error; }
      assert.equal(oldAlive, false, 'Previous whole-browser main process must have exited');
      let nextEndpoint;
      for (let count = 0; count < 600; count++) {
        try { const [port, route] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
          if (/^\d+$/.test(port) && route.startsWith('/devtools/browser/')) { nextEndpoint = `ws://127.0.0.1:${port}${route}`; break; } } catch {}
        if (launcher.exitCode !== null || launcher.signalCode !== null) throw new Error(`Restart launcher exited: ${stderr}`);
        await sleep(30);
      }
      assert(nextEndpoint && nextEndpoint !== previous.endpoint, 'Fresh native browser DevTools endpoint required');
      const lifecycle = (await readFile(metadataFile.replace(/\.json$/, '.lifecycle.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert(lifecycle.some(event => event.event === 'browser-exited' && event.pid === previous.pid && event.returncode === 0));
      assert(lifecycle.some(event => event.event === 'restarted' && event.pid === next.pid && event.previousPid === previous.pid));
      evidence = {...previous, ...next, endpoint: nextEndpoint, actualMainProcess: processLine,
        restartObserved: {sameProfile: true, profileDevice: after.dev, profileInode: after.ino, previousPidAlive: false, lifecycle}};
      await writeFile(path.join(directory, `launcher-${label}-restart-verified.json`), JSON.stringify(evidence, null, 2) + '\n');
      return {metadata: evidence, endpoint: nextEndpoint};
      } catch (error) { cleanup.original(error); throw error; }
    }
    return {get metadata() { return evidence; }, get endpoint() { return evidence.endpoint; }, restart, stop, copyLog};
  } catch (error) { cleanup.original(error); error.cleanup = await stop(); throw error; }
}

const projectError = (error, stage) => ({stage, name: error.name, code: error.code, message: error.message});
const defaultProbe = pid => {
  try { process.kill(pid, 0); return {state: 'alive'}; }
  catch (error) { return error.code === 'ESRCH' ? {state: 'exited'} : {state: 'unknown', error: projectError(error, 'pid-probe')}; }
};
function inspectOwned(pid, launcherPid, binary, profile) {
  const identity = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,comm='], {encoding: 'utf8'}).trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  assert(identity && Number(identity[1]) === pid && Number(identity[2]) === launcherPid && identity[3] === binary, 'Owned PID/PPID/executable mismatch');
  const command = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], {encoding: 'utf8'}).trim();
  const has = flag => new RegExp(`(^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`).test(command);
  assert(has('--use-mock-keychain') && has(`--user-data-dir=${profile}`) && !/(^|\s)--type(?:=|\s|$)/.test(command), 'Owned main-process arguments mismatch');
  return {identity: identity[0], command};
}

// Injectable only at this local ownership boundary; tests never spawn a browser.
// stop resolves a failure receipt rather than throwing past callers' report save.
export function createCleanupController({launcher, binary, directory, label, metadataFile,
  sameProfileRestart, exited, getOutput, io = {}}) {
  const deps = {readFile, writeFile, lstat, probe: defaultProbe, inspect: inspectOwned,
    signal: (pid, signal) => process.kill(pid, signal), fail: () => { process.exitCode = 1; },
    fallback: value => console.error(JSON.stringify(value)), ...io};
  const candidates = new Map(), originalErrors = [], attempts = [];
  let profile, profileIdentity, inFlight, stopped = false, lastResult;
  const waitForExit = deps.waitForExit || (ms => new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    exited.then(value => { clearTimeout(timer); resolve(value); });
  }));
  function track(value) {
    if (Number.isSafeInteger(value?.pid) && value.pid > 0) {
      candidates.set(value.pid, value);
      if (!profile && typeof value.profile === 'string') profile = value.profile;
    }
  }
  const original = error => originalErrors.push(projectError(error, 'operation'));
  async function perform() {
    const errors = [], outputs = getOutput(), raw = {stdout: outputs.stdout, stderr: outputs.stderr};
    const capture = (error, stage) => errors.push(projectError(error, stage));
    const attempt = {number: attempts.length + 1, errors, raw}; attempts.push(attempt);
    let exit = null, profileRemoved = false, profileState = 'unknown', states = [];
    // Every independent evidence path is attempted; malformed lifecycle must not
    // prevent PID discovery or cleanup. Preserve bytes as well as parse errors.
    async function read(name, optional = false) {
      try { const value = await deps.readFile(name, 'utf8'); return value; }
      catch (error) { if (!optional || error.code !== 'ENOENT') capture(error, `read:${name}`); return null; }
    }
    function decode(value, stage) { try { return JSON.parse(value); } catch (error) { capture(error, stage); return null; } }
    const currentMetadata = await read(metadataFile, true);
    if (currentMetadata) track(decode(currentMetadata, 'metadata-parse'));
    for (const line of outputs.stdout.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      const value = decode(line, 'stdout-parse');
      if (value?.event === 'owned-child') track(value);
    }
    try {
      if (sameProfileRestart && !launcher.stdin.destroyed) launcher.stdin.end();
      if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill('SIGTERM');
      exit = await waitForExit(8000);
      if (!exit) {
        for (const [pid] of candidates) {
          const observed = deps.probe(pid);
          if (observed.state === 'alive') {
            try {
              // Directory inspection is deliberately absent from process cleanup.
              deps.inspect(pid, launcher.pid, binary, profile);
              deps.signal(pid, 'SIGKILL');
            } catch (error) { capture(error, `fallback-child:${pid}`); }
          } else if (observed.state === 'unknown') capture(new Error(JSON.stringify(observed)), `probe-child:${pid}`);
        }
        exit = await waitForExit(12000);
      }
      if (!exit) capture(new Error('Owned launcher exit timeout'), 'launcher-exit');
    } catch (error) { capture(error, 'launcher-cleanup'); }
    if (sameProfileRestart) {
      raw.lifecycle = await read(metadataFile.replace(/\.json$/, '.lifecycle.jsonl'));
      attempt.lifecycle = [];
      for (const line of raw.lifecycle?.split('\n') ?? []) if (line.trim()) {
        const value = decode(line, 'lifecycle-parse');
        if (value) { attempt.lifecycle.push(value); if (value.pid) track(value); }
      }
      raw.adapterCleanup = await read(metadataFile.replace(/\.json$/, '.cleanup.json'));
      if (raw.adapterCleanup) {
        const adapter = decode(raw.adapterCleanup, 'adapter-cleanup-parse');
        attempt.adapterCleanup = adapter;
        for (const value of adapter?.children ?? []) track(value);
        if (adapter?.status !== 'PASS') capture(new Error(JSON.stringify(adapter)), 'adapter-cleanup-failed');
      }
    }
    for (const [pid] of candidates) {
      try { states.push({pid, ...deps.probe(pid)}); }
      catch (error) { capture(error, `final-probe:${pid}`); states.push({pid, state: 'unknown', error: projectError(error, 'probe')}); }
    }
    if (profile) try {
      const info = await deps.lstat(profile);
      profileState = profileIdentity && (info.dev !== profileIdentity.dev || info.ino !== profileIdentity.ino || !info.isDirectory()) ? 'replaced-path-retained' : 'retained';
    } catch (error) {
      if (error.code === 'ENOENT') { profileRemoved = true; profileState = 'path-absent'; }
      else { capture(error, 'profile-inspection'); profileState = 'unknown'; }
    }
    const residual = [...states.filter(row => row.state !== 'exited'),
      ...(!exit ? [{launcherPid: launcher.pid, state: 'exit-unconfirmed'}] : []),
      ...(!profileRemoved ? [{profile: profile ?? null, state: profileState}] : [])];
    if (residual.length) capture(new Error('Owned resource cleanup incomplete'), 'residual');
    let result = {exit, pidAliveAfterExit: states.some(row => row.state === 'unknown') ? null : states.some(row => row.state === 'alive'),
      profileRemoved, profileState, cleanupOwner: LAUNCHER, cleanupStatus: errors.length ? 'FAIL' : 'PASS',
      lifecycle: attempt.lifecycle ?? [], originalErrors, cleanupErrors: errors, residual, attempts, candidates: [...candidates.values()]};
    // Attempt every save even if another save fails. The final receipt includes
    // all earlier write errors and raw malformed/missing lifecycle evidence.
    for (const [name, value] of [
      [`launcher-${label}-stdout.txt`, outputs.stdout], [`launcher-${label}-stderr.txt`, outputs.stderr],
      [`launcher-${label}-raw-failure.json`, () => JSON.stringify({originalErrors, attempts}, null, 2)],
      [`launcher-${label}-summary.json`, () => JSON.stringify({originalErrors, errors, residual, states, profileState}, null, 2)],
      [`launcher-${label}-exit.json`, () => { result.cleanupStatus = errors.length ? 'FAIL' : 'PASS'; return JSON.stringify(result, null, 2); }]
    ]) try { await deps.writeFile(path.join(directory, name), typeof value === 'function' ? value() + '\n' : value); }
      catch (error) { capture(error, `write:${name}`); }
    result.cleanupStatus = errors.length ? 'FAIL' : 'PASS';
    if (result.cleanupStatus !== 'PASS') { deps.fail(); deps.fallback({event: 'launcher-cleanup-failed', ...result}); }
    stopped = result.cleanupStatus === 'PASS';
    lastResult = result;
    return result;
  }
  return {track, original, bindProfile: (value, info) => { profile = value; profileIdentity = {dev: info.dev, ino: info.ino}; },
    get stopped() { return stopped; }, stop() {
      if (stopped) return Promise.resolve(lastResult);
      if (inFlight) return inFlight;
      if (attempts.length >= 3) return Promise.resolve(lastResult);
      inFlight = perform().catch(error => {
        // Last-resort receipt; never erase the operation error or block callers'
        // report finally. Preserve this failure and permit another bounded try.
        deps.fail();
        const result = {cleanupStatus: 'FAIL', originalErrors, cleanupErrors: [projectError(error, 'cleanup-controller')],
          residual: [{state: 'unknown'}], attempts, pidAliveAfterExit: null, profileRemoved: false};
        deps.fallback(result); lastResult = result; return result;
      }).finally(() => { inFlight = null; });
      return inFlight;
    }};
}

async function cleanupSelftest() {
  const cases = [];
  const check = (name, operation) => cases.push([name, operation]);
  function fixture(change = {}) {
    const metadataFile = '/evidence/launcher-test.json', profile = '/tmp/codex-cft-owned';
    const state = {pidStates: new Map([[101, 'exited']]), signals: [], writes: new Map(), failed: 0, waits: [],
      files: new Map([[metadataFile, JSON.stringify({pid: 101, profile})],
        ['/evidence/launcher-test.lifecycle.jsonl', '{"event":"started","pid":101}\n'],
        ['/evidence/launcher-test.cleanup.json', '{"status":"PASS","children":[]}']]), stdout: ''};
    const launcher = {pid: 200, exitCode: null, signalCode: null, stdin: {destroyed: false, end() {}}, kill() {}};
    const io = {
      readFile: async file => { if (!state.files.has(file)) throw Object.assign(new Error('missing'), {code: 'ENOENT'}); return state.files.get(file); },
      writeFile: async (file, value) => { state.writes.set(path.basename(file), value); },
      lstat: async () => { throw Object.assign(new Error('absent'), {code: 'ENOENT'}); },
      probe: pid => ({state: state.pidStates.get(pid) ?? 'unknown'}), inspect: () => ({}),
      signal: pid => { state.signals.push(pid); state.pidStates.set(pid, 'exited'); },
      fail: () => { state.failed++; }, fallback: () => {}, waitForExit: async () => state.waits.length ? state.waits.shift() : {code: 0}
    };
    Object.assign(io, change);
    const cleanup = createCleanupController({launcher, binary: '/pinned/CFT', directory: '/evidence', label: 'test', metadataFile,
      sameProfileRestart: true, exited: Promise.resolve({code: 0}), getOutput: () => ({stdout: state.stdout, stderr: 'raw-stderr'}), io});
    cleanup.track({pid: 101, profile}); cleanup.bindProfile(profile, {dev: 1, ino: 2});
    return {state, cleanup, io, launcher};
  }
  check('successful cleanup is idempotent', async () => {
    const {cleanup} = fixture(); const first = await cleanup.stop();
    assert.equal(first.cleanupStatus, 'PASS'); assert(cleanup.stopped); assert.equal(await cleanup.stop(), first);
  });
  check('timeout retains error and permits bounded retry', async () => {
    const {cleanup, state} = fixture(); state.waits = [null, null, {code: 0}];
    cleanup.original(new Error('original-operation'));
    const first = await cleanup.stop(); assert.equal(first.cleanupStatus, 'FAIL'); assert(!cleanup.stopped);
    const next = await cleanup.stop(); assert.equal(next.cleanupStatus, 'PASS'); assert.equal(next.attempts.length, 2);
    assert.equal(next.originalErrors[0].message, 'original-operation'); assert(first.cleanupErrors.some(e => e.stage === 'launcher-exit'));
  });
  check('profile replacement does not block owned process cleanup or permit deletion', async () => {
    const {cleanup, state} = fixture({lstat: async () => ({dev: 9, ino: 9, isDirectory: () => true})});
    state.pidStates.set(101, 'alive'); state.waits = [null, {code: 0}];
    const result = await cleanup.stop(); assert.deepEqual(state.signals, [101]);
    assert.equal(result.profileState, 'replaced-path-retained'); assert.equal(result.cleanupStatus, 'FAIL');
  });
  check('profile absence does not block independently owned child cleanup', async () => {
    const {cleanup, state} = fixture(); state.pidStates.set(101, 'alive'); state.waits = [null, {code: 0}];
    assert.equal((await cleanup.stop()).cleanupStatus, 'PASS'); assert.deepEqual(state.signals, [101]);
  });
  check('ps failure is not child exit and prevents signals', async () => {
    const {cleanup, state} = fixture({inspect: () => { throw new Error('ps unavailable'); }});
    state.pidStates.set(101, 'alive'); state.waits = [null, {code: 0}];
    const result = await cleanup.stop(); assert.deepEqual(state.signals, []); assert.equal(result.pidAliveAfterExit, true);
    assert(result.residual.some(row => row.pid === 101)); assert.equal(result.cleanupStatus, 'FAIL');
  });
  check('EPERM probe is unknown, not exited', async () => {
    const {cleanup, state} = fixture({probe: () => ({state: 'unknown', error: {code: 'EPERM'}})});
    state.waits = [null, {code: 0}]; const result = await cleanup.stop();
    assert.equal(result.pidAliveAfterExit, null); assert.equal(result.residual[0].state, 'unknown'); assert.deepEqual(state.signals, []);
  });
  check('invalid next metadata retains new PID and original pinned cleanup identity', async () => {
    let inspected;
    const {cleanup, state} = fixture({inspect: (pid, parent, binary, profile) => { inspected = {pid, parent, binary, profile}; }});
    const next = {pid: 102, generation: 2, profile: '/foreign', args: []}; cleanup.track(next);
    cleanup.original(new Error('next-metadata-validation')); state.pidStates.set(102, 'alive'); state.waits = [null, {code: 0}];
    const result = await cleanup.stop(); assert.deepEqual(state.signals, [102]);
    assert.equal(inspected.profile, '/tmp/codex-cft-owned'); assert.equal(inspected.binary, '/pinned/CFT');
    assert(result.candidates.some(row => row.pid === 102)); assert.equal(result.originalErrors[0].message, 'next-metadata-validation');
  });
  check('failed metadata publication recovers new PID from owned-child stdout', async () => {
    const {cleanup, state} = fixture(); state.stdout = '{"event":"owned-child","pid":102,"profile":"/tmp/codex-cft-owned"}\n';
    state.pidStates.set(102, 'alive'); state.waits = [null, {code: 0}];
    const result = await cleanup.stop(); assert.deepEqual(state.signals, [102]); assert(result.candidates.some(row => row.pid === 102));
  });
  for (const malformed of [null, '{damaged']) check(`lifecycle ${malformed === null ? 'missing' : 'corrupt'} preserves raw and errors`, async () => {
    const {cleanup, state} = fixture(); const file = '/evidence/launcher-test.lifecycle.jsonl';
    if (malformed === null) state.files.delete(file); else state.files.set(file, malformed);
    cleanup.original(new Error('primary-failure')); const result = await cleanup.stop();
    assert.equal(result.cleanupStatus, 'FAIL'); assert(!cleanup.stopped);
    assert.equal(result.attempts[0].raw.lifecycle, malformed);
    for (const file of ['launcher-test-raw-failure.json', 'launcher-test-summary.json', 'launcher-test-exit.json']) {
      assert(state.writes.has(file)); assert(state.writes.get(file).includes('primary-failure'));
    }
  });
  check('save failure does not skip remaining reports or become PASS', async () => {
    const {cleanup, state, io} = fixture(); const save = io.writeFile;
    // Dependencies are copied at creation; use a closure-controlled injected writer.
    const f = fixture({writeFile: async (file, value) => {
      if (file.endsWith('stdout.txt')) throw new Error('disk fault'); await save(file, value);
    }});
    const result = await f.cleanup.stop(); assert.equal(result.cleanupStatus, 'FAIL'); assert(!f.cleanup.stopped);
    assert(state.writes.has('launcher-test-exit.json')); assert(result.cleanupErrors.some(e => e.message === 'disk fault'));
  });
  check('concurrent stop shares one cleanup attempt', async () => {
    const {cleanup} = fixture(); const one = cleanup.stop(), two = cleanup.stop(); assert.equal(one, two);
    assert.equal((await one).attempts.length, 1);
  });
  check('retry limit does not mark incomplete cleanup stopped', async () => {
    const {cleanup, state} = fixture(); state.files.delete('/evidence/launcher-test.lifecycle.jsonl');
    await cleanup.stop(); await cleanup.stop(); const third = await cleanup.stop();
    assert.equal(await cleanup.stop(), third); assert.equal(third.attempts.length, 3); assert(!cleanup.stopped);
  });
  for (const [name, operation] of cases) { await operation(); console.log(`PASS ${name}`); }
  console.log(JSON.stringify({selftest: 'cleanup-controller', passed: cases.length, browserStarted: false}));
}
if (process.argv.includes('--selftest') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cleanupSelftest();
