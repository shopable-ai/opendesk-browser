// Public market, no code installation authority. The URL fragment never enters
// opendesk.market.intent.v1 and is never sent to the Chrome external receiver.
// A temporary local demo reference is NOT a production activation credential.
const MARKET_ORIGIN='http://127.0.0.1:43132';
const LANDING_ORIGIN='http://127.0.0.1:7898';
const PREFIX='#vip-ref=';
const REFERENCE=/^[A-Za-z0-9_-]{32,64}$/;

export function vipActivationLanding(page,channel){
  if(channel?.enabled!==true||channel.mode!=='development'||
    channel.origin!==MARKET_ORIGIN||page?.origin!==MARKET_ORIGIN||
    page.pathname!=='/apps/opendesk/ai-vip-share/'||
    typeof page.hash!=='string'||!page.hash.startsWith(PREFIX))return null;
  const ref=page.hash.slice(PREFIX.length);
  if(!REFERENCE.test(ref))return null;
  return {activationUrl:LANDING_ORIGIN+'/activate?activation_code='+ref};
}
// The tab stores only a digest of the requested continuation, not the ref/code.
// Changing the fragment after a trusted install request cancels automatic resume.
export async function vipResumeProof(hash){
  if(typeof hash!=='string'||hash.length>160||!hash.startsWith(PREFIX)||
    !REFERENCE.test(hash.slice(PREFIX.length))||!globalThis.crypto?.subtle)return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(hash));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
