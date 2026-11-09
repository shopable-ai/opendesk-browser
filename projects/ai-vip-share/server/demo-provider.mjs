// AI VIP Share owner-scoped, SQLite-backed DEVELOPMENT provider.
// Deliberately not a production commerce service, account authority, Cookie issuer or Market Host.
import http from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

export const DEMO_ACCOUNT_ID='local-fixture-account';
export const DEMO_SKU='demo-quota';
const TOKEN=/^[A-Za-z0-9_-]{32,64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSION=/^chrome-extension:\/\/[a-p]{32}$/;
const MARKET='http://127.0.0.1:43132';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const validName=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const SCOPE='OpenDesk fixture entitlement; no third-party membership, Cookie or proxy access';

export function openDemoLedger(filename){
  if(typeof filename!=='string'||!filename||filename!==':memory:'&&!filename.startsWith('/'))
    throw Error('An absolute SQLite database filename is required');
  const db=new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  const schemaVersion=db.prepare('PRAGMA user_version').get().user_version;
  if(schemaVersion!==0&&schemaVersion!==1){
    db.close();
    throw Error('Unsupported development ledger schema version');
  }
  db.exec([
    'CREATE TABLE IF NOT EXISTS grants (',
    ' grant_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL, issue_id TEXT NOT NULL,',
    ' account_id TEXT NOT NULL, sku_id TEXT NOT NULL, quantity INTEGER NOT NULL, scope TEXT NOT NULL,',
    ' token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, issued_at INTEGER NOT NULL,',
    ' UNIQUE(intent_id,issue_id,account_id,sku_id));',
    'CREATE TABLE IF NOT EXISTS previews (',
    ' preview_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES grants(grant_id),',
    ' account_id TEXT NOT NULL, expires_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS redemptions (',
    ' redemption_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE REFERENCES grants(grant_id),',
    ' intent_id TEXT NOT NULL, issue_id TEXT NOT NULL, account_id TEXT NOT NULL, sku_id TEXT NOT NULL,',
    ' preview_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,',
    ' redeemed_at INTEGER NOT NULL, receipt_json TEXT NOT NULL,',
    ' UNIQUE(intent_id,issue_id,account_id,sku_id));'
  ].join('\n'));
  db.exec('PRAGMA user_version=1');
  return db;
}
function transaction(db,work){
  db.exec('BEGIN IMMEDIATE');
  try{const result=work();db.exec('COMMIT');return result;}
  catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
function grantForToken(db,code){
  if(typeof code!=='string'||!TOKEN.test(code))fail(422,'E_LINK_INVALID');
  const grant=db.prepare('SELECT * FROM grants WHERE token_hash=?').get(hash(code));
  if(!grant)fail(422,'E_LINK_INVALID');
  return grant;
}
function receiptOf(row){return JSON.parse(row.receipt_json);}
function memberOf(db,accountId,now){
  const rows=db.prepare('SELECT receipt_json FROM redemptions WHERE account_id=? ORDER BY redeemed_at DESC LIMIT 32')
    .all(accountId).map(receiptOf);
  return {schemaVersion:1,serverNow:now,account:{state:'bound',id:accountId,
    displayNameMasked:'l***@fixture.test'},
    entitlements:rows.flatMap(row=>row.grantedEntitlements).slice(0,32),
    redemptions:rows.map(row=>({redemptionId:row.redemptionId,skuTitle:'本地演示额度',
      redeemedAt:row.redeemedAt,status:'redeemed',idempotencyKey:row.idempotencyKey,
      voucherPreviewMasked:'****-DEMO'}))};
}

/** Issuance happens via local CLI, never through a public browser endpoint. */
export function issueDemoGrant(db,{intentId,issueId,accountId=DEMO_ACCOUNT_ID,
  skuId=DEMO_SKU,quantity=20,expiresAt,now=Date.now()}){
  if(!validName(intentId)||!validName(issueId)||accountId!==DEMO_ACCOUNT_ID||
    skuId!==DEMO_SKU||!Number.isSafeInteger(quantity)||quantity<1||quantity>20||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(expiresAt)||
    expiresAt<=now||expiresAt>now+24*60*60*1000)
    fail(400,'E_ISSUANCE_SCOPE');
  const code=randomBytes(24).toString('base64url'),grantId=randomUUID();
  try{
    transaction(db,()=>db.prepare('INSERT INTO grants(grant_id,intent_id,issue_id,account_id,sku_id,quantity,scope,token_hash,expires_at,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(grantId,intentId,issueId,accountId,skuId,quantity,SCOPE,hash(code),expiresAt,now));
  }catch(error){
    if(/constraint/i.test(error.message))fail(409,'E_ISSUANCE_EXISTS');
    throw error;
  }
  return {grantId,intentId,issueId,accountId,skuId,quantity,expiresAt,
    marketUrl:MARKET+'/apps/opendesk/ai-vip-share/#vip-ref='+code,
    activationUrl:'http://127.0.0.1:7898/activate?activation_code='+code};
}
export function previewDemoGrant(db,{code},accountId=DEMO_ACCOUNT_ID,now=Date.now()){
  const grant=grantForToken(db,code);
  if(grant.account_id!==accountId)fail(403,'E_WRONG_ACCOUNT');
  if(grant.expires_at<=now)fail(410,'E_LINK_EXPIRED');
  if(db.prepare('SELECT 1 FROM redemptions WHERE grant_id=?').get(grant.grant_id))
    fail(409,'E_ALREADY_REDEEMED');
  const previewId=randomUUID(),expiresAt=Math.min(now+120000,grant.expires_at);
  db.prepare('INSERT INTO previews(preview_id,grant_id,account_id,expires_at) VALUES(?,?,?,?)')
    .run(previewId,grant.grant_id,accountId,expiresAt);
  return {previewId,accountId,skuTitle:'本地演示额度',
    grantSummary:'发放 '+grant.quantity+' 次本地演示额度；'+SCOPE,
    voucherPreviewMasked:'****-'+code.slice(-4),expiresAt};
}
/** One BEGIN IMMEDIATE and unique business/issuance/idempotency indexes gate all effects. */
export function redeemDemoGrant(db,{previewId,accountId,idempotencyKey},expectedAccount=DEMO_ACCOUNT_ID,now=Date.now()){
  if(!exact({previewId,accountId,idempotencyKey},['previewId','accountId','idempotencyKey'])||
    !UUID.test(previewId)||!UUID.test(idempotencyKey)||accountId!==expectedAccount)
    fail(403,'E_REDEEM_IDENTITY');
  return transaction(db,()=>{
    const old=db.prepare('SELECT * FROM redemptions WHERE idempotency_key=?').get(idempotencyKey);
    if(old){
      if(old.account_id!==accountId||old.preview_id!==previewId)fail(409,'E_IDEMPOTENCY_CONFLICT');
      return receiptOf(old);
    }
    const grant=db.prepare('SELECT g.*,p.expires_at AS preview_expires_at FROM previews p JOIN grants g ON g.grant_id=p.grant_id WHERE p.preview_id=? AND p.account_id=?')
      .get(previewId,accountId);
    if(!grant||grant.preview_expires_at<=now||grant.expires_at<=now)
      fail(409,'E_PREVIEW_EXPIRED');
    if(db.prepare('SELECT 1 FROM redemptions WHERE grant_id=? OR (intent_id=? AND issue_id=? AND account_id=? AND sku_id=?)')
      .get(grant.grant_id,grant.intent_id,grant.issue_id,accountId,grant.sku_id))
      fail(409,'E_ALREADY_REDEEMED');
    const redemptionId=randomUUID(),receipt={status:'redeemed',accountId,idempotencyKey,
      redemptionId,redeemedAt:now,grantedEntitlements:[{
        type:'quota',status:'active',title:'本地演示额度',remaining:grant.quantity,
        total:grant.quantity,unit:'次'}]};
    db.prepare('INSERT INTO redemptions(redemption_id,grant_id,intent_id,issue_id,account_id,sku_id,preview_id,idempotency_key,redeemed_at,receipt_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(redemptionId,grant.grant_id,grant.intent_id,grant.issue_id,accountId,grant.sku_id,
        previewId,idempotencyKey,now,JSON.stringify(receipt));
    return receipt;
  });
}
export function statusDemoGrant(db,value,accountId=DEMO_ACCOUNT_ID){
  if(!value||value.accountId!==accountId)fail(403,'E_STATUS_IDENTITY');
  let row;
  if(exact(value,['accountId','idempotencyKey'])&&UUID.test(value.idempotencyKey))
    row=db.prepare('SELECT * FROM redemptions WHERE idempotency_key=? AND account_id=?')
      .get(value.idempotencyKey,accountId);
  else if(exact(value,['operation','accountId','intentId','issueId','skuId'])&&value.operation==='grant'&&
    validName(value.intentId)&&validName(value.issueId)&&value.skuId===DEMO_SKU)
    row=db.prepare('SELECT * FROM redemptions WHERE intent_id=? AND issue_id=? AND account_id=? AND sku_id=?')
      .get(value.intentId,value.issueId,accountId,value.skuId);
  else fail(400,'E_STATUS_FIELDS');
  return row?receiptOf(row):{status:'unknown',accountId,...(value.idempotencyKey?{
    idempotencyKey:value.idempotencyKey}:{intentId:value.intentId,issueId:value.issueId,skuId:value.skuId})};
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let total=0,chunks=[];
    req.on('data',chunk=>{
      total+=chunk.length;
      if(total>4096){reject(Object.assign(Error('body too large'),{status:413}));req.destroy();}
      else chunks.push(chunk);
    });
    req.on('end',()=>{try{
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!data||Array.isArray(data)||typeof data!=='object')throw Error('invalid body');
      resolve(data);
    }catch{reject(Object.assign(Error('invalid body'),{status:400}));}});
    req.on('error',reject);
  });
}
const common=Object.freeze({'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
function send(res,code,data,html=false){
  res.writeHead(code,{...common,'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8'});
  res.end(html?data:JSON.stringify(data));
}
export function createDemoProvider({db,extensionOrigin,accountId=DEMO_ACCOUNT_ID,now=Date.now,port=7898}){
  if(!db||!EXTENSION.test(extensionOrigin)||accountId!==DEMO_ACCOUNT_ID||
    !Number.isInteger(port)||port<0||port>65535)throw Error('Unsafe demo configuration');
  const server=http.createServer(async(req,res)=>{
    try{
      const address=server.address(),expectedHost='127.0.0.1:'+address.port;
      const hosts=req.rawHeaders.filter((item,i)=>i%2===0&&item.toLowerCase()==='host');
      if(hosts.length!==1||req.headers.host!==expectedHost||
        !req.url?.startsWith('/')||req.url.startsWith('//')||req.url.includes('#'))
        return send(res,403,{error:'E_HOST'});
      if(req.method==='GET'&&req.url==='/health')
        return send(res,200,{ok:true,mode:'DEMO_SQLITE_ONLY',accountId});
      if(req.method==='GET'&&req.url.startsWith('/activate?')){
        const match=/^\/activate\?activation_code=([A-Za-z0-9_-]{32,64})$/.exec(req.url);
        if(!match)return send(res,400,{error:'E_LINK_INVALID'});
        const grant=grantForToken(db,match[1]);
        if(grant.expires_at<=now())return send(res,410,{error:'E_LINK_EXPIRED'});
        const marketUrl=MARKET+'/apps/opendesk/ai-vip-share/#vip-ref='+match[1];
        return send(res,200,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>AI VIP Share 演示激活</title><p>本地开发演示；不会在此网页领取权益。</p><a rel="noreferrer" href="'+marketUrl+'">进入 OpenDesk 市场安装并继续</a></html>',true);
      }
      if(!req.url.startsWith('/api/'))return send(res,404,{error:'E_NOT_FOUND'});
      if(req.headers.origin!==extensionOrigin||req.headers['x-opendesk-local-test']!=='1')
        return send(res,403,{error:'E_CLIENT_ORIGIN'});
      if(req.method==='GET'&&req.url==='/api/member')
        return send(res,200,memberOf(db,accountId,now()));
      if(req.method!=='POST'||!['/api/preview','/api/redeem','/api/status'].includes(req.url))
        return send(res,405,{error:'E_METHOD'});
      const body=await readBody(req);
      if(req.url==='/api/preview'){
        if(!exact(body,['code']))fail(400,'E_PREVIEW_FIELDS');
        return send(res,200,previewDemoGrant(db,body,accountId,now()));
      }
      if(req.url==='/api/redeem'){
        if(!exact(body,['previewId','accountId','idempotencyKey']))fail(400,'E_REDEEM_FIELDS');
        return send(res,200,redeemDemoGrant(db,body,accountId,now()));
      }
      return send(res,200,statusDemoGrant(db,body,accountId));
    }catch(error){
      if(!res.headersSent)send(res,error.status||503,{error:error.code||'E_DEMO_UNAVAILABLE'});
      else res.destroy();
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=32;
  // A test may use ephemeral port 0, but listeners cannot bind beyond loopback.
  const originalListen=server.listen.bind(server);
  server.listen=(callback)=>originalListen({host:'127.0.0.1',port,exclusive:true},callback);
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  // No accidental public or production start. Only explicitly configured local testing.
  if(process.env.OPENDESK_VIP_DEMO_MODE!=='1'||!process.env.OPENDESK_VIP_DEMO_DB||
    !EXTENSION.test(process.env.OPENDESK_VIP_DEMO_EXTENSION_ORIGIN||'')){
    console.error('Development SQLite demo disabled; set explicit mode, absolute DB and extension origin.');
    process.exitCode=1;
  }else{
    let db;
    try{
      db=openDemoLedger(process.env.OPENDESK_VIP_DEMO_DB);
      if(process.argv[2]==='issue'){
        const [intentId,issueId,quantityString]=process.argv.slice(3);
        const quantity=Number(quantityString||20);
        console.log(JSON.stringify(issueDemoGrant(db,{intentId,issueId,quantity,expiresAt:Date.now()+30*60*1000}),null,2));
        db.close();
      }else if(process.argv.length===2){
        const server=createDemoProvider({db,extensionOrigin:process.env.OPENDESK_VIP_DEMO_EXTENSION_ORIGIN});
        server.listen(()=>console.log('AI VIP Share SQLite DEVELOPMENT provider listening on http://127.0.0.1:7898'));
      }else throw Error('Usage: node demo-provider.mjs [issue INTENT_ID ISSUE_ID QUANTITY]');
    }catch(error){try{db?.close();}catch{}console.error(error.code||error.message);process.exitCode=1;}
  }
}
