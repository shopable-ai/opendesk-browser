// OpenDesk Cookie Editor R3.1 minimal share relay.
// The relay never receives plaintext Cookie values, ECDH private keys or local vault data.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash, createPublicKey, randomBytes, timingSafeEqual, verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const MAX_BODY=1024*1024;
const MAX_AGE=7*24*3600;
const ID=/^[A-Za-z0-9_-]{22,80}$/;
const random=()=>randomBytes(24).toString('base64url');
const hex=s=>createHash('sha256').update(s).digest('hex');
const validOrigin=value=>{
  if(typeof value!=='string'||value.length>320)throw fail('E_ORIGIN');
  let u;try{u=new URL(value);}catch{throw fail('E_ORIGIN');}
  if(!['https:','http:'].includes(u.protocol)||u.origin!==value||u.username||u.password)
    throw fail('E_ORIGIN');
  return value;
};
const word=(value,max=80)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))
    throw fail('E_METADATA');
  return value.trim();
};
const optionalText=(value,max=120)=>value===undefined?'':
  value===''?'':word(value,max);
const key=(value)=>{
  if(!value||value.kty!=='EC'||value.crv!=='P-256'||
     typeof value.x!=='string'||typeof value.y!=='string'||value.d!==undefined||
     !/^[A-Za-z0-9_-]{43}$/.test(value.x)||!/^[A-Za-z0-9_-]{43}$/.test(value.y))
    throw fail('E_DEVICE_KEY');
  const jwk={kty:'EC',crv:'P-256',x:value.x,y:value.y};
  try{createPublicKey({key:jwk,format:'jwk'});}catch{throw fail('E_DEVICE_KEY');}
  return JSON.stringify(jwk);
};
const base64=value=>{
  if(typeof value!=='string'||!value||!(/^[A-Za-z0-9_-]+$/).test(value))
    throw fail('E_CRYPTO_PACKET');
  const decoded=Buffer.from(value,'base64url');
  if(decoded.toString('base64url')!==value)throw fail('E_CRYPTO_PACKET');
  return decoded;
};
const limited=(value,bytes)=>{
  const buffer=base64(value);
  if(buffer.length<1||buffer.length>bytes)throw fail('E_CRYPTO_PACKET');
  return value;
};
const now=()=>Date.now();

