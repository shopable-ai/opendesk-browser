const ID=/^[a-p]{32}$/;

// A pairing URL is only an untrusted request; it carries no capability or path.
export function createDevelopmentPairingRequest(extensionId,{now=Date.now(),crypto=globalThis.crypto}={}){
 if(!ID.test(extensionId)||!Number.isSafeInteger(now)||now<0)throw new Error('E_PAIRING_SCHEMA');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 const nonce=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 const query=new URLSearchParams({v:'1',extensionId,nonce,issuedAt:String(now),channel:'development'});
 return {url:'opendesk://browser-pair?'+query,expiresAt:now+120000};
}
