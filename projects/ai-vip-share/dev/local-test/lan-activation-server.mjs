import http from 'node:http';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { DEVELOPMENT_ACTIVATION_URLS } from '../../src/activation-links.js';

const defaultOrigin = DEVELOPMENT_ACTIVATION_URLS.find(rule =>
  !new URL(rule.origin).hostname.startsWith('127.'))?.origin;

function approvedConfig(origin) {
  const rule = DEVELOPMENT_ACTIVATION_URLS.find(rule => rule.origin === origin);
  if (!rule) throw new Error('Unapproved activation origin');
  const url = new URL(origin);
  const octets = url.hostname.split('.').map(Number);
  const privateIPv4 = isIP(url.hostname) === 4 && (octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  if (!privateIPv4 || url.protocol !== 'http:' || url.username || url.password || !url.port) {
    throw new Error('Activation origin must use an approved private IPv4');
  }
  return { rule, url };
}

const guide = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI VIP Share 激活指引</title><main><header><h1>继续激活 AI VIP Share</h1></header><section aria-labelledby="steps"><h2 id="steps">在已安装的应用中完成</h2><ol><li>打开已安装的 AI VIP Share 侧栏，版本须为 1.4.14 或更高。</li><li>保持此激活链接标签页处于活动状态。</li><li>在侧栏点击「预检激活」，核对权益与接收账号，再点击「确认激活」。</li></ol><p>本页面不会自动打开侧栏或消费激活码。当前为开发入口，安装包需匹配已批准的开发宿主，并连接原本地会员测试服务；此页面不提供会员服务。请勿把激活链接分享给他人。</p></section></main></html>`;
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Content-Type': 'text/html; charset=utf-8'
};

// Tests retain the selected origin's Host contract while binding only ephemeral loopback.
// Call listen() without arguments: callers cannot broaden the binding interface or port.
export function createLanActivationServer({ origin = defaultOrigin,
  testOnlyEphemeralLoopback = false } = {}) {
  const { rule, url } = approvedConfig(origin);
  const server = http.createServer((req, res) => {
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra });
      res.end(body);
    };
    const hostFields = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'host');
    if (hostFields.length !== 1 || req.headers.host !== url.host) return send(403, 'Request rejected');
    const origins = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'origin');
    if (origins.length > 1 || (origins.length && req.headers.origin !== origin)) return send(403, 'Request rejected');
    if (req.method !== 'GET') return send(405, 'Method not allowed', { Allow: 'GET' });
    // Only origin-form requests are accepted; reject absolute targets and encoded path aliases.
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('#')) return send(400, 'Invalid request');
    const [path] = req.url.split('?');
    let target;
    try { target = new URL(req.url, origin); } catch { return send(400, 'Invalid request'); }
    if (path === '/' || path === '/health') {
      if (target.search) return send(400, 'Invalid request');
      return send(200, path === '/' ? guide : JSON.stringify({ app: 'AI VIP Share', protocol: 'http:', origin }),
        path === '/health' ? { 'Content-Type': 'application/json; charset=utf-8' } : {});
    }
    if (path !== rule.path) return send(404, 'Not found');
    const entries = [...target.searchParams];
    if (entries.length !== 1 || entries[0][0] !== rule.parameter || !/^[A-Za-z0-9._-]{6,120}$/.test(entries[0][1])) {
      return send(400, 'Invalid activation link');
    }
    return send(200, guide);
  });
  const listen = server.listen.bind(server);
  server.listen = (...args) => {
    if (args.length > 1 || (args.length && typeof args[0] !== 'function')) throw new Error('Binding overrides are forbidden');
    return listen({ host: testOnlyEphemeralLoopback ? '127.0.0.1' : url.hostname,
      port: testOnlyEphemeralLoopback ? 0 : Number(url.port), exclusive: true }, ...args);
  };
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.timeout = 10_000;
  server.maxHeadersCount = 32;
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--origin')) throw new Error('Invalid arguments');
    const server = createLanActivationServer(args.length ? { origin: args[1] } : {});
    server.on('error', () => { process.stderr.write('Activation landing server unavailable.\n'); process.exitCode = 1; });
    server.listen(() => console.log(`[AI VIP Share activation] ${args[1] || defaultOrigin}/`));
  } catch {
    process.stderr.write('Activation landing server configuration rejected.\n');
    process.exitCode = 1;
  }
}
