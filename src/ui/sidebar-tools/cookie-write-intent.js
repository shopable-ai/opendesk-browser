// Trusted Side Panel only: one gesture, one Cookie name/path and one Host write.
export const COOKIE_WRITE_INTENT_TTL_MS=120000;
const denied=(code,message)=>Object.assign(new Error(message),{code});
export function createCookieWriteIntentGate({now=()=>Date.now()}={}){
  let intent=null,sequence=0;
  const valid=(name,path)=>typeof name==='string'&&name.length>0&&name.length<=256&&
    typeof path==='string'&&path.startsWith('/')&&path.length<=1024;
  return Object.freeze({
    start({owner,origin,name,path,verifiedUserActivation}){
      if(verifiedUserActivation!==true)
        throw denied('E_USER_GESTURE_REQUIRED','请重新点击保存');
      if(typeof owner!=='string'||!owner||typeof origin!=='string'||
         !/^https?:\/\//.test(origin)||!valid(name,path))
        throw denied('E_SCHEMA','无效的保存范围');
      if(intent?.inFlight)throw denied('E_BUSY','上一次保存尚未完成');
      intent={owner,origin,name,path,ref:++sequence,expiresAt:now()+COOKIE_WRITE_INTENT_TTL_MS,
        inFlight:false};
      return {authorized:true,ref:intent.ref,expiresAt:intent.expiresAt};
    },
    acquire({owner,origin,name,path}){
      if(!intent||intent.owner!==owner)return false;
      if(now()>=intent.expiresAt||intent.origin!==origin||
         intent.name!==name||intent.path!==path){
        intent=null;throw denied('E_DOCUMENT_CHANGED','保存操作范围已变化或超时');
      }
      if(intent.inFlight)throw denied('E_BUSY','本次保存已被使用');
      intent.inFlight=true;return true;
    },
    settle({owner}){if(intent?.owner===owner)intent=null;},
    close(owner,ref){
      const closed=Boolean(intent&&intent.owner===owner&&intent.ref===ref);
      if(closed)intent=null;
      return {closed};
    },
    revoke(){intent=null;}
  });
}
