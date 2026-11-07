// Read only explicit isolated-harness state; never load a default user store.
import {readFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function readIsolatedEvidence(directory){
 if(!directory||!basename(resolve(directory)).startsWith('cookie-preview-isolated-'))throw Error('E_ISOLATED_DIRECTORY_REQUIRED');
 const read=async name=>{try{return JSON.parse(await readFile(join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 const state=await read('bindings/service-binding-v1.json');
 const history=await read('history/history-v1.json');
 const pairing=await read('application-pairing.json');
 return {evidence:'Preview + isolated HTTP',backendOrigin:pairing?.origin??null,
  pairingExpired:pairing?Date.now()>=pairing.expiresAt:null,
  syntheticAccounts:Object.keys(history?.accounts??{}),
  devices:(state?.devices??[]).map(row=>({revoked:row.revoked,authEpoch:row.authEpoch,resourceCount:row.resourceIds.length})),
  bindings:(state?.bindings??[]).map(row=>({remoteAccountId:row.remoteAccountId,
   localAlias:row.localAccount.alias,storeId:row.localAccount.storeId,partitionKey:row.localAccount.partitionKey,
   verificationState:row.verificationState,revoked:row.revoked})),
  operations:(state?.operations??[]).map(row=>({createdAt:row.createdAt,
   resultType:row.result?.status??(row.result?.bindingId?'BINDING':row.result?.deviceId?'DEVICE':'OTHER')}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(JSON.stringify(await readIsolatedEvidence(process.argv[2]),null,2));
}
