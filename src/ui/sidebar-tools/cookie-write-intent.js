// Trusted Side Panel only: one gesture, one Cookie name/path and one Host write.
// A rename may additionally remove ONE named old cookie, only after verified set.
export const COOKIE_WRITE_INTENT_TTL_MS=120000;
const denied=(code,message)=>Object.assign(new Error(message),{code});
export function createCookieWriteIntentGate({now=()=>Date.now()}={}){
  let intent=null,sequence=0;
  const valid=(name,path)=>typeof name==='string'&&name.length>0&&name.length<=256&&
    typeof path==='string'&&path.startsWith('/')&&path.length<=1024;
  return Object.freeze({
    start({owner,origin,name,path,action='set',renameFrom=null,verifiedUserActivation}){
      if(verifiedUserActivation!==true)
        throw denied('E_USER_GESTURE_REQUIRED','请重新点击保存');
      if(typeof owner!=='string'||!owner||typeof origin!=='string'||
         !/^https?:\/\//.test(origin)||!valid(name,path)||!['set','remove'].includes(action)||
         renameFrom!==null&&(action!=='set'||!valid(renameFrom,path)||renameFrom===name))
        throw denied('E_SCHEMA','无效的保存范围');
      if(intent&&now()<intent.expiresAt&&(intent.inFlight||intent.stage==='remove'))
        throw denied('E_BUSY','上一次保存尚未完成');
      intent={owner,origin,name,path,action,renameFrom,stage:'initial',
        ref:++sequence,expiresAt:now()+COOKIE_WRITE_INTENT_TTL_MS,inFlight:false};
      return {authorized:true,ref:intent.ref,expiresAt:intent.expiresAt};
    },
    acquire({owner,origin,name,path,action='set'}){
      if(!intent||intent.owner!==owner)return false;
      const expectedAction=intent.stage==='remove'?'remove':intent.action;
      const expectedName=intent.stage==='remove'?intent.renameFrom:intent.name;
      if(now()>=intent.expiresAt||intent.origin!==origin||
         expectedName!==name||intent.path!==path||expectedAction!==action){
        intent=null;throw denied('E_DOCUMENT_CHANGED','保存操作范围已变化或超时');
      }
      if(intent.inFlight)throw denied('E_BUSY','本次保存已被使用');
      intent.inFlight=true;return true;
    },
    settle({owner,confirmed=false}={}){
      if(intent?.owner!==owner)return;
      if(intent.inFlight&&intent.stage==='initial'&&intent.action==='set'&&
         intent.renameFrom!==null&&confirmed===true){
        // The trusted Host has independently verified the new Cookie write.
        // Release exactly one removal of the pre-bound OLD name on this path.
        intent.inFlight=false;intent.stage='remove';return;
      }
      intent=null;
    },
    close(owner,ref){
      const closed=Boolean(intent&&intent.owner===owner&&intent.ref===ref);
      if(closed)intent=null;
      return {closed};
    },
    revoke(){intent=null;}
  });
}
