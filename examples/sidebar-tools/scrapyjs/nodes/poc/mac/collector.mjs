// One-owner, foreground-only LAN evidence receiver. Not a broker or proxy.
import {createServer} from 'node:https';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {validateAllowedOrigin,validateReport,isPrivateLanAddress,MAX_REPORT_BYTES} from './contract.mjs';

const [cert,key,origin] = [process.env.SCRAPYJS_POC_CERT,process.env.SCRAPYJS_POC_KEY,
  process.env.SCRAPYJS_TEST_ORIGIN];
if (!cert || !key || !origin) {
  process.stderr.write('Set SCRAPYJS_POC_CERT, SCRAPYJS_POC_KEY, SCRAPYJS_TEST_ORIGIN.\n');
  process.exit(2);
}
validateAllowedOrigin(origin);
const port = Number(process.env.SCRAPYJS_POC_PORT || 4443);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port');
const outDir = resolve(process.env.SCRAPYJS_POC_EVIDENCE || './.private-node-evidence');
const pairingToken = randomBytes(32).toString('hex');
const runPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function respond(res,status,body) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
function equalToken(header) {
  const supplied = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const actual=Buffer.from(supplied,'hex'), expected=Buffer.from(pairingToken,'hex');
  return timingSafeEqual(actual,expected);
}
async function bodyAsJson(req) {
  const chunks=[]; let total=0;
  for await (const chunk of req) {
    total+=chunk.length;
    if (total > MAX_REPORT_BYTES) throw Object.assign(Error('Report too large'),{status:413});
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw Object.assign(Error('Invalid JSON'),{status:400});}
}
const server = createServer({cert:await readFile(cert),key:await readFile(key),
  minVersion:'TLSv1.2'},async (req,res)=>{
  try {
    if (!isPrivateLanAddress(req.socket.remoteAddress)) return respond(res,403,{error:'E_NOT_LAN'});
    if (!equalToken(req.headers.authorization)) return respond(res,401,{error:'E_PAIRING_REQUIRED'});
    const url=new URL(req.url,'https://localhost');
    if (url.search || url.hash) return respond(res,400,{error:'E_PATH'});
    if (req.method === 'GET' && url.pathname === '/v1/ping')
      return respond(res,200,{schema:'scrapyjs.poc.ping.v1',network:'wifi-lan',origin});
    if (req.method === 'POST' && url.pathname === '/v1/evidence') {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
        return respond(res,415,{error:'E_CONTENT_TYPE'});
      const report=await bodyAsJson(req);
      const summary=validateReport(report,origin);
      const peer=String(req.socket.remoteAddress).replace(/^::ffff:/,'');
      if (peer!==report.wifiLanIp) return respond(res,422,{error:'E_WIFI_PEER_MISMATCH'});
      const file=join(outDir,summary.runId+'.json');
      const saved={receivedAt:new Date().toISOString(),lanRemoteAddress:req.socket.remoteAddress,
        evidence:summary,report};
      await mkdir(outDir,{recursive:true,mode:0o700});
      try {
        await writeFile(file,JSON.stringify(saved,null,2),{flag:'wx',mode:0o600});
        return respond(res,201,{saved:true,runId:summary.runId,sha256:summary.sha256});
      } catch(e) {
        if(e.code!=='EEXIST')throw e;
        const existing=JSON.parse(await readFile(file,'utf8'));
        if(existing.evidence?.sha256===summary.sha256)
          return respond(res,200,{saved:true,existing:true,runId:summary.runId,sha256:summary.sha256});
        return respond(res,409,{error:'E_IDEMPOTENCY_CONFLICT'});
      }
    }
    const id=url.pathname.startsWith('/v1/evidence/')?url.pathname.slice('/v1/evidence/'.length):'';
    if (req.method === 'GET' && runPattern.test(id)) {
      let file;
      try {file=await readFile(join(outDir,id+'.json'),'utf8');}
      catch(e){if(e.code==='ENOENT')return respond(res,404,{error:'E_NOT_FOUND'});throw e;}
      return respond(res,200,JSON.parse(file));
    }
    return respond(res,404,{error:'E_NOT_FOUND'});
  } catch(e) {
    // No credentials, page body, or IP values are included in error responses.
    const status=e.status || (String(e.code||'').startsWith('E_')?422:500);
    return respond(res,status,{error:e.code||'E_SERVER',message:status===500?'Internal error':e.message});
  }
});
server.requestTimeout=15000;
server.headersTimeout=12000;
server.listen(port,'0.0.0.0',()=>{
  process.stdout.write('Private LAN evidence collector listening on port '+port+'\n');
  process.stdout.write('Pairing token (do not commit or share): '+pairingToken+'\n');
  process.stdout.write('Allowed test origin: '+origin+'\n');
  process.stdout.write('Stored privately in '+outDir+'\n');
});
process.on('SIGINT',()=>server.close());
process.on('SIGTERM',()=>server.close());
