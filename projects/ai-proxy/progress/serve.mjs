// Read-only local delivery page. The original source Demo remains its own server.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const evidence = 'docs/framework/evidence/single-app-surfaces-20261109/';
const port = Number(process.env.OPENDESK_PROGRESS_PORT || 43264);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid OPENDESK_PROGRESS_PORT');
const files = new Map([
  ['/', ['projects/ai-proxy/progress/index.html', 'text/html']],
  ['/style.css', ['projects/ai-proxy/progress/style.css', 'text/css']],
  ['/ai-proxy', ['projects/ai-proxy/preview/preview.html', 'text/html']],
  ['/report', ['projects/ai-proxy/ACCEPTANCE-SINGLE-APP-SURFACES.zh-CN.md', 'text/plain']],
  ['/guide', ['projects/ai-proxy/progress/README.zh-CN.md', 'text/plain']],
  ['/ci', ['projects/ai-proxy/progress/CI.zh-CN.md', 'text/plain']],
  ['/downloads/ai-proxy.opendesk-tool.json', ['projects/ai-proxy/ai-proxy.opendesk-tool.json', 'application/json']],
  ['/downloads/header-actions-demo.opendesk-tool.json', ['examples/sidebar-tools/header-actions-demo/header-actions-demo.opendesk-tool.json', 'application/json']],
  ['/evidence/report', [evidence + 'report.zh-CN.md', 'text/plain']],
  ['/evidence/native-result.json', [evidence + 'native-result.json', 'application/json']],
  ['/evidence/side-panel.png', [evidence + 'native-ai-proxy-sidebar.png', 'image/png']],
  ['/evidence/pc.png', [evidence + 'native-ai-proxy-pc-profiles.png', 'image/png']],
  ['/evidence/applied.png', [evidence + 'release-039-applied.png', 'image/png']],
]);
let demo, demoUrl = null, demoError = '源码 Demo 正在启动，请稍后重试。';
let stopping = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {Allow: 'GET, HEAD'}); res.end(); return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({mode: 'LOCAL_STATUS_ONLY', pid: process.pid, demoUrl, demoError: demoUrl ? null : demoError}));
    return;
  }
  if (url.pathname === '/demo') {
    if (demoUrl) { res.writeHead(302, {Location: demoUrl + url.search}); res.end(); }
    else { res.writeHead(503, {'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '3'}); res.end(demoError); }
    return;
  }
  const file = files.get(url.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(resolve(repo, file[0]));
    if (url.pathname === '/') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (url.pathname.startsWith('/downloads/')) res.setHeader('Content-Disposition', `attachment; filename="${url.pathname.split('/').pop()}"`);
    res.writeHead(200, {'Content-Type': file[1] + (file[1].startsWith('text/') || file[1] === 'application/json' ? '; charset=utf-8' : '')});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('本机资料不可用；请查看已提交的 /report。缺少原始证据不表示验收通过。');
  }
});
server.on('error', error => { console.error(error.message); shutdown(1); });
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({url: `http://127.0.0.1:${server.address().port}/`, pid: process.pid, mode: 'LOCAL_STATUS_ONLY', owner: 'ai-proxy/progress'}));
  demo = spawn(process.execPath, [resolve(repo, 'examples/sidebar-tools/header-actions-demo/preview/serve.mjs')], {cwd: repo, stdio: ['ignore', 'pipe', 'pipe']});
  let pending = '';
  const timeout = setTimeout(() => { demoError = '源码 Demo 启动超时；状态页与视觉参考仍可查看。重启本启动器可重试。'; demo.kill('SIGTERM'); }, 30000);
  demo.stdout.setEncoding('utf8');
  demo.stdout.on('data', chunk => {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      try {
        const receipt = JSON.parse(line);
        if (receipt.mode === 'SOURCE_FIXTURE_ONLY' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(receipt.url)) {
          demoUrl = receipt.url; demoError = null; clearTimeout(timeout); console.log(line);
        }
      } catch { /* Non-receipt output is not a URL. */ }
    }
  });
  demo.stderr.pipe(process.stderr);
  demo.on('error', error => { clearTimeout(timeout); demoError = `源码 Demo 启动失败：${error.message}`; });
  demo.on('exit', code => {
    clearTimeout(timeout); demoUrl = null;
    if (!stopping && !demoError) demoError = `源码 Demo 已退出（${code}）；重启本启动器可重试。状态页仍可查看。`;
  });
});
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  demo?.kill('SIGTERM');
  server.close(() => process.exit(code));
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
