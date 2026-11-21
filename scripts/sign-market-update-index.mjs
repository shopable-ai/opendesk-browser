// Offline release step. Private keys are explicit local inputs, never CMS fields,
// client assets or environment defaults. Publishing/activating remains separate.
import {writeFile} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMarketSnapshotFile} from './market-index-response.mjs';
import {SIGNED_UPDATE_INDEX_SCHEMA,MAX_UPDATE_PAYLOAD_BYTES,parseUpdateIndexJSON,
  validateUpdateIndex,updateIndexBase64,updateIndexSigningBytes,verifySignedUpdateIndex}
  from '../src/marketplace/update-index.js';

export async function signMarketUpdateIndex({payloadBytes,privateKey,keyId,now=Date.now()}){
  const bytes=new Uint8Array(payloadBytes);
  validateUpdateIndex(parseUpdateIndexJSON(bytes,MAX_UPDATE_PAYLOAD_BYTES),{now});
  const key=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
  if(key.asymmetricKeyType!=='ed25519')throw new Error('An Ed25519 private key is required');
  const envelope={schema:SIGNED_UPDATE_INDEX_SCHEMA,algorithm:'Ed25519',keyId,
    payload:updateIndexBase64(bytes),signature:''};
  envelope.signature=sign(null,updateIndexSigningBytes(envelope),key).toString('base64');
  const publicKey=Buffer.from(createPublicKey(key).export({format:'jwk'}).x,'base64url').toString('base64');
  const output=Buffer.from(JSON.stringify(envelope,null,2)+'\n');
  const checked=await verifySignedUpdateIndex(output,{publicKeys:{[keyId]:publicKey},now});
  return {bytes:output,publicKey,payloadSha256:checked.payloadSha256,sequence:checked.payload.sequence};
}
async function boundedFile(path,max){
  return readMarketSnapshotFile(path,{limit:max});
}
async function main(){
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i+=2){
    if(!['--payload','--private-key','--key-id','--out'].includes(args[i])||!args[i+1]||values[args[i]])
      throw new Error('Usage: node scripts/sign-market-update-index.mjs --payload payload.json --private-key key.pem --key-id KEY_ID --out NEW_FILE');
    values[args[i]]=args[i+1];
  }
  if(Object.keys(values).length!==4)throw new Error('Explicit payload, private key, key ID and new output file are required');
  const result=await signMarketUpdateIndex({payloadBytes:await boundedFile(values['--payload'],MAX_UPDATE_PAYLOAD_BYTES),
    privateKey:await boundedFile(values['--private-key'],8192),keyId:values['--key-id']});
  // A signed snapshot is immutable; do not overwrite one in place.
  await writeFile(values['--out'],result.bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({output:values['--out'],sequence:result.sequence,
    payloadSha256:result.payloadSha256,publicKey:result.publicKey})+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
