// A real click in the admitted official UI permits one delivery for its current
// website. The existing Browser Host still approves and consumes the exact bytes.
export function createCookieExportIntentGate({now=()=>Date.now()}={}){
  let intent=null,sequence=0;
  const denied=code=>Object.assign(new Error('导出操作已失效，请重新点击复制或下载'),{code});
  return Object.freeze({
    start({owner,origin,operation,grantEpoch,verifiedUserActivation}){
      if(verifiedUserActivation!==true)throw denied('E_USER_GESTURE_REQUIRED');
      if(typeof owner!=='string'||!owner||typeof grantEpoch!=='string'||!grantEpoch||!/^https?:\/\//.test(origin)||
         !['browser.clipboard.writeText','browser.downloads.text'].includes(operation))
        throw denied('E_SCHEMA');
      intent={owner,origin,operation,grantEpoch,ref:++sequence,expiresAt:now()+30000};
      return {authorized:true,ref:intent.ref};
    },
    consume({owner,origin,operation,grantEpoch}){
      if(!intent||intent.owner!==owner)return false;
      const current=intent;intent=null;
      if(now()>=current.expiresAt||current.origin!==origin||current.operation!==operation||current.grantEpoch!==grantEpoch)
        throw denied('E_DOCUMENT_CHANGED');
      return true;
    },
    close(owner,ref){
      const closed=Boolean(intent&&intent.owner===owner&&intent.ref===ref);
      if(closed)intent=null;
      return {closed};
    },
    revoke(){intent=null;}
  });
}