export function createShareRelay({dbPath,publicOrigin,clock=now}={}){
  if(!dbPath||typeof dbPath!=='string')throw fail('E_DATABASE_CONFIG');
  const url=new URL(publicOrigin);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&
    ['localhost','127.0.0.1'].includes(url.hostname)))||
    url.origin!==publicOrigin||url.username||url.password)
    throw fail('E_PUBLIC_HTTPS_REQUIRED');
  const db=new DatabaseSync(resolve(dbPath));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY, origin TEXT NOT NULL, display_name TEXT NOT NULL,
      description TEXT NOT NULL, mode TEXT NOT NULL, expires_at INTEGER NOT NULL,
      max_claims INTEGER NOT NULL, claims INTEGER NOT NULL DEFAULT 0,
      manager_hash TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pair_requests (
      id TEXT PRIMARY KEY, invite_id TEXT NOT NULL,
      ecdh_public TEXT NOT NULL, verify_public TEXT NOT NULL,
      created_at INTEGER NOT NULL, ciphertext TEXT, sender_public TEXT, iv TEXT,
      challenge_hash TEXT, challenge_expires INTEGER,
      claimed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(invite_id) REFERENCES invitations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_pairs_invite ON pair_requests(invite_id);
  `);
  const find=id=>db.prepare('SELECT * FROM invitations WHERE id=?').get(id);
  const validInvite=id=>{
    if(!ID.test(id))throw fail('E_INVITE_INVALID');
    const invitation=find(id);
    if(!invitation)throw fail('E_INVITE_NOT_FOUND',404);
    if(invitation.revoked)throw fail('E_INVITE_REVOKED',410);
    if(invitation.expires_at<=clock())throw fail('E_INVITE_EXPIRED',410);
    return invitation;
  };
  const gate=(id,managerSecret)=>{
    const invitation=validInvite(id);
    if(typeof managerSecret!=='string'||!ID.test(managerSecret))
      throw fail('E_MANAGE_FORBIDDEN',403);
    const a=Buffer.from(invitation.manager_hash,'hex');
    const b=Buffer.from(hex(managerSecret),'hex');
    if(a.length!==b.length||!timingSafeEqual(a,b))throw fail('E_MANAGE_FORBIDDEN',403);
    return invitation;
  };
  const trans=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try{const result=fn();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  };
  const metadata=i=>({id:i.id,origin:i.origin,displayName:i.display_name,
    description:i.description,mode:i.mode,expiresAt:i.expires_at,
    remainingClaims:Math.max(0,i.max_claims-i.claims),revoked:Boolean(i.revoked)});
  const operations={
    create(body){
      if(!body||typeof body!=='object'||Array.isArray(body))throw fail('E_REQUEST');
      const origin=validOrigin(body.origin);
      const displayName=word(body.displayName,64);
      const description=optionalText(body.description);
      const mode=body.mode;
      if(!['configuration','session'].includes(mode))throw fail('E_MODE');
      const expiresIn=body.expiresInSeconds;
      const maxClaims=body.maxClaims;
      if(!Number.isSafeInteger(expiresIn)||expiresIn<300||expiresIn>MAX_AGE||
        !Number.isSafeInteger(maxClaims)||maxClaims<1||maxClaims>10||
        (mode==='session'&&maxClaims!==1))throw fail('E_LIMIT');
      const id=random(),managerSecret=random(),expiresAt=clock()+expiresIn*1000;
      db.prepare(`INSERT INTO invitations
        (id,origin,display_name,description,mode,expires_at,max_claims,manager_hash,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(id,origin,displayName,description,mode,
          expiresAt,maxClaims,hex(managerSecret),clock());
      return {invite:metadata(find(id)),url:`${{publicOrigin}/i/${{id}`,managerSecret};
    },
    public(id){return metadata(validInvite(id));},
    pair(id,body){
      const invite=validInvite(id);
      if(invite.mode!=='session')throw fail('E_MODE');
      if(invite.claims>=invite.max_claims)throw fail('E_INVITE_CONSUMED',409);
      const ecdh=key(body?.ecdhPublic),signature=key(body?.verifyPublic);
      const count=db.prepare('SELECT COUNT(*) AS n FROM pair_requests WHERE invite_id=?').get(id).n;
      if(count>=20)throw fail('E_PAIR_LIMIT',429);
      const requestId=random();
      db.prepare(`INSERT INTO pair_requests
        (id,invite_id,ecdh_public,verify_public,created_at) VALUES (?,?,?,?,?)`)
        .run(requestId,id,ecdh,signature,clock());
      return {requestId,expiresAt:invite.expires_at};
    },
    pairs(id,managerSecret){
      gate(id,managerSecret);
      return db.prepare(`SELECT id,ecdh_public,verify_public,created_at,ciphertext,claimed
        FROM pair_requests WHERE invite_id=? ORDER BY created_at ASC`).all(id).map(row=>({
        requestId:row.id,ecdhPublic:JSON.parse(row.ecdh_public),
        verifyPublic:JSON.parse(row.verify_public),createdAt:row.created_at,
        status:row.claimed?'claimed':row.ciphertext?'ready':'pending'
      }));
    },
    deliver(id,managerSecret,body){
      const invite=gate(id,managerSecret);
      if(invite.mode!=='session'||invite.claims>=invite.max_claims)throw fail('E_MODE');
      if(!ID.test(body?.requestId))throw fail('E_REQUEST');
      const senderPublic=key(body?.senderPublic);
      const iv=limited(body?.iv,12);
      if(base64(iv).length!==12)throw fail('E_CRYPTO_PACKET');
      const ciphertext=limited(body?.ciphertext,800000);
      if(base64(ciphertext).length<17)throw fail('E_CRYPTO_PACKET');
      return trans(()=>{
        const live=validInvite(id);
        if(live.claims>=live.max_claims)throw fail('E_INVITE_CONSUMED',409);
        const row=db.prepare('SELECT * FROM pair_requests WHERE id=? AND invite_id=?')
          .get(body.requestId,id);
        if(!row||row.claimed||row.ciphertext)throw fail('E_PAIR_UNAVAILABLE',409);
        db.prepare(`UPDATE pair_requests SET sender_public=?,iv=?,ciphertext=? WHERE id=?`)
          .run(senderPublic,iv,ciphertext,body.requestId);
        return {status:'encrypted_ready',requestId:body.requestId};
      });
    },
    challenge(id,body){
      const invite=validInvite(id);
      if(invite.mode!=='session'||invite.claims>=invite.max_claims)
        throw fail('E_INVITE_CONSUMED',409);
      if(!ID.test(body?.requestId))throw fail('E_REQUEST');
      const challenge=random();
      const updated=db.prepare(`UPDATE pair_requests SET challenge_hash=?,challenge_expires=?
        WHERE id=? AND invite_id=? AND ciphertext IS NOT NULL AND claimed=0`)
        .run(hex(challenge),clock()+60_000,body.requestId,id);
      if(updated.changes!==1)throw fail('E_PAIR_UNAVAILABLE',409);
      return {challenge,expiresAt:clock()+60_000};
    },
    claim(id,body){
      return trans(()=>{
        const invite=validInvite(id);
        if(invite.claims>=invite.max_claims)throw fail('E_INVITE_CONSUMED',409);
        if(invite.mode==='configuration'){
          db.prepare('UPDATE invitations SET claims=claims+1 WHERE id=?').run(id);
          return {status:'configuration_claimed',account:metadata(invite)};
        }
        if(!ID.test(body?.requestId))throw fail('E_REQUEST');
        const row=db.prepare('SELECT * FROM pair_requests WHERE id=? AND invite_id=?')
          .get(body.requestId,id);
        if(!row||!row.ciphertext||row.claimed||!row.challenge_hash||
          row.challenge_expires<=clock()||
          typeof body.challenge!=='string'||hex(body.challenge)!==row.challenge_hash)
          throw fail('E_CHALLENGE_INVALID',403);
        const signature=limited(body.signature,256);
        const data=Buffer.from(`opendesk-cookie-share:v1:${{id}:${{row.id}:${{body.challenge}`);
        let verified=false;
        try{verified=verify('sha256',data,
          {key:createPublicKey({key:JSON.parse(row.verify_public),format:'jwk'}),
            dsaEncoding:'ieee-p1363'},base64(signature));}catch{}
        if(!verified)throw fail('E_DEVICE_PROOF',403);
        db.prepare('UPDATE invitations SET claims=claims+1 WHERE id=?').run(id);
        db.prepare(`UPDATE pair_requests SET claimed=1,challenge_hash=NULL,
          challenge_expires=NULL,ciphertext=NULL WHERE id=?`).run(row.id);
        return {status:'encrypted_claimed',account:metadata(invite),
          packet:{senderPublic:JSON.parse(row.sender_public),iv:row.iv,
            ciphertext:row.ciphertext}};
      });
    },
    revoke(id,managerSecret){
      return trans(()=>{
        gate(id,managerSecret);
        db.prepare('UPDATE invitations SET revoked=1 WHERE id=?').run(id);
        db.prepare('UPDATE pair_requests SET ciphertext=NULL WHERE invite_id=?').run(id);
        return {status:'revoked'};
      });
    }
  };
  return {operations,close:()=>db.close()};
}

