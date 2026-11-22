import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {route, startFixture} from './server.mjs';

const {values} = parseArgs({options: {port: {type: 'string', default: '4178'}}});
const port = Number(values.port);
if (!/^\d+$/.test(values.port) || port > 65535) throw new Error('--port 必须是 0 到 65535 之间的整数');

const abort = new AbortController();
const stop = () => abort.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const directory = await mkdtemp(path.join(tmpdir(), 'video-auto-skip-player-'));
let fixture;
try {
  fixture = await startFixture({directory, port, signal: abort.signal});
  if (!abort.signal.aborted) {
    console.log('连播助手本地测试页：' + fixture.origin + route(1));
    console.log('Ctrl+C 停止服务并清理临时视频。');
    await once(abort.signal, 'abort');
  }
} catch (error) {
  if (!abort.signal.aborted) {
    console.error(error.code === 'ENOENT' ? '找不到 ffmpeg，请先安装后再启动。' : error.message);
    process.exitCode = 1;
  }
} finally {
  await fixture?.close();
  await rm(directory, {recursive: true, force: true});
}
