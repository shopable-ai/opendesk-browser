// Independent loopback oracle. Never makes outbound requests or invents run IDs.
// Importing this module does not listen. CLI: node <this-file> [--out=/new/report.json]
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const origin = 'http://127.0.0.1:43121';
export function createHttpEchoServer() {
  const seen = [], timers = new Set();
  let redirectTargetHits = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, origin);
    // The browser's current target and incidental favicon are not business HTTP.
    if (url.pathname === '/') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><title>ScrapyJS owned HTTP target</title><h1>Owned loopback target</h1>');
      return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const row = {at:new Date().toISOString(),method:req.method,url:req.url,
      peer:{address:req.socket.remoteAddress,port:req.socket.remotePort,localPort:req.socket.localPort},
      rawHeaders:[...req.rawHeaders],headers:{...req.headers},requestBody:'',body:null,
      runId:req.headers['x-opendesk-run-id'] ?? null,
      requestId:req.headers['x-opendesk-request-id'] ?? null,
      closed:false,finished:false,prematureClose:false};
    seen.push(row);
    req.on('data', chunk => { row.requestBody += chunk.toString(); });
    req.on('error', error => { row.requestError = error.message; });
    res.on('error', error => { row.responseError = error.message; });
    res.on('finish', () => { row.finished = true; });
    res.on('close', () => {
      row.closed = true; row.closedAt = new Date().toISOString();
      row.prematureClose = !res.writableFinished;
    });
    const later = (fn, ms) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!res.destroyed) fn(); }, ms);
      timers.add(timer);
      res.once('close', () => { clearTimeout(timer); timers.delete(timer); });
    };
    const send = (status, body, headers = {}) => {
      row.status = status; row.body = body;
      res.writeHead(status, {'Content-Type':'application/json',...headers}); res.end(body);
    };
    if (req.method !== 'GET') { send(405, JSON.stringify({error:'GET only'})); return; }
    if (url.pathname === '/redirect-target') {
      redirectTargetHits++; send(409, JSON.stringify({error:'Redirect target must never be followed'})); return;
    }
    if (url.pathname === '/redirect') {
      send(302, JSON.stringify({error:'Do not follow'}), {Location:origin+'/redirect-target'}); return;
    }
    if (url.pathname === '/early-close') {
      row.status=200; row.firstChunkAt=new Date().toISOString();
      res.writeHead(200, {'Content-Type':'application/json','Content-Length':'128'});
      res.write('{'); later(() => res.destroy(), 100); return;
    }
    if (url.pathname === '/error') { send(500, JSON.stringify({error:'Owned HTTP 500'})); return; }
    if (!['/http-echo','/slow'].includes(url.pathname)) { send(404, '{}'); return; }
    const pages = Number(url.searchParams.get('pages') ?? 1), page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isInteger(pages) || pages < 1 || pages > 3 || !Number.isInteger(page) || page < 1 || page > pages) {
      send(400, JSON.stringify({error:'pages/page must be integers in 1–3'})); return;
    }
    const body = JSON.stringify({data:[{userAgent:req.headers['user-agent'] ?? null,
      accept:req.headers.accept ?? null,clientTag:req.headers['x-client-tag'] ?? null,
      requestId:row.requestId,runId:row.runId}],
      next:page < pages ? origin+'/http-echo?pages='+pages+'&page='+(page+1) : null});
    if (url.pathname === '/slow') {
      row.status = 200; row.body = body; row.firstChunkAt = new Date().toISOString();
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      res.write(body.slice(0, 1));
      later(() => { row.lastChunkAt = new Date().toISOString(); res.end(body.slice(1)); }, 10000);
    } else {
      // Delays only the first page so real clicks can inspect the running UI lock.
      const delay = Number(url.searchParams.get('delay') ?? 0);
      if (!Number.isInteger(delay) || delay < 0 || delay > 5000) { send(400, '{}'); return; }
      if (delay) later(() => send(200, body), delay); else send(200, body);
    }
  });
  return {
    seen,
    snapshot: () => structuredClone({origin,seen,redirectTargetHits}),
    async listen() {
      await new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen({host:'127.0.0.1',port:43121,exclusive:true}, () => {
          server.removeListener('error', fail); ok();
        });
      });
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (!server.listening) return;
      await new Promise((ok, fail) => {
        server.close(error => error ? fail(error) : ok());
        server.closeAllConnections();
      });
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = createHttpEchoServer();
  const output = process.argv.find(x => x.startsWith('--out='))?.slice(6);
  let stopping = false;
  async function stop() {
    if (stopping) return; stopping = true;
    await fixture.close();
    const body = JSON.stringify(fixture.snapshot(), null, 2)+'\n';
    if (output) await writeFile(resolve(output), body, {flag:'wx'});
    else console.log(body);
  }
  await fixture.listen();
  console.log('Owned HTTP echo listening at '+origin+' (exclusive; no outbound client)');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => {
    stop().catch(error => { console.error(error); process.exitCode = 1; });
  });
}
