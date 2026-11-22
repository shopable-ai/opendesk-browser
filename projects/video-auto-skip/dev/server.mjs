import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startFixture, prefix} from '../tests/fixtures/server.mjs';

const directory = await mkdtemp(join(tmpdir(), 'video-auto-skip-dev-'));
let fixture;
try {
  const template = await readFile(new URL('./test-page.html', import.meta.url), 'utf8');
  const clipNames = ['one', 'two', 'three'];
  fixture = await startFixture({
    directory,
    port: 8765,
    durations: {one: 60, two: 60, three: 75},
    renderPage: (_origin, episode, line) => template
      .replaceAll('__EPISODE__', String(episode))
      .replaceAll('__CLIP__', clipNames[episode - 1])
      .replaceAll('__LINE__', line),
  });
  console.log('连播助手本地真实视频测试页：' + fixture.origin + prefix + '/ep-1');
  console.log('使用已安装的连播助手侧栏保存规则；Ctrl+C 停止并删除本次临时媒体。');
} catch (error) {
  await rm(directory, {recursive: true, force: true});
  throw error;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { await fixture.close(); }
  finally { await rm(directory, {recursive: true, force: true}); }
}
process.once('SIGINT', () => { void close().catch(console.error); });
process.once('SIGTERM', () => { void close().catch(console.error); });
