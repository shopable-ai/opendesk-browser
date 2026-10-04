import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, readdir, realpath, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

export const LAUNCHER = '/Users/shopme/.codex/browser-testing/launch.py';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// The wrapper owns every Chrome process and its fresh profile. Inspectors only
// disconnect CDP sockets; termination signals go to this still-running wrapper.
export async function launchChrome({root, binary, extension, headed, directory, label}) {
  const launcherSource = await readFile(LAUNCHER), startedAt = Date.now();
  const temporaryRoot = await realpath(os.tmpdir()), existing = new Set(await readdir(temporaryRoot));
  const metadataFile = path.join(directory, `launcher-${label}.json`);
  const argv = [LAUNCHER, '--executable', binary, '--report', metadataFile, '--remote-debugging-port=0',
    `--load-extension=${extension}`, `--disable-extensions-except=${extension}`, ...(headed ? [] : ['--headless=new']), 'about:blank'];
  const launcher = spawn('/usr/bin/python3', argv, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '', metadata, stopped = false;
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
  async function stop() {
    if (stopped) return; stopped = true; await copyLog();
    if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill('SIGTERM');
    let exit = await Promise.race([exited, sleep(8000).then(() => null)]);
    if (!exit && metadata?.pid) {
      // Revalidate ownership at the instant of fallback; never kill a reused PID.
      let processLine;
      try { processLine = execFileSync('/bin/ps', ['-p', String(metadata.pid), '-o', 'pid=,ppid=,command='], {cwd: root, encoding: 'utf8'}).trim(); }
      catch (error) { if (error.status !== 1) throw error; }
      if (processLine) {
        assert.equal(Number(processLine.split(/\s+/)[1]), launcher.pid, 'Fallback PID must still belong to this live launcher');
        assert(processLine.includes(binary) && processLine.includes(`--user-data-dir=${metadata.profile}`));
        try { process.kill(metadata.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      exit = await Promise.race([exited, sleep(12000).then(() => null)]);
    }
    assert(exit, 'Launcher did not complete its owned browser lifecycle');
    await writeFile(path.join(directory, `launcher-${label}-stdout.txt`), stdout);
    await writeFile(path.join(directory, `launcher-${label}-stderr.txt`), stderr);
    const pidAliveAfterExit = (() => { try { process.kill(metadata?.pid, 0); return true; } catch { return false; } })();
    let profileRemoved = false;
    if (metadata?.profile) try { await stat(metadata.profile); } catch (error) { if (error.code === 'ENOENT') profileRemoved = true; else throw error; }
    const result = {exit, pidAliveAfterExit, profileRemoved, cleanupOwner: LAUNCHER};
    await writeFile(path.join(directory, `launcher-${label}-exit.json`), JSON.stringify(result, null, 2) + '\n');
    assert(!pidAliveAfterExit && profileRemoved, 'Launcher must stop its Chrome and remove only its profile');
    return result;
  }
  try {
    for (let count = 0; count < 400; count++) {
      if (spawnError) throw spawnError;
      try { metadata = JSON.parse(await readFile(metadataFile, 'utf8')); break; } catch {}
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
    const evidence = {...metadata, launcherPid: launcher.pid, python: '/usr/bin/python3', launcher: LAUNCHER,
      launcherSha256: hash(launcherSource), launcherArgs: argv, actualMainProcess: nativeProcess,
      freshProfileObserved: {path: profile, birthtimeMs: profileInfo.birthtimeMs, previouslyPresent: false, mode: '0700'}, endpoint};
    await writeFile(path.join(directory, `launcher-${label}-verified.json`), JSON.stringify(evidence, null, 2) + '\n');
    return {metadata: evidence, endpoint, stop, copyLog};
  } catch (error) { try { await stop(); } catch {} throw error; }
}
