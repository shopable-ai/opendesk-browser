#!/usr/bin/env node
// AI VIP Share loopback-only development fixture. NEVER a production Provider or proxy.
// This server does not relay network traffic. Your own proxy listens on 127.0.0.1:7897.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const AI_DOMAINS=Object.freeze([
  'chatgpt.com','openai.com','claude.ai','gemini.google.com','perplexity.ai'
]);
const ACCOUNT_ID='local-fixture-account';
const DISPLAY_NAME='l***@fixture.test';
const MASKED_CODE='****-01';
const DEMO_CODE='DEMO-VIP-01';
const LOCAL_DEV_CODE='LOCAL-DEV-ONLY';
const TEST_HEADER='x-opendesk-local-test';
const MAX_BODY=4096;
const MAX_VERIFY_DELAY_MS=5000;

function readBody(request){
  return new Promise((resolve,reject)=>{
    let size=0,parts=[];
    request.on('data',part=>{
      size+=part.length;
      if(size>MAX_BODY){reject(Object.assign(new Error('request too large'),{status:413}));request.destroy();}
      else parts.push(part);
    });
    request.on('end',()=>{
      try{
        const value=JSON.parse(Buffer.concat(parts).toString('utf8'));
        if(!value||typeof value!=='object'||Array.isArray(value))throw Error('JSON object required');
        resolve(value);
      }catch{reject(Object.assign(new Error('valid JSON object required'),{status:400}));}
    });
    request.on('error',reject);
  });
}
function json(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
function pacFor({proxyPort,proxyKind}){
  const proxy=proxyKind==='socks5'?'SOCKS5':'PROXY';
  return [
    '// AI VIP Share LOCAL PAC FIXTURE ONLY — not the production proxy configuration.',
    'function FindProxyForURL(url, host) {',
    '  host = String(host).toLowerCase().replace(/\\.$/, "");',
    ...AI_DOMAINS.map(d=>`  if (host === ${JSON.stringify(d)} || dnsDomainIs(host, ${JSON.stringify('.'+d)})) return ${JSON.stringify(`${proxy} 127.0.0.1:${proxyPort}`)};`),
    '  return "DIRECT";',
    '}',
  ].join('\n');
}

/** Start with a private in-memory ledger. Keep the server alive across sidebar/reload tests. */
export function createLocalFixture({proxyPort=7897,proxyKind='http',now=Date.now,extensionOrigin=null,
  getMemberState=()=>({account:{state:'bound',id:ACCOUNT_ID,displayNameMasked:DISPLAY_NAME},entitlements:[]})}={}){
  if(!Number.isInteger(proxyPort)||proxyPort<1||proxyPort>65535)throw Error('proxyPort out of range');
  if(!['http','socks5'].includes(proxyKind))throw Error('proxyKind must be http or socks5');
  if(extensionOrigin!==null&&!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin))
    throw Error('extensionOrigin must be one exact isolated Chrome extension origin');
  const previews=new Map(),ledger=new Map(),leases=new Map();
  const pac=pacFor({proxyPort,proxyKind});
  let nextVerifyDelayMs=0,verificationsInFlight=0;
  const getVerificationState=()=>({nextVerifyDelayMs,verificationsInFlight});
  const setNextVerifyDelay=delayMs=>{
    if(!Number.isInteger(delayMs)||delayMs<0||delayMs>MAX_VERIFY_DELAY_MS)
      throw Error('verify delay must be an integer from 0 to 5000 ms');
    nextVerifyDelayMs=delayMs;
    return getVerificationState();
  };
  const member=()=>{
    const state=getMemberState(),bound=state.account.state==='bound';
    const receipts=bound?[...ledger.values()].map(row=>row.receipt)
      .filter(row=>row.accountId===state.account.id&&row.status==='redeemed'):[];
    return {schemaVersion:1,serverNow:now(),account:state.account,
      entitlements:bound?[...state.entitlements,...(receipts.length?receipts[0].grantedEntitlements:[])]:[],
      redemptions:receipts.map(receipt=>({
      redemptionId:receipt.redemptionId,skuTitle:'本地测试配额',
      redeemedAt:receipt.redeemedAt,status:'redeemed',voucherPreviewMasked:MASKED_CODE
    }))};
  };
  const server=http.createServer(async(req,res)=>{
    const path=(req.url||'').split('?')[0];
    // Opt in to one observed isolated extension origin at server startup only.
    // Web origins, opaque sandboxes and every other extension remain refused.
    if(req.headers.origin&&(req.headers.origin!==extensionOrigin||req.headers[TEST_HEADER]!=='1')){
      json(res,403,{error:'E_BROWSER_ORIGIN_DISABLED'});return;
    }
    if(req.method==='GET'&&path==='/health'){
      json(res,200,{ok:true,mode:'LOCAL_FIXTURE_NOT_PRODUCTION',memberPort:server.address()?.port,
        proxyPort,proxyKind,accountId:ACCOUNT_ID,providerHttps:false,
        browserReleaseIntegration:false});return;
    }
    if(req.method==='GET'&&path==='/proxy.pac'){
      res.writeHead(200,{'Content-Type':'application/x-ns-proxy-autoconfig',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(pac);return;
    }
    if(req.headers[TEST_HEADER]!=='1'){
      json(res,403,{error:'E_LOCAL_TEST_HEADER_REQUIRED',help:`send ${TEST_HEADER}: 1 with test API requests`});return;
    }
    if(req.method==='GET'&&path==='/api/member'){json(res,200,member());return;}
    if(req.method==='GET'&&path==='/api/fixture/verify-delay'){
      json(res,200,getVerificationState());return;
    }
    if(req.method!=='POST'){json(res,404,{error:'E_ROUTE_NOT_FOUND'});return;}
    let data;
    try{data=await readBody(req);}catch(e){if(!res.headersSent)json(res,e.status||400,{error:'E_BAD_JSON'});return;}
    if(path==='/api/fixture/verify-delay'){
      try{
        if(Object.keys(data).length!==1)throw Error('delayMs only');
        json(res,200,setNextVerifyDelay(data.delayMs));
      }catch{json(res,400,{error:'E_VERIFY_DELAY_RANGE',maxDelayMs:MAX_VERIFY_DELAY_MS});}
      return;
    }
    const account=getMemberState().account;
    if(['/api/preview','/api/redeem','/api/status'].includes(path)&&account.state!=='bound'){
      json(res,403,{error:'E_ACCOUNT_UNBOUND'});return;
    }
    if(path==='/api/preview'){
      if(data.code!==DEMO_CODE){json(res,422,{error:'E_DEMO_CODE_INVALID'});return;}
      const previewId=randomUUID(),expiresAt=now()+120000;
      previews.set(previewId,{accountId:account.id,expiresAt});
      json(res,200,{previewId,accountId:account.id,skuTitle:'本地测试配额',
        grantSummary:'增加 20 次演示额度',voucherPreviewMasked:MASKED_CODE,expiresAt});return;
    }
    if(path==='/api/redeem'){
      const {previewId,accountId,idempotencyKey}=data;
      const keyOk=typeof idempotencyKey==='string'&&/^[0-9a-f-]{36}$/i.test(idempotencyKey);
      if(accountId!==account.id||!keyOk){json(res,403,{error:'E_ACCOUNT_OR_IDEMPOTENCY'});return;}
      const old=ledger.get(idempotencyKey);
      if(old){
        if(old.previewId!==previewId||old.receipt.accountId!==accountId){json(res,409,{error:'E_IDEMPOTENCY_CONFLICT'});return;}
        json(res,200,old.receipt);return;
      }
      const pre=previews.get(previewId);
      if(!pre||pre.accountId!==accountId||pre.expiresAt<=now()){
        json(res,409,{error:'E_PREVIEW_INVALID'});return;
      }
      const simulated=req.headers['x-fixture-outcome'];
      if(['pending','final-rejected'].includes(simulated)){
        const receipt={status:simulated==='pending'?'pending':'rejected',
          ...(simulated==='final-rejected'?{final:true}:{}),accountId,idempotencyKey};
        ledger.set(idempotencyKey,{previewId,receipt});
        previews.delete(previewId);
        json(res,200,receipt);return;
      }
      const receipt={status:'redeemed',accountId,idempotencyKey,
        redemptionId:randomUUID(),redeemedAt:now(),grantedEntitlements:[{
          type:'quota',status:'active',title:'本地测试配额',remaining:20,total:20,unit:'次'}]};
      ledger.set(idempotencyKey,{previewId,receipt});
      previews.delete(previewId);
      if(req.headers['x-fixture-drop-ack']==='1'){
        // Deliberately emulate a lost receipt AFTER applying a single mock effect.
        json(res,504,{error:'E_SIMULATED_ACK_LOSS',note:'Query /api/status. Do NOT retry POST.'});return;
      }
      json(res,200,receipt);return;
    }
    if(path==='/api/status'){
      if(data.accountId!==account.id||typeof data.idempotencyKey!=='string'){
        json(res,403,{error:'E_ACCOUNT_IDENTITY'});return;
      }
      const existing=ledger.get(data.idempotencyKey);
      // Missing ledger entry is UNKNOWN, never 'rejected + final=true'.
      json(res,200,(existing?.receipt.accountId===account.id?existing.receipt:null)??{status:'unknown',accountId:account.id,
        idempotencyKey:data.idempotencyKey});return;
    }
    if(path==='/api/activate'){
      const localDevelopment=data.code===LOCAL_DEV_CODE;
      if(typeof data.deviceId!=='string'||!data.deviceId||(!localDevelopment&&data.code!==DEMO_CODE)){
        json(res,403,{error:'E_LOCAL_ACTIVATION'});return;
      }
      const leaseId='fixture-'+randomUUID(),expiresAt=now()+3600000;
      // This is contract-shape test data. Reserved .test host is NOT the real 7897 proxy.
      // Only the explicit development code selects the compile-only adapter's fixed endpoint.
      const endpoint=localDevelopment?{scheme:'http',host:'127.0.0.1',port:7897}:
        {scheme:'socks5',host:'proxy.fixture.test',port:proxyPort};
      const lease={leaseId,expiresAt,endpoint};
      leases.set(data.deviceId,{leaseId,lease,localDevelopment});
      json(res,200,lease);return;
    }
    if(path==='/api/verify'){
      const row=leases.get(data.deviceId);
      if(!row||row.leaseId!==data.leaseId){json(res,403,{error:'E_LEASE_NOT_FOUND'});return;}
      let delayMs=row.localDevelopment?nextVerifyDelayMs:0;
      if(req.headers['x-fixture-verify-delay-ms']!==undefined){
        delayMs=Number(req.headers['x-fixture-verify-delay-ms']);
        if(!row.localDevelopment||!Number.isInteger(delayMs)||delayMs<0||delayMs>MAX_VERIFY_DELAY_MS){
          json(res,400,{error:'E_VERIFY_DELAY_RANGE',maxDelayMs:MAX_VERIFY_DELAY_MS});return;
        }
      }
      if(row.localDevelopment)nextVerifyDelayMs=0;
      if(delayMs){
        verificationsInFlight++;
        try{await new Promise(resolve=>setTimeout(resolve,delayMs));}
        finally{verificationsInFlight--;}
      }
      if(res.destroyed)return;
      json(res,200,{active:true,lease:row.lease});return;
    }
    json(res,404,{error:'E_ROUTE_NOT_FOUND'});
  });
  return {server,pac,ledger,previews,leases,setNextVerifyDelay,getVerificationState};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.VIP_TEST_PORT||7898);
  const proxyPort=Number(process.env.LOCAL_PROXY_PORT||7897);
  const proxyKind=process.env.LOCAL_PROXY_KIND||'http';
  const {server}=createLocalFixture({proxyPort,proxyKind,
    extensionOrigin:process.env.VIP_TEST_EXTENSION_ORIGIN||null});
  server.listen(port,'127.0.0.1',()=>{
    const actual=server.address().port;
    console.log(`[local fixture] http://127.0.0.1:${actual}/health`);
    console.log(`[PAC] http://127.0.0.1:${actual}/proxy.pac → ${proxyKind.toUpperCase()} 127.0.0.1:${proxyPort}`);
    console.log('[CAUTION] LOCAL MOCK ONLY; cannot wire HTTP fixture/loopback endpoint into R5.2 production validators.');
    console.log(`[Demo request header] X-OpenDesk-Local-Test: 1; demo code: ${DEMO_CODE}`);
  });
}
