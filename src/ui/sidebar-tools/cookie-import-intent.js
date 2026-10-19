// Trusted Side Panel only. This gate never grants a Chrome permission.
// Every chunk still goes through exact Host authorization and readback.
export const COOKIE_IMPORT_INTENT_TTL_MS=120000;
export const COOKIE_IMPORT_INTENT_LIMIT=1000;
const denied=(code,message)=>Object.assign(new Error(message),{code});
export function createCookieImportIntentGate({now=()=>Date.now()}={}){
  let intent=null;
  return Object.freeze({
    start({owner,origin,verifiedUserActivation}){
      if(verifiedUserActivation!==true)
        throw denied('E_USER_GESTURE_REQUIRED','请重新点击导入按钮');
      if(typeof owner!=='string'||!owner||typeof origin!=='string'||
         !/^https?:\/\//.test(origin))
        throw denied('E_SCHEMA','无效的 Cookie 导入范围');
      if(intent?.inFlight)throw denied('E_BUSY','当前 Cookie 导入仍在写入');
      intent={owner,origin,expiresAt:now()+COOKIE_IMPORT_INTENT_TTL_MS,used:0,inFlight:false};
      return {authorized:true,expiresAt:intent.expiresAt};
    },
    acquire({owner,origin,count}){
      if(!intent||intent.owner!==owner)return false;
      if(intent.origin!==origin||now()>=intent.expiresAt){
        intent=null;throw denied('E_DOCUMENT_CHANGED','导入范围已变化或超时');
      }
      if(intent.inFlight)throw denied('E_BUSY','Cookie 批次正在写入');
      if(!Number.isSafeInteger(count)||count<1||intent.used+count>COOKIE_IMPORT_INTENT_LIMIT){
        intent=null;throw denied('E_LIMIT','本次最多导入 1000 条 Cookie');
      }
      intent.inFlight=true;
      return true;
    },
    settle({owner,count,confirmed}){
      if(!intent||intent.owner!==owner)return;
      if(confirmed!==true||!intent.inFlight){intent=null;return;}
      intent.used+=count;
      if(intent.used>=COOKIE_IMPORT_INTENT_LIMIT)intent=null;
      else intent.inFlight=false;
    },
    close(owner){if(intent?.owner===owner)intent=null;return {closed:true};},
    revoke(){intent=null;}
  });
}
