// Trusted Side Panel only. A verified click on the Cookie Editor's existing
// clear-preview dialog authorizes ONE exact Host-only clear, not a whole site
// permission, blanket SDK operation, or retry of an uncertain native effect.
export const COOKIE_CLEAR_INTENT_TTL_MS=120000;
const error=(code,message)=>Object.assign(new Error(message),{code});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createCookieClearIntentGate({now=()=>Date.now()}={}){
  let pending=null,sequence=0;
  const validUrl=value=>{
    try{
      const url=new URL(value);
      return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&
        url.hash===''&&url.search===''&&url.href===value;
    }catch{return false;}
  };
  const validCount=value=>Number.isSafeInteger(value)&&value>=1&&value<=50;
  return Object.freeze({
    start({owner,url,previewRef,expectedCount,grantEpoch,verifiedUserActivation}){
      if(verifiedUserActivation!==true)
        throw error('E_USER_GESTURE_REQUIRED','请重新点击清理确认');
      if(typeof owner!=='string'||!owner||!validUrl(url)||!uuid.test(previewRef)||
        !validCount(expectedCount)||typeof grantEpoch!=='string'||!grantEpoch)
        throw error('E_SCHEMA','Cookie 清理范围或预览凭据无效');
      if(pending&&now()<pending.expiresAt)
        throw error('E_BUSY','上一笔 Cookie 清理尚未完成');
      pending={owner,url,previewRef,expectedCount,grantEpoch,
        ref:++sequence,expiresAt:now()+COOKIE_CLEAR_INTENT_TTL_MS};
      return {authorized:true,ref:pending.ref,expiresAt:pending.expiresAt};
    },
    // Consume BEFORE minting the existing one-use Browser Host approval. Any
    // mismatch burns the intent instead of falling back to a second dialog.
    consume({owner,url,previewRef,expectedCount,maxCookies,grantEpoch}){
      if(!pending||pending.owner!==owner)return false;
      const original=pending;pending=null;
      if(now()>=original.expiresAt||url!==original.url||
        previewRef!==original.previewRef||expectedCount!==original.expectedCount||
        maxCookies!==50||grantEpoch!==original.grantEpoch)
        throw error('E_DOCUMENT_CHANGED','Cookie 清理预览、授权或操作范围已改变');
      return true;
    },
    close(owner,ref){
      const closed=Boolean(pending&&pending.owner===owner&&pending.ref===ref);
      if(closed)pending=null;
      return {closed};
    },
    revoke(){pending=null;}
  });
}
