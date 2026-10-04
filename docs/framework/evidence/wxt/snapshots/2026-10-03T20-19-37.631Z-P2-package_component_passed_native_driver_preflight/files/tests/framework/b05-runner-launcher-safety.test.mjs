import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwnedChromeProcess} from './b05-product-acceptance-20261003.mjs';

const owner = {pid: 123, launcherPid: 456,
  executable: '/test/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  profile: '/tmp/codex-cft-owned'};
const processRow = (change = {}) => {
  const value = {...owner, ...change};
  return {stdout: `${value.pid} ${value.launcherPid} ${value.executable} --use-mock-keychain --user-data-dir=${value.profile} --remote-debugging-port=0\n`};
};
test('fresh owned process observation permits fallback cleanup', () => {
  assert.equal(isOwnedChromeProcess(processRow(), owner), true);
});
for (const [name, change] of Object.entries({
  reusedPid: {pid: 124}, foreignParent: {launcherPid: 457},
  foreignExecutable: {executable: '/other/Google Chrome for Testing'},
  foreignProfile: {profile: '/tmp/codex-cft-owned-other'}
})) test(`fallback refuses ${name}`, () => {
  assert.equal(isOwnedChromeProcess(processRow(change), owner), false);
});
test('fallback refuses absent process and missing mock keychain', () => {
  assert.equal(isOwnedChromeProcess({stdout: ''}, owner), false);
  assert.equal(isOwnedChromeProcess({stdout: processRow().stdout.replace('--use-mock-keychain', '')}, owner), false);
});
