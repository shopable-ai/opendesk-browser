// Optional same-origin HTTP fixture server for real latency/status/POST tests.
// The ordinary "python3 -m http.server" continues to work for GET 200/404.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function respond(req, res, code, contentType, body) {
  const data = Buffer.from(body, 'utf8');
  res.writeHead(code, {
    'Content-Type': contentType,
    'Content-Length': String(data.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
    // No Access-Control-Allow-Origin: cross-origin requests must obey CORS.
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}
function json(req, res, code, value) {
  respond(req, res, code, 'application/json; charset=utf-8', JSON.stringify(value));
}
function fail(req, res, code, message) {
  json(req, res, code, {ok: false, status: code, message});
}

export function createDemoHttpServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1/');
    try {
      if (req.method === 'POST' && url.pathname === '/__test__/echo') {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 16384) {
            fail(req, res, 413, '请求正文上限为 16 KiB');
            return;
          }
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { fail(req, res, 400, 'POST 请求正文必须是有效 JSON'); return; }
        json(req, res, 200, {ok: true, method: 'POST', received: parsed});
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fail(req, res, 405, '仅支持 GET / HEAD 与 /__test__/echo 的 POST');
        return;
      }
      if (url.pathname === '/__test__/delay') {
        const value = Number(url.searchParams.get('ms') ?? '1200');
        if (!Number.isInteger(value) || value < 0 || value > 5000) {
          fail(req, res, 400, 'ms 必须为 0 到 5000 的整数');
          return;
        }
        await new Promise(done => setTimeout(done, value));
        if (!res.destroyed) json(req, res, 200, {ok: true, delayedMs: value});
        return;
      }
      if (url.pathname === '/__test__/status') {
        const code = Number(url.searchParams.get('code'));
        if (![400, 401, 403, 404, 408, 418, 429, 500, 503].includes(code)) {
          fail(req, res, 400, '请使用预设的非 2xx HTTP 状态码');
          return;
        }
        fail(req, res, code, '用于检验真实 HTTP ' + code + ' 响应');
        return;
      }
      if (url.pathname === '/__test__/text') {
        respond(req, res, 200, 'text/plain; charset=utf-8', '这是来自 HTTP 服务器的真实纯文本响应。');
        return;
      }
      const names = {
        '/demo-form.html': ['demo-form.html', 'text/html; charset=utf-8'],
        '/request-sample.json': ['request-sample.json', 'application/json; charset=utf-8']
      };
      const found = names[url.pathname];
      if (!found) {
        fail(req, res, 404, '测试资源不存在');
        return;
      }
      const body = await readFile(new URL(found[0], import.meta.url), 'utf8');
      respond(req, res, 200, found[1], body);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) fail(req, res, 500, '本地测试服务异常');
      console.error('HTTP fixture server error:', error);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = process.argv[2] || '43111';
  const port = Number(arg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Usage: node examples/tasks/http-test-server.mjs [port]');
    process.exitCode = 1;
  } else {
    createDemoHttpServer().listen(port, '127.0.0.1', () => {
      console.log('OpenDesk HTTP test: http://127.0.0.1:' + port + '/demo-form.html');
    });
  }
}
