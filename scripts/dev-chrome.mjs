// Interactive-only Chrome for Testing launcher with a reusable *dedicated*
// profile. Never use this process for formal native acceptance or claim PASS.
import {spawn} from 'node:child_process';
import {readFile, readdir, realpath, lstat, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {developmentProfilePath, developmentChromeArgs} from './dev-chrome-config.mjs';

const versions = {
  '138': '138.0.7204.183',
  '155': '155.0.8059.39'
};

async function ensurePrivateDirectory(directory) {
  try {
    await mkdir(directory, {mode:0o700});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const state = await lstat(directory);
  if (state.isSymbolicLink() || !state.isDirectory() ||
      state.uid !== process.getuid() || (state.mode & 0o077) !== 0)
    throw new Error('E_PROFILE_UNSAFE: dedicated development profile directory must be owner-only: ' + directory);
}

async function main() {
  if (process.platform !== 'darwin')
    throw new Error('This project dev launcher currently targets the pinned macOS Chrome for Testing binaries');
  const root = await realpath(process.cwd());
  const home = await realpath(os.homedir());
  const name = process.env.OPENDESK_DEV_PROFILE || 'primary';
  const label = process.env.OPENDESK_CFT_VERSION || '155';
  if (!Object.hasOwn(versions, label))
    throw new Error('OPENDESK_CFT_VERSION must be 138 or 155');
  const version = versions[label];
  const sharedCache = process.env.OPENDESK_CFT_CACHE_ROOT;
  if (sharedCache && !path.isAbsolute(sharedCache))
    throw new Error('OPENDESK_CFT_CACHE_ROOT must be an absolute directory path');
  const cacheRoot = sharedCache ? await realpath(sharedCache) : path.join(root, 'tests/.cache/m5-browsers');
  const executable = path.join(cacheRoot, version,
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const extension = path.join(root, 'dist/development');
  const profile = developmentProfilePath({home, workspace:root, name});
  await Promise.all([
    realpath(executable).catch(() => { throw new Error('Missing pinned CFT binary: ' + executable); }),
    readFile(path.join(extension, 'manifest.json'), 'utf8').then(content => {
      if (JSON.parse(content).name !== 'OpenDesk Browser')
        throw new Error('dist/development is not an OpenDesk Browser extension');
    }).catch(error => { throw new Error('Build the current worktree with npm run build:dev first: ' + error.message); })
  ]);

  const appRoot = path.join(home, '.opendesk-browser');
  const profilesRoot = path.join(appRoot, 'dev-profiles');
  for (const directory of [appRoot, profilesRoot, profile])
    await ensurePrivateDirectory(directory);
  const marker = path.join(profile, '.opendesk-dev-profile.json');
  let existing;
  try { existing = JSON.parse(await readFile(marker, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if ((await readdir(profile)).length)
      throw new Error('E_PROFILE_UNOWNED: existing nonempty profile lacks the OpenDesk developer marker; refusing reuse');
    const record = {schemaVersion:1,kind:'opendesk-interactive-development',workspace:root,name};
    await writeFile(marker, JSON.stringify(record, null, 2) + '\n', {flag:'wx',mode:0o600});
    existing = record;
  }
  if (existing.schemaVersion !== 1 || existing.kind !== 'opendesk-interactive-development' ||
      existing.workspace !== root || existing.name !== name)
    throw new Error('E_PROFILE_IDENTITY: profile belongs to another workspace or use');

  const flags = developmentChromeArgs({profile,extension});
  console.log('OpenDesk interactive development Chrome — permissions are never auto-granted.');
  console.log('Pinned CFT: ' + version);
  console.log('Workspace extension: ' + extension);
  console.log('Reusable dedicated profile: ' + profile);
  console.log('First use: approve websites in Sidebar > 开发 > 网站权限; enable Allow User Scripts in extension details.');
  console.log('Reuse this command for routine editing. Official native acceptance must use its separate fresh-profile launcher.');
  const child = spawn(executable, flags, {cwd:root, stdio:'inherit'});
  let stopping = false;
  function forward(signal) {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  }
  const sigint = () => forward('SIGINT'), sigterm = () => forward('SIGTERM');
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);
  try {
    const outcome = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({code,signal}));
    });
    process.exitCode = outcome.code === 0 ? 0 : 1;
    if (process.exitCode)
      console.error('CFT exited unexpectedly; profile kept for diagnosis:', outcome);
  } finally {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }
}
main().catch(error => {
  console.error('OpenDesk interactive Chrome failed:', error);
  process.exitCode = 1;
});
