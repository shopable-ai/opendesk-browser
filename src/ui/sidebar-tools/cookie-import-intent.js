// Trusted Side Panel only. This gate never grants a Chrome permission.
// Every chunk still goes through exact Host authorization and readback.
export const COOKIE_IMPORT_INTENT_TTL_MS=120000;
export const COOKIE_IMPORT_INTENT_LIMIT=1000;
const denied=(code,message)=>Object.assign(new Error(message),{code});
const DOCUMENT_KEYS=['tabId','windowId','documentId','url','origin'];
const sameDocument=(a,b)=>Boolean(a&&b&&DOCUMENT_KEYS.every(key=>a[key]===b[key]));
const validDocument=(document,origin)=>{
  if(!document||!Number.isSafeInteger(document.tabId)||document.tabId<0||
    !Number.isSafeInteger(document.windowId)||document.windowId<0||
    typeof document.documentId!=='string'||!document.documentId||document.documentId.length>160||
    typeof document.url!=='string'||document.origin!==origin)return false;
  try{
    const url=new URL(document.url);
    return ['http:','https:'].includes(url.protocol)&&
      url.origin===origin&&!url.username&&!url.password;
  }catch{return false;}
};
export function createCookieImportIntentGate({now=()=>Date.now()}={}){
  let intent=null,sequence=0;
  return Object.freeze({
    start({owner,origin,document,verifiedUserActivation,multiOrigin=false}){
      if(verifiedUserActivation!==true)
        throw denied('E_USER_GESTURE_REQUIRED','请重新点击导入按钮');
      if(typeof owner!=='string'||!owner||typeof origin!=='string'||
         !/^https?:\/\//.test(origin)||!validDocument(document,origin))
        throw denied('E_SCHEMA','无效的 Cookie 导入范围');
      if(intent?.inFlight)throw denied('E_BUSY','当前 Cookie 导入仍在写入');
      intent={owner,origin,document:Object.freeze(Object.fromEntries(DOCUMENT_KEYS.map(key=>[key,document[key]]))),multiOrigin:multiOrigin===true,ref:++sequence,expiresAt:now()+COOKIE_IMPORT_INTENT_TTL_MS,used:0,inFlight:false};
      return {authorized:true,ref:intent.ref,expiresAt:intent.expiresAt};
    },
    acquire({owner,origin,count,sourceOrigin=origin,document}){
      if(!intent||intent.owner!==owner)return false;
      let destination;
      try{destination=new URL(origin);}catch{}
      if(intent.origin!==sourceOrigin||!validDocument(document,sourceOrigin)||!sameDocument(intent.document,document)||!destination||
         !['http:','https:'].includes(destination.protocol)||
         destination.origin!==origin||destination.username||destination.password||
         (!intent.multiOrigin&&intent.origin!==origin)||now()>=intent.expiresAt){
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
    close(owner,ref){
      const closed=Boolean(intent&&intent.owner===owner&&intent.ref===ref);
      if(closed)intent=null;
      return {closed};
    },
    revoke(){intent=null;}
  });
}
