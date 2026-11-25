// Trusted Side Panel only. This gate never grants a Chrome permission.
// Every chunk still goes through exact Host authorization and readback.
export const COOKIE_IMPORT_INTENT_TTL_MS=120000;
export const COOKIE_IMPORT_INTENT_LIMIT=1000;
export const COOKIE_IMPORT_BATCH_BUDGET_MS=15000;
// The bridge gives begin 8 seconds. Leave time to deliver the denial to it.
export const COOKIE_IMPORT_BEGIN_BUDGET_MS=7000;
const denied=(code,message)=>Object.assign(new Error(message),{code});
export function createCookieImportAdmission(budget){
  const startedAt=Date.now(),elapsedDeadline=performance.now()+budget;
  let expiresAt=startedAt+budget,timer,submitted=false,expired=false,reject;
  const expire=()=>denied('E_COOKIE_BATCH_EXPIRED','导入等待超时；尚未提交写入');
  const expiry=new Promise((_,fail)=>{reject=fail;});
  const remaining=()=>Math.min(expiresAt-Date.now(),elapsedDeadline-performance.now());
  const check=()=>{if(expired||remaining()<=0)throw expire();};
  const stop=()=>clearTimeout(timer);
  const schedule=()=>{
    stop();
    timer=setTimeout(()=>{expired=true;reject(expire());},Math.max(0,remaining()));
  };
  schedule();
  return {startedAt,expiry,check,stop,get submitted(){return submitted;},
    cap(at){expiresAt=Math.min(expiresAt,at);check();schedule();},
    workerDeadline(){check();return Math.min(expiresAt,Math.floor(Date.now()+remaining()));},
    submit(){check();submitted=true;stop();}};
}
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
    start({owner,origin,document,verifiedUserActivation,multiOrigin=false,startedAt=now()}){
      if(verifiedUserActivation!==true)
        throw denied('E_USER_GESTURE_REQUIRED','请重新点击导入按钮');
      if(typeof owner!=='string'||!owner||typeof origin!=='string'||
         !/^https?:\/\//.test(origin)||!validDocument(document,origin))
        throw denied('E_SCHEMA','无效的 Cookie 导入范围');
      if(intent?.inFlight)throw denied('E_BUSY','当前 Cookie 导入仍在写入');
      const expiresAt=startedAt+COOKIE_IMPORT_INTENT_TTL_MS;
      if(expiresAt<=now())throw denied('E_COOKIE_BATCH_EXPIRED','导入确认已过期');
      intent={owner,origin,document:Object.freeze(Object.fromEntries(DOCUMENT_KEYS.map(key=>[key,document[key]]))),multiOrigin:multiOrigin===true,ref:++sequence,expiresAt,used:0,inFlight:false};
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
      return intent.ref;
    },
    expiresAt(owner,ref){
      return intent?.owner===owner&&intent.ref===ref?intent.expiresAt:0;
    },
    settle({owner,ref,count,confirmed}){
      if(!intent||intent.owner!==owner||intent.ref!==ref)return;
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
