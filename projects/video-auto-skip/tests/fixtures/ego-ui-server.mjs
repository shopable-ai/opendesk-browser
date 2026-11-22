import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

const candidate = await readFile(process.argv[2]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const {id, version, html, css, js} = JSON.parse(candidate);
if (id !== 'video-auto-skip' || ![html, css, js].every(value => typeof value === 'string')) {
  throw new Error('Expected a video-auto-skip candidate with HTML, CSS and JS');
}
const identity = {id, version, sha256: sha256(candidate), assets: {html: sha256(html), css: sha256(css), js: sha256(js)}};
const mock = await readFile(new URL('./ego-ui-sdk.js', import.meta.url));
const routes = new Map([
  ['/', ['text/html', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>连播助手 · 正式 UI 测试壳</title><link rel="stylesheet" href="/tool.css">' +
    '<aside style="margin:12px auto;width:min(360px,100%)"><b>连播助手 · 正式 UI 测试壳</b>' +
    '<p>模拟 SDK · 未安装扩展 · 未实际播放</p><button id="source-length">换到 48:00 线路</button></aside>' +
    '<div id="tool" style="margin:auto;width:min(360px,100%)"></div>' +
    '<script type="module" src="/sdk.js"></script></html>']],
  ['/identity.json', ['application/json', JSON.stringify(identity)]],
  ['/tool.html', ['text/html', html]],
  ['/tool.css', ['text/css', css]],
  ['/tool.js', ['text/javascript', js]],
  ['/sdk.js', ['text/javascript', mock]],
]);
const server = createServer(({url, method}, res) => {
  const route = method === 'GET' && routes.get(url.split('?')[0]);
  if (!route) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type': route[0] + '; charset=utf-8', 'Cache-Control': 'no-store'}).end(route[1]);
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({url: 'http://127.0.0.1:' + server.address().port, ...identity})));
