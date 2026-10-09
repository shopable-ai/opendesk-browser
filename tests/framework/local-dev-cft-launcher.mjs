import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';

export const DEFAULT_MACOS_LAUNCHER = '/Users/shopme/.codex/browser-testing/launch.py';

const PYTHON = '/usr/bin/python3';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitFor(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await pause(100);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + last.message : ''));
}

async function waitForExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {code: child.exitCode, signal: child.signalCode, alreadyExited: true};
  }
  return await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal});
    });
  });
}

function readDevToolsPort(profile) {
  const lines = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
  return lines.length >= 2 && /^\d+$/.test(lines[0]) && lines[1].startsWith('/devtools/browser/') ? lines : null;
}

function directLaunch({binary, argv, profile, out}) {
  const chrome = spawn(binary, argv, {stdio: ['ignore', 'ignore', 'pipe']});
  chrome.stderr.on('data', bytes => fs.appendFileSync(path.join(out, 'chrome-stderr.log'), bytes));
  return waitFor(() => fs.existsSync(path.join(profile, 'DevToolsActivePort')) && readDevToolsPort(profile), 'Chrome DevTools')
    .then(lines => ({
      chrome,
      profile,
      lines,
      launch: {kind: 'direct', executable: binary, argv, pid: chrome.pid}
    }));
}

export async function launchLocalDevChrome({root, out, binary, argv, profile}) {
  if (process.platform !== 'darwin') return await directLaunch({binary, argv, profile, out});

  const launcher = process.env.OPENDESK_DEV_CFT_LAUNCHER || DEFAULT_MACOS_LAUNCHER;
  if (!fs.existsSync(launcher)) throw new Error('macOS CFT launcher is missing: ' + launcher);

  const reportFile = path.join(out, 'chrome-launcher-report.json');
  const launcherArgs = [
    launcher,
    '--executable', binary,
    '--report', reportFile,
    ...argv.filter(arg => arg !== '--use-mock-keychain' && arg !== '--password-store=basic' && !arg.startsWith('--user-data-dir='))
  ];
  const launcherProcess = spawn(PYTHON, launcherArgs, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  launcherProcess.stdout.on('data', bytes => fs.appendFileSync(path.join(out, 'chrome-launcher-stdout.log'), bytes));
  launcherProcess.stderr.on('data', bytes => fs.appendFileSync(path.join(out, 'chrome-launcher-stderr.log'), bytes));

  const metadata = await waitFor(() => {
    if (launcherProcess.exitCode !== null) throw new Error('launcher exited before report');
    if (!fs.existsSync(reportFile)) return null;
    return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  }, 'macOS launcher report');

  assert.equal(metadata.executable, fs.realpathSync(binary), 'launcher must keep the requested CFT binary');
  assert(Number.isSafeInteger(metadata.pid) && metadata.pid > 0, 'launcher report must contain the real Chrome PID');
  assert(typeof metadata.profile === 'string' && metadata.profile, 'launcher report must contain the real Chrome profile');
  assert(Array.isArray(metadata.args), 'launcher report must contain real Chrome argv');
  assert(metadata.args.includes('--use-mock-keychain'), 'launcher must inject mock keychain mode');
  assert(metadata.args.some(arg => arg === '--remote-debugging-port=0'), 'launcher must preserve remote debugging');
  assert(metadata.args.some(arg => arg.startsWith('--user-data-dir=' + metadata.profile)), 'launcher must own the profile directory');
  assert(metadata.args.some(arg => arg.startsWith('--load-extension=')), 'launcher must preserve extension loading');
  assert(pidAlive(launcherProcess.pid), 'launcher process must stay alive');
  assert(pidAlive(metadata.pid), 'launcher-owned Chrome process must stay alive');

  const ps = execFileSync('/bin/ps', ['-p', String(metadata.pid), '-ww', '-o', 'pid=,ppid=,command='], {cwd: root, encoding: 'utf8'});
  fs.writeFileSync(path.join(out, 'chrome-launcher-main-ps.txt'), ps);
  const match = ps.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
  assert(match, 'real Chrome main process must be visible to ps');
  assert.equal(Number(match[1]), metadata.pid);
  assert.equal(Number(match[2]), launcherProcess.pid, 'real Chrome main process must remain child of live launcher');
  for (const flag of ['--use-mock-keychain', '--remote-debugging-port=0', '--load-extension=']) {
    assert(match[3].includes(flag), 'real Chrome argv missing ' + flag);
  }

  const lines = await waitFor(() => fs.existsSync(path.join(metadata.profile, 'DevToolsActivePort')) && readDevToolsPort(metadata.profile), 'launcher Chrome DevTools');
  const launch = {
    kind: 'macos-launcher',
    executable: binary,
    argv: metadata.args,
    pid: metadata.pid,
    profile: metadata.profile,
    launcher,
    launcherPid: launcherProcess.pid,
    launcherArgs,
    reportFile,
    actualMainProcess: ps
  };
  fs.writeFileSync(path.join(out, 'chrome-launcher-verified.json'), JSON.stringify(launch, null, 2) + '\n');

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return launch.cleanup;
    cleaned = true;
    let exit = await waitForExit(launcherProcess, 5000);
    if (!exit && pidAlive(launcherProcess.pid)) {
      launcherProcess.kill('SIGTERM');
      exit = await waitForExit(launcherProcess, 5000);
    }
    if (!exit && pidAlive(launcherProcess.pid)) {
      launcherProcess.kill('SIGKILL');
      exit = await waitForExit(launcherProcess, 5000);
    }
    if (pidAlive(metadata.pid)) {
      try { process.kill(metadata.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const profileRemoved = !fs.existsSync(metadata.profile);
    launch.cleanup = {
      at: new Date().toISOString(),
      exit,
      chromePidAlive: pidAlive(metadata.pid),
      launcherPidAlive: pidAlive(launcherProcess.pid),
      profile: metadata.profile,
      profileRemoved
    };
    fs.writeFileSync(path.join(out, 'chrome-launcher-cleanup.json'), JSON.stringify(launch.cleanup, null, 2) + '\n');
    return launch.cleanup;
  };

  const chrome = {
    pid: metadata.pid,
    get exitCode() { return launcherProcess.exitCode; },
    kill(signal) { return launcherProcess.kill(signal); },
    cleanup
  };
  return {chrome, profile: metadata.profile, lines, launch};
}
