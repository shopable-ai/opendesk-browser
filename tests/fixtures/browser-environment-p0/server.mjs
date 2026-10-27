import http from 'node:http';
import {mkdir, writeFile, appendFile, readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function createServer({evidenceDir, extensionId} = {}) {
  const evidenceOrigin = extensionId ? `chrome-extension://${extensionId}` : null;
  const evidenceToken = randomUUID();
  let writes = Promise.resolve();
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:43128');
    const origin = req.headers.origin;
    if (req.headers.host !== '127.0.0.1:43128') { res.writeHead(403).end(); return; }
    if (origin && origin !== 'http://127.0.0.1:43128' && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { res.writeHead(403).end(); return; }
    if (u.pathname.startsWith('/browser-env-p0/evidence') && (!evidenceOrigin || origin !== evidenceOrigin)) { res.writeHead(403).end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-CH', 'Sec-CH-UA-Platform-Version, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Full-Version-List');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-P0-Evidence-Token'); res.writeHead(204).end(); return;
    }
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => ['user-agent', 'accept-language'].includes(k) || k.startsWith('sec-ch-ua')));
    try {
      if (req.method === 'POST' && u.pathname === '/browser-env-p0/evidence-session') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({token: evidenceToken})); return;
      }
      if (req.method === 'GET' && u.pathname === '/browser-env-p0/echo') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({observedAt: new Date().toISOString(), headers})); return;
      }
      if (req.method === 'POST' && /^\/browser-env-p0\/evidence\/(before|after|stop|bind|error|safe-close)$/.test(u.pathname) && evidenceDir) {
        if (req.headers['x-p0-evidence-token'] !== evidenceToken) { res.writeHead(403).end(); return; }
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024 * 1024) { res.writeHead(413).end(); return; } chunks.push(chunk); }
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const name = u.pathname.split('/').at(-1);
        if (!/^[a-f0-9-]{36}$/.test(payload.actionId || '') || payload.trigger?.extensionId !== extensionId || payload.trigger?.href !== evidenceOrigin + '/panel.html') { res.writeHead(400).end(); return; }
        await mkdir(evidenceDir, {recursive: true});
        const write = writes.then(async () => {
          // A retry after a server restart must not duplicate a saved action.
          const previous = await readFile(resolve(evidenceDir, 'actions.jsonl'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
          const rows = previous.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
          let row = rows.find(item => item.actionId === payload.actionId);
          if (row && row.action !== name) throw new Error('ACTION_ID_CONFLICT');
          if (!row) {
            row = {...payload, action: name, collector: {origin, receivedAt: new Date().toISOString()}};
            await appendFile(resolve(evidenceDir, 'actions.jsonl'), JSON.stringify(row) + '\n'); rows.push(row);
          }
          // Repair a failed derived-file write on retry, while preventing an
          // old retry from overwriting a newer result for the same action.
          if (rows.findLast(item => item.action === name).actionId === row.actionId) {
            const {action, collector, ...snapshot} = row;
            await writeFile(resolve(evidenceDir, name + '.json'), JSON.stringify(snapshot, null, 2) + '\n');
          }
        });
        writes = write.catch(() => {}); await write;
        res.setHeader('Content-Type', 'application/json'); res.end('{"saved":true}'); return;
      }
      if (req.method === 'GET' && u.pathname === '/browser-env-p0/') {
        const role = u.searchParams.get('role') === 'control' ? 'Control' : 'Target';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Environment P0 · ${role}</title><style>body{font:16px system-ui;padding:25px;background:#f5f7fb;color:#152238}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border:1px solid #bbc8d8}h1{font-size:24px}</style><h1>Browser Environment P0 · ${role}</h1><p>仅本地 HTTP 观测；此页面不覆写 navigator 或 Intl。</p><pre id="environment">读取中</pre><script>async function read(){let highEntropy=null;try{highEntropy=await navigator.userAgentData?.getHighEntropyValues(['architecture','bitness','platformVersion','fullVersionList']);}catch{}const http=await(await fetch('/browser-env-p0/echo?nonce='+crypto.randomUUID(),{cache:'no-store'})).json();document.querySelector('#environment').textContent=JSON.stringify({role:'${role}',js:{userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,languages:[...navigator.languages],userAgentData:navigator.userAgentData?{...navigator.userAgentData.toJSON(),highEntropy}:null,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,viewport:{innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio}},http},null,2)}read();</script></html>`); return;
      }
      res.writeHead(404).end('Not found');
    } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500); res.end('Fixture error'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const ix = process.argv.indexOf('--evidence');
  const evidenceDir = ix >= 0 ? resolve(process.argv[ix + 1]) : undefined;
  const extensionIx = process.argv.indexOf('--extension-id');
  const extensionId = extensionIx >= 0 ? process.argv[extensionIx + 1] : undefined;
  if (evidenceDir && !/^[a-p]{32}$/.test(extensionId || '')) throw new Error('--evidence requires --extension-id from the isolated Chrome extension details');
  const server = createServer({evidenceDir, extensionId});
  server.on('error', error => { console.error(error); process.exitCode = 1; });
  server.listen(43128, '127.0.0.1', () => console.log(JSON.stringify({pid: process.pid, url: 'http://127.0.0.1:43128/browser-env-p0/', evidenceDir})));
}
