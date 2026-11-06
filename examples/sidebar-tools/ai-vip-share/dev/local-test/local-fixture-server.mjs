#!/usr/bin/env node
// AI VIP Share loopback-only development fixture. NEVER a production Provider or proxy.
// This server does not relay network traffic. Your own proxy listens on 127.0.0.1:7897.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createServerCookieSource,checkServerCookieSource,cookieSourceError} from './server-cookie-source.mjs';
import {sendVipSessionPage} from './vip-session-page.mjs';

const AI_DOMAINS=Object.freeze([
  'chatgpt.com','openai.com','claude.ai','anthropic.com','gemini.google.com',
  'generativelanguage.googleapis.com','perplexity.ai'
]);
const ACCOUNT_ID='local-fixture-account';
const DISPLAY_NAME='l***@fixture.test';
const DEMO_CODE='DEMO-VIP-01';
const DEMO_ASSIGNMENTS=Object.freeze({'DEMO-VIP-01':'shared-a','DEMO-VIP-02':'shared-b'});
const maskedCode=code=>'****-'+code.slice(-2);
const LOCAL_DEV_CODE='LOCAL-DEV-ONLY';
const TEST_HEADER='x-opendesk-local-test';
const MAX_BODY=4096;
const MAX_VERIFY_DELAY_MS=5000;
const SESSION_COOKIE_NAME='opendesk_fixture_session';
const CONTEXT_COOKIE_NAME='opendesk_fixture_context';
const SESSION_TARGET='http://127.0.0.1:7898/session/';
const SHARED_ACCOUNTS=Object.freeze([
  {id:'shared-a',label:'公司共享账号 A',displayNameMasked:'a***@fixture.test'},
  {id:'shared-b',label:'公司共享账号 B',displayNameMasked:'b***@fixture.test'}
]);

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
export function createLocalFixture({sessionTarget=SESSION_TARGET,cookieSource=null,proxyPort=7897,proxyKind='http',now=Date.now,extensionOrigin=null,
  voucherAssignments=DEMO_ASSIGNMENTS,sessionLifetimeMs=3600000,
  getMemberState=()=>({account:{state:'bound',id:ACCOUNT_ID,displayNameMasked:DISPLAY_NAME},entitlements:[]}),
  // Test-only revocation policy, checked for both delivery and every target-page visit.
  isSharedAccessAllowed=()=>true}={}){
  if(![SESSION_TARGET,'http://127.0.0.1:7903/session/'].includes(sessionTarget))
    throw Error('sessionTarget must be an exact supported loopback session URL');
  if(!Number.isInteger(proxyPort)||proxyPort<1||proxyPort>65535)throw Error('proxyPort out of range');
  if(!['http','socks5'].includes(proxyKind))throw Error('proxyKind must be http or socks5');
  if(extensionOrigin!==null&&!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin))
    throw Error('extensionOrigin must be one exact isolated Chrome extension origin');
  if(cookieSource!==null&&typeof cookieSource!=='function')throw cookieSourceError();
  // A fresh experiment must be able to use fresh codes without recreating old
  // redemption facts. Configuration is in-process only, never an HTTP control.
  if(!voucherAssignments||typeof voucherAssignments!=='object'||Array.isArray(voucherAssignments)||
    !Object.keys(voucherAssignments).length||Object.keys(voucherAssignments).length>32||
    Object.entries(voucherAssignments).some(([code,assignment])=>
      !/^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(code)||!SHARED_ACCOUNTS.some(row=>row.id===assignment)))
    throw Error('Invalid fixture voucher assignments');
  const assignments=Object.freeze({...voucherAssignments});
  if(!Number.isSafeInteger(sessionLifetimeMs)||sessionLifetimeMs<1000||sessionLifetimeMs>3600000)
    throw Error('Invalid fixture session lifetime');
  let lastSourceRevision=null;
  const retiredSourceRevisions=new Set();
  const sourceSnapshot=()=>{
    if(cookieSource===null)return null;
    try{
      const source=checkServerCookieSource(cookieSource(),now());
      if(lastSourceRevision&&lastSourceRevision!==source.revision)retiredSourceRevisions.add(lastSourceRevision);
      lastSourceRevision=source.revision;
      if(retiredSourceRevisions.has(source.revision))throw cookieSourceError();
      return source;
    }catch{
      if(lastSourceRevision)retiredSourceRevisions.add(lastSourceRevision);
      throw cookieSourceError();
    }
  };
  sourceSnapshot(); // Explicit configuration must fail closed before a listener exists.
  const previews=new Map(),ledger=new Map(),leases=new Map();
  const sharedRequests=new Map(),sessions=new Map();
  const pac=pacFor({proxyPort,proxyKind});
  let nextVerifyDelayMs=0,verificationsInFlight=0;
  const getVerificationState=()=>({nextVerifyDelayMs,verificationsInFlight});
  const setNextVerifyDelay=delayMs=>{
    if(!Number.isInteger(delayMs)||delayMs<0||delayMs>MAX_VERIFY_DELAY_MS)
      throw Error('verify delay must be an integer from 0 to 5000 ms');
    nextVerifyDelayMs=delayMs;
    return getVerificationState();
  };
  const currentAssignment=accountId=>[...ledger.values()].reverse().find(row=>
    row.receipt.accountId===accountId&&row.receipt.status==='redeemed');
  // Codes are single-use across accounts and preview IDs. Pending effects stay reserved.
  const codeReservation=code=>[...ledger.values()].find(row=>row.code===code&&
    ['redeemed','pending'].includes(row.receipt.status));
  const sharedAccessAllowed=(accountId,redemptionId)=>{
    const currentTime=now();
    const assignment=currentAssignment(accountId);
    return Boolean(assignment&&assignment.receipt.redemptionId===redemptionId&&
      SHARED_ACCOUNTS.some(row=>row.id===assignment.sharedAccountId)&&
      assignment.receipt.grantedEntitlements.some(entitlement=>entitlement.featureId==='local-managed-proxy'&&
        entitlement.status==='active'&&Number.isFinite(entitlement.expiresAt)&&entitlement.expiresAt>currentTime)&&
      isSharedAccessAllowed({accountId,redemptionId,sharedAccountId:assignment.sharedAccountId,serverNow:currentTime})===true);
  };
  const assertSourceAssignment=(row,source)=>{
    if(source&&(!sharedAccessAllowed(row.receipt.accountId,row.receipt.redemptionId)||
      row.sourceRevision!==source.revision))throw cookieSourceError();
  };
  const recoveryReceipt=row=>{
    const receipt=row.receipt;
    if(cookieSource===null||!receipt.cookieDelivery)return receipt;
    try{
      assertSourceAssignment(row,sourceSnapshot());
      if(receipt.cookieDelivery.expiresAt>now())return receipt;
    }catch{
      // Session availability cannot erase an already committed activation.
    }
    const {cookieDelivery,...durableReceipt}=receipt;
    return durableReceipt;
  };
  const issueDelivery=(accountId,sharedAccountId,redemptionId,source=null)=>{
    const issuedAt=now();
    const cookieDelivery=source?{schemaVersion:2,deliveryId:randomUUID(),targetUrl:'https://chatgpt.com/',
      expiresAt:Math.min(issuedAt+120000,source.checked.earliestExpiry??Infinity),cookies:source.cookies}:
      {schemaVersion:1,deliveryId:randomUUID(),targetUrl:sessionTarget,
      expiresAt:issuedAt+120000,cookies:[SESSION_COOKIE_NAME,CONTEXT_COOKIE_NAME].map(name=>({
        name,value:randomUUID(),path:'/session/',httpOnly:true,secure:false,sameSite:'lax',
        expirationDate:(issuedAt+sessionLifetimeMs)/1000
      }))};
    if(!source)sessions.set(cookieDelivery.deliveryId,{accountId,sharedAccountId,redemptionId,cookieDelivery});
    return cookieDelivery;
  };
  const member=()=>{
    const state=getMemberState(),bound=state.account.state==='bound';
    const receipts=bound?[...ledger.values()]
      .filter(({receipt})=>receipt.accountId===state.account.id&&receipt.status==='redeemed'):[];
    const assignment=bound?currentAssignment(state.account.id):null;
    let source=null,sourceAvailable=true;
    try{source=sourceSnapshot();}catch{sourceAvailable=false;}
    const accounts=sourceAvailable&&(!source||assignment?.sourceRevision===source.revision)&&assignment&&sharedAccessAllowed(state.account.id,assignment.receipt.redemptionId)?
      SHARED_ACCOUNTS.filter(row=>row.id===assignment.sharedAccountId):[];
    return {schemaVersion:1,serverNow:now(),account:state.account,
      entitlements:bound?[...state.entitlements,...(assignment?.receipt.grantedEntitlements??[])]:[],
      redemptions:receipts.map(({receipt,code})=>({
      redemptionId:receipt.redemptionId,skuTitle:'本地测试配额',
        redeemedAt:receipt.redeemedAt,status:'redeemed',voucherPreviewMasked:maskedCode(code)
      })),...(accounts.length?{sharedAccounts:{schemaVersion:1,companyId:'fixture-company',
        assignedAccountId:assignment.sharedAccountId,redemptionId:assignment.receipt.redemptionId,
      accounts:accounts.map(({displayNameMasked,...row})=>({...row,...(source?{cookieFormat:'chatgpt-export-v1',targetUrl:'https://chatgpt.com/',
        cookieScope:source.checked.batches.flatMap(batch=>batch.cookies.map(cookie=>
          Object.fromEntries(['name','path','domain','storeId','partitionKey'].filter(key=>Object.hasOwn(cookie,key))
            .map(key=>[key,cookie[key]]))))}:{displayNameMasked,targetUrl:sessionTarget,
        cookieScope:[SESSION_COOKIE_NAME,CONTEXT_COOKIE_NAME].map(name=>({name,path:'/session/'}))})}))}}:{})};
  };
  const server=http.createServer(async(req,res)=>{
    try{
    const path=(req.url||'').split('?')[0];
    // Opt in to one observed isolated extension origin at server startup only.
    // Web origins, opaque sandboxes and every other extension remain refused.
    if(req.headers.origin&&(req.headers.origin!==extensionOrigin||req.headers[TEST_HEADER]!=='1')){
      json(res,403,{error:'E_BROWSER_ORIGIN_DISABLED'});return;
    }
    if(req.method==='GET'&&path==='/activate'){
      const query=new URL(req.url,'http://127.0.0.1').searchParams;
      const valid=[...query.keys()].length===1&&query.getAll('activation_code').length===1&&
        Object.hasOwn(assignments,query.get('activation_code'));
      res.writeHead(valid?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'"});
      res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><p>'+
        (valid?'本地开发激活入口：由已安装工具按可信授权流程处理。':'本地开发激活链接无效。')+
        '</p></body></html>');return;
    }
    if(req.method==='GET'&&path==='/session/'){
      const cookies=(req.headers.cookie||'').split(';').map(part=>part.trim());
      const currentTime=now();
      const matched=[...sessions.values()].find(row=>
        row.cookieDelivery.cookies.every(cookie=>{
          const matching=cookies.filter(part=>part.startsWith(cookie.name+'='));
          return matching.length===1&&matching[0]===cookie.name+'='+cookie.value;
        }));
      const assignment=matched&&currentAssignment(matched.accountId);
      const entitlement=assignment?.receipt.grantedEntitlements.find(row=>row.featureId==='local-managed-proxy');
      const expiresAt=matched?Math.min(...matched.cookieDelivery.cookies.map(cookie=>cookie.expirationDate*1000),
        entitlement?.expiresAt??0):0;
      let reason=cookies.some(part=>[SESSION_COOKIE_NAME,CONTEXT_COOKIE_NAME].some(name=>part.startsWith(name+'=')))?
        'invalid':'missing';
      if(matched)reason=expiresAt<=currentTime?'expired':sharedAccessAllowed(matched.accountId,matched.redemptionId)?'valid':'revoked';
      const sharedAccount=reason==='valid'&&SHARED_ACCOUNTS.find(row=>row.id===matched.sharedAccountId);
      sendVipSessionPage(res,{reason,serverNow:currentTime,siteLabel:'共享账号 · 模拟 VIP 工作台',
        account:sharedAccount?{kind:'shared',sharedAccountId:sharedAccount.id,label:sharedAccount.label,
          displayNameMasked:sharedAccount.id==='shared-a'?'a***@fixture.test':'b***@fixture.test',
          level:sharedAccount.id==='shared-a'?'模拟标准 VIP':'模拟高级 VIP',
          issuedAt:assignment.receipt.redeemedAt,expiresAt}:null});return;
    }
    if(req.method==='GET'&&path==='/health'){
      json(res,200,{ok:true,mode:'LOCAL_FIXTURE_NOT_PRODUCTION',memberPort:server.address()?.port,
        proxyPort,proxyKind,accountId:getMemberState().account.id??null,providerHttps:false,
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
      if(typeof data.code!=='string'||!Object.hasOwn(assignments,data.code)){
        json(res,422,{error:'E_DEMO_CODE_INVALID'});return;
      }
      const reserved=codeReservation(data.code);
      if(reserved){
        json(res,409,{error:reserved.receipt.status==='pending'?'E_CODE_PENDING':'E_CODE_CONSUMED'});return;
      }
      const previewId=randomUUID(),expiresAt=now()+120000;
      previews.set(previewId,{accountId:account.id,expiresAt,code:data.code});
      json(res,200,{previewId,accountId:account.id,skuTitle:'本地测试配额',
        grantSummary:'增加 20 次演示额度，开通仅限本机 HTTP 7897 的开发代理；不是付费会员',
        voucherPreviewMasked:maskedCode(data.code),expiresAt});return;
    }
    if(path==='/api/redeem'){
      const {previewId,accountId,idempotencyKey}=data;
      const keyOk=typeof idempotencyKey==='string'&&/^[0-9a-f-]{36}$/i.test(idempotencyKey);
      if(accountId!==account.id||!keyOk){json(res,403,{error:'E_ACCOUNT_OR_IDEMPOTENCY'});return;}
      const old=ledger.get(idempotencyKey);
      if(old){
        if(old.previewId!==previewId||old.receipt.accountId!==accountId){json(res,409,{error:'E_IDEMPOTENCY_CONFLICT'});return;}
        json(res,200,recoveryReceipt(old));return;
      }
      const pre=previews.get(previewId);
      if(!pre||pre.accountId!==accountId||pre.expiresAt<=now()){
        json(res,409,{error:'E_PREVIEW_INVALID'});return;
      }
      const reserved=codeReservation(pre.code);
      if(reserved){
        json(res,409,{error:reserved.receipt.status==='pending'?'E_CODE_PENDING':'E_CODE_CONSUMED'});return;
      }
      const simulated=req.headers['x-fixture-outcome'];
      if(['pending','final-rejected'].includes(simulated)){
        const receipt={status:simulated==='pending'?'pending':'rejected',
          ...(simulated==='final-rejected'?{final:true}:{}),accountId,idempotencyKey};
        ledger.set(idempotencyKey,{previewId,code:pre.code,receipt});
        previews.delete(previewId);
        json(res,200,receipt);return;
      }
      const source=sourceSnapshot();
      const redeemedAt=now(),redemptionId=randomUUID(),sharedAccountId=assignments[pre.code];
      if(source&&isSharedAccessAllowed({accountId,redemptionId,sharedAccountId,serverNow:redeemedAt})!==true){
        json(res,403,{error:'E_SHARED_ACCESS_DENIED'});return;
      }
      const receipt={status:'redeemed',accountId,idempotencyKey,
        redemptionId,redeemedAt,cookieDelivery:issueDelivery(accountId,sharedAccountId,redemptionId,source),grantedEntitlements:[{
          type:'quota',status:'active',title:'本地测试配额',remaining:20,total:20,unit:'次'},
          {type:'feature',status:'active',featureId:'local-managed-proxy',title:'本地开发代理',expiresAt:redeemedAt+3600000,
            detail:'仅限本机 HTTP 127.0.0.1:7897；演示权益，不是付费会员'}]};
      ledger.set(idempotencyKey,{previewId,code:pre.code,sharedAccountId,receipt,...(source?{sourceRevision:source.revision}:{})});
      previews.delete(previewId);
      if(req.headers['x-fixture-drop-ack']==='1'){
        // Deliberately emulate a lost receipt AFTER applying a single mock effect.
        json(res,504,{error:'E_SIMULATED_ACK_LOSS',note:'Query /api/status. Do NOT retry POST.'});return;
      }
      json(res,200,receipt);return;
    }
    if(path==='/api/status'){
      if(data.operation==='sharedSession'){
        const {accountId,redemptionId,requestId}=data;
        if(Object.keys(data).length!==4||!['operation','accountId','redemptionId','requestId'].every(key=>Object.hasOwn(data,key))||
          typeof redemptionId!=='string'||!redemptionId.trim()||redemptionId.length>128||
          typeof requestId!=='string'||!requestId.trim()||requestId.length>128){
          json(res,400,{error:'E_SHARED_SESSION_REQUEST'});return;
        }
        if(accountId!==account.id){json(res,403,{error:'E_ACCOUNT_IDENTITY'});return;}
        const previous=sharedRequests.get(requestId);
        if(previous&&(previous.accountId!==accountId||previous.redemptionId!==redemptionId)){
          json(res,409,{error:'E_IDEMPOTENCY_CONFLICT'});return;
        }
        if(!sharedAccessAllowed(accountId,redemptionId)){
          json(res,403,{error:'E_SHARED_ACCESS_DENIED'});return;
        }
        const source=sourceSnapshot();
        assertSourceAssignment(currentAssignment(accountId),source);
        if(previous&&previous.cookieDelivery.expiresAt<=now()){
          json(res,409,{error:'E_DELIVERY_EXPIRED'});return;
        }
        const {sharedAccountId}=currentAssignment(accountId);
        const response=previous??{schemaVersion:1,accountId,sharedAccountId,redemptionId,requestId,serverNow:now(),
          cookieDelivery:issueDelivery(accountId,sharedAccountId,redemptionId,source)};
        sharedRequests.set(requestId,response);
        json(res,200,response);return;
      }
      if(data.accountId!==account.id||typeof data.idempotencyKey!=='string'){
        json(res,403,{error:'E_ACCOUNT_IDENTITY'});return;
      }
      const existing=ledger.get(data.idempotencyKey);
      // Missing ledger entry is UNKNOWN, never 'rejected + final=true'.
      json(res,200,(existing?.receipt.accountId===account.id?recoveryReceipt(existing):null)??{status:'unknown',accountId:account.id,
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
    }catch{if(!res.headersSent)json(res,503,{error:'E_COOKIE_SOURCE'});else res.destroy();}
  });
  return {server,pac,ledger,previews,leases,sharedRequests,sessions,setNextVerifyDelay,getVerificationState};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const host=process.env.VIP_TEST_HOST??'127.0.0.1';
  if(!['127.0.0.1','::1'].includes(host))throw Error('VIP_TEST_HOST must be 127.0.0.1 or ::1');
  const port=Number(process.env.VIP_TEST_PORT||7898);
  const proxyPort=Number(process.env.LOCAL_PROXY_PORT||7897);
  const proxyKind=process.env.LOCAL_PROXY_KIND||'http';
  const hasCookieFile=Object.hasOwn(process.env,'VIP_TEST_COOKIE_FILE');
  // Ephemeral/IPv6 test listeners retain the legacy synthetic target. The new
  // explicit IPv4 instance advertises its own supported session origin.
  const sessionTarget=!hasCookieFile&&host==='127.0.0.1'&&port===7903?
    `http://${host}:${port}/session/`:SESSION_TARGET;
  let fixture;
  try{fixture=createLocalFixture({proxyPort,proxyKind,sessionTarget,
    cookieSource:hasCookieFile?createServerCookieSource(process.env.VIP_TEST_COOKIE_FILE):null,
    extensionOrigin:process.env.VIP_TEST_EXTENSION_ORIGIN||null});
  }catch{console.error('[local fixture] Configuration unavailable or invalid');process.exit(1);}
  const {server}=fixture;
  server.listen({port,host,ipv6Only:host==='::1'},()=>{
    const actual=server.address().port;
    const origin=`http://${host==='::1'?'[::1]':host}:${actual}`;
    console.log(`[local fixture] ${origin}/health`);
    console.log(`[PAC] ${origin}/proxy.pac → ${proxyKind.toUpperCase()} 127.0.0.1:${proxyPort}`);
    console.log('[CAUTION] LOCAL MOCK ONLY; cannot wire HTTP fixture/loopback endpoint into R5.2 production validators.');
    console.log('[Demo request header] X-OpenDesk-Local-Test: 1; activation codes are documented only.');
  });
}