function readJson(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let n=0;let done=false;
    req.on('data',chunk=>{
      if(done)return;
      n+=chunk.length;
      if(n>MAX_BODY){done=true;reject(fail('E_BODY_LIMIT',413));req.resume();return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{
      if(done)return;
      try{
        if(!String(req.headers['content-type']||'').startsWith('application/json'))
          throw fail('E_CONTENT_TYPE',415);
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      }catch(error){reject(error?.code?error:fail('E_JSON'));}
    });
    req.on('error',reject);
  });
}
function json(res,status,data){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','content-security-policy':"default-src 'none'"});
  res.end(JSON.stringify(data));
}
export function createShareHttpServer(relay){
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://local.invalid');
      const path=url.pathname;
      if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok'});
      const landing=/^\/i\/([A-Za-z0-9_-]{22,80})$/.exec(path);
      if(req.method==='GET'&&landing){
        const info=relay.operations.public(landing[1]);
        // The link carries only an opaque invitation ID. No receiver access to Cookies.
        const title='OpenDesk Cookie Editor · 领取邀请';
        res.writeHead(200,{'content-type':'text/html; charset=utf-8',
          'cache-control':'no-store','referrer-policy':'no-referrer',
          'x-content-type-options':'nosniff',
          'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"});
        return res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${{title}</title><meta name="referrer" content="no-referrer"><style>body{font:16px system-ui;max-width:34rem;margin:12vh auto;padding:1rem;line-height:1.7}code{word-break:break-all}</style><h1>${{title}</h1><p>网站：<code>${{info.origin.replaceAll('&','&amp;').replaceAll('<','&lt;')}</code></p><p>请打开 OpenDesk Cookie Editor 的「账号 → 领取邀请」，粘贴当前地址完成领取。会话领取需经发送设备确认。</p></html>`);
      }
      const match=/^\/v1\/invites\/([A-Za-z0-9_-]{22,80})(?:\/(pairs|pair|deliver|challenge|claim|revoke))?$/.exec(path);
      if(req.method==='POST'&&path==='/v1/invites')
        return json(res,201,relay.operations.create(await readJson(req)));
      if(!match)throw fail('E_NOT_FOUND',404);
      const [,id,action]=match;
      const manager=req.headers['x-opendesk-invite-manager'];
      if(req.method==='GET'&&!action)return json(res,200,relay.operations.public(id));
      if(req.method==='GET'&&action==='pairs')
        return json(res,200,{requests:relay.operations.pairs(id,manager)});
      if(req.method!=='POST')throw fail('E_METHOD',405);
      const body=await readJson(req);
      const handlers={pair:()=>relay.operations.pair(id,body),
        deliver:()=>relay.operations.deliver(id,manager,body),
        challenge:()=>relay.operations.challenge(id,body),
        claim:()=>relay.operations.claim(id,body),
        revoke:()=>relay.operations.revoke(id,manager)};
      if(!handlers[action])throw fail('E_NOT_FOUND',404);
      return json(res,200,handlers[action]());
    }catch(error){
      // Error messages never echo request data or credentials.
      json(res,error?.status||400,{error:{code:error?.code||'E_RELAY'}});
    }
  });
}
const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(invoked){
  const host=process.env.SHARE_BIND_HOST||'127.0.0.1';
  const port=Number(process.env.SHARE_PORT||8713);
  const publicOrigin=process.env.SHARE_PUBLIC_ORIGIN||`http://localhost:${{port}`;
  const dbPath=process.env.SHARE_DATABASE||resolve('cookie-share-relay.sqlite');
  try{
    const relay=createShareRelay({dbPath,publicOrigin});
    createShareHttpServer(relay).listen(port,host,()=>{
      console.log(`Cookie Share Relay listening on ${{host}:${{port}; public origin ${{publicOrigin}`);
    });
  }catch(error){console.error('Relay configuration failed:',error?.code||'E_RELAY');process.exitCode=1;}
}
