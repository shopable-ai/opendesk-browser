import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createShareRelay,createShareHttpServer} from './server.mjs';
import {webcrypto} from 'node:crypto';

const crypto=webcrypto;
const enc=new TextEncoder();
const b64=bytes=>Buffer.from(bytes).toString('base64url');
const site='https://accounts.example.test';
async function withServer(run){
  const dir=mkdtempSync(join(tmpdir(),'opendesk-cookie-relay-'));
  let clock=1_000_000;
  const file=join(dir,'shares.sqlite');
  const relay=createShareRelay({dbPath:file,publicOrigin:'http://localhost:8713',clock:()=>clock});
  const server=createShareHttpServer(relay);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${{server.address().port}`;
  const api=async(method,path,body,manager)=>{
    const r=await fetch(root+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),
      ...(manager?{'x-opendesk-invite-manager':manager}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    const json=await r.json();
    return {code:r.status,...json};
  };
  try{await run({relay,api,now:value=>{clock=value},file,root});}
  finally{await new Promise(resolve=>server.close(resolve));relay.close();rmSync(dir,{recursive:true,force:true});}
}
test('anonymous configuration claim is atomic, bounded and persists across reopen',async()=>{
  await withServer(async({relay,api,file})=>{
    const created=await api('POST','/v1/invites',{origin:site,displayName:'工作账号',
      description:'自有测试站点',mode:'configuration',expiresInSeconds:3600,maxClaims:1});
    assert.equal(created.code,201);
    assert.equal(created.invite.origin,site);
    assert.ok(created.url.endsWith(created.invite.id));
    const id=created.invite.id;
    assert.equal((await api('GET',`/v1/invites/${{id}`)).invite,undefined);
    const claims=await Promise.all(Array.from({length:12},()=>api('POST',`/v1/invites/${{id}/claim`,{})));
    assert.equal(claims.filter(x=>x.code===200).length,1);
    assert.equal(claims.filter(x=>x.error?.code==='E_INVITE_CONSUMED').length,11);
    const reopened=createShareRelay({dbPath:file,publicOrigin:'http://localhost:8713',clock:()=>1_000_000});
    try{assert.equal(reopened.operations.public(id).remainingClaims,0);}
    finally{reopened.close();}
    assert.equal(JSON.stringify(claims).includes('managerSecret'),false);
  });
});
test('session delivery requires manager secret and signed device proof',async()=>{
  await withServer(async({api})=>{
    const created=await api('POST','/v1/invites',{origin:site,displayName:'A',
      mode:'session',expiresInSeconds:3600,maxClaims:1});
    const {id}=created.invite;
    const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    const signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const ecdhPublic=await crypto.subtle.exportKey('jwk',receiver.publicKey);
    const verifyPublic=await crypto.subtle.exportKey('jwk',signer.publicKey);
    const pairing=await api('POST',`/v1/invites/${{id}/pair`,{ecdhPublic,verifyPublic});
    assert.equal(pairing.code,200);
    assert.equal((await api('GET',`/v1/invites/${{id}/pairs`)).error.code,'E_MANAGE_FORBIDDEN');
    const requests=await api('GET',`/v1/invites/${{id}/pairs`,undefined,created.managerSecret);
    assert.equal(requests.requests.length,1);
    const sender=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    const senderPublic=await crypto.subtle.exportKey('jwk',sender.publicKey);
    const upload={requestId:pairing.requestId,senderPublic,iv:b64(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext:b64(crypto.getRandomValues(new Uint8Array(64)))};
    assert.equal((await api('POST',`/v1/invites/${{id}/deliver`,upload)).error.code,'E_MANAGE_FORBIDDEN');
    assert.equal((await api('POST',`/v1/invites/${{id}/deliver`,upload,created.managerSecret)).status,
      'encrypted_ready');
    const challenge=await api('POST',`/v1/invites/${{id}/challenge`,{requestId:pairing.requestId});
    assert.ok(challenge.challenge);
    const message=`opendesk-cookie-share:v1:${{id}:${{pairing.requestId}:${{challenge.challenge}`;
    const sig=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,enc.encode(message)));
    assert.equal((await api('POST',`/v1/invites/${{id}/claim`,{requestId:pairing.requestId,
      challenge:challenge.challenge,signature:b64(new Uint8Array(64))})).error.code,'E_DEVICE_PROOF');
    const ok=await api('POST',`/v1/invites/${{id}/claim`,{requestId:pairing.requestId,
      challenge:challenge.challenge,signature:sig});
    assert.equal(ok.status,'encrypted_claimed');
    assert.equal(ok.packet.senderPublic.x,senderPublic.x);
    assert.equal(ok.packet.senderPublic.y,senderPublic.y);
    assert.equal(ok.packet.ciphertext,upload.ciphertext);
    assert.equal((await api('POST',`/v1/invites/${{id}/claim`,{requestId:pairing.requestId,
      challenge:challenge.challenge,signature:sig})).error.code,'E_INVITE_CONSUMED');
    const raw=JSON.stringify(ok);
    assert.equal(raw.includes(created.managerSecret),false);
  });
});
test('expiration and revocation prevent claims and pair registration',async()=>{
  await withServer(async({api,now})=>{
    const a=await api('POST','/v1/invites',{origin:site,displayName:'A',mode:'configuration',
      expiresInSeconds:300,maxClaims:3});
    assert.equal((await api('POST',`/v1/invites/${{a.invite.id}/revoke`,{},a.managerSecret)).status,'revoked');
    assert.equal((await api('POST',`/v1/invites/${{a.invite.id}/claim`,{})).error.code,'E_INVITE_REVOKED');
    const b=await api('POST','/v1/invites',{origin:site,displayName:'B',mode:'configuration',
      expiresInSeconds:300,maxClaims:3});
    now(1_301_000);
    assert.equal((await api('POST',`/v1/invites/${{b.invite.id}/claim`,{})).error.code,'E_INVITE_EXPIRED');
  });
});
