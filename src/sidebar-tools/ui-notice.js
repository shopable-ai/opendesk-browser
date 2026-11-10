// Presentation-only notification payload for installed Sidebar Tools.
// No HTML, callback, arbitrary actions, page injection, browser notifications,
// trusted update events, or installation authority can pass this boundary.
export const TOOL_UI_NOTICE_MAX_LENGTH=160;
export const TOOL_UI_NOTICE_CAPTION_MAX_LENGTH=120;
export const TOOL_UI_NOTICE_RATE_LIMIT=3;
export const TOOL_UI_NOTICE_WINDOW_MS=60000;
export const TOOL_UI_NOTICE_DEFAULT_TIMEOUT_MS=5000;
export const TOOL_UI_NOTICE_MAX_TIMEOUT_MS=15000;
export const TOOL_UI_NOTICE_MAX_VISIBLE=3;
// A handle does not extend a tool's authority or the three-per-minute creation budget.
export const TOOL_UI_NOTICE_HANDLE_TTL_MS=30*60*1000;
export const TOOL_UI_NOTICE_HANDLE_MAX_UPDATES=12;
export const TOOL_UI_NOTICE_HANDLE_REPLY_TIMEOUT_MS=2400;
export const TOOL_UI_NOTICE_TYPES=Object.freeze([
  'info','success','warning','error','positive','negative'
]);
export const TOOL_UI_NOTICE_POSITIONS=Object.freeze([
  'top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'
]);
const allowedKeys=new Set(['message','type','caption','position','timeout','group']);
const invalidText=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
function plainObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype;
}
function textValue(value,max){
  if(typeof value!=='string'||value.length>max)return null;
  const trimmed=value.trim();
  return trimmed&&trimmed.length<=max&&!invalidText.test(trimmed)?trimmed:null;
}
export function normalizeToolUiNotice(value){
  // Quasar-like shorthand remains pure text after normalizing the same schema.
  if(typeof value==='string')value={message:value};
  if(!plainObject(value)||!Object.hasOwn(value,'message')||
     Object.keys(value).some(key=>!allowedKeys.has(key)))return null;
  const message=textValue(value.message,TOOL_UI_NOTICE_MAX_LENGTH);
  if(!message)return null;
  const result={message};
  if(Object.hasOwn(value,'type')){
    const type=value.type;
    if(!TOOL_UI_NOTICE_TYPES.includes(type))return null;
    result.type=type==='positive'?'success':type==='negative'?'error':type;
  }
  if(Object.hasOwn(value,'caption')){
    const caption=textValue(value.caption,TOOL_UI_NOTICE_CAPTION_MAX_LENGTH);
    if(!caption)return null;
    result.caption=caption;
  }
  if(Object.hasOwn(value,'position')){
    if(!TOOL_UI_NOTICE_POSITIONS.includes(value.position))return null;
    result.position=value.position;
  }
  if(Object.hasOwn(value,'timeout')){
    const timeout=value.timeout;
    if(!Number.isSafeInteger(timeout)||
       (timeout!==0&&(timeout<1000||timeout>TOOL_UI_NOTICE_MAX_TIMEOUT_MS)))return null;
    result.timeout=timeout;
  }
  if(Object.hasOwn(value,'group')){
    if(typeof value.group!=='boolean')return null;
    result.group=value.group;
  }
  return Object.freeze(result);
}

// One live frame / instance may request a few UI notices, not flood the Host.
// A new instance receives a separate short-lived budget, never privileges.
export function createToolUiNoticeRateGate({
  now=()=>Date.now(),limit=TOOL_UI_NOTICE_RATE_LIMIT,
  windowMs=TOOL_UI_NOTICE_WINDOW_MS
}={}){
  let owner=null,windowStart=0,count=0;
  function admit(instance){
    if(typeof instance!=='string'||!instance)return {accepted:false,retryAfterMs:0};
    const time=now();
    if(!Number.isFinite(time))return {accepted:false,retryAfterMs:0};
    if(owner!==instance||time<windowStart||time-windowStart>=windowMs){
      owner=instance;windowStart=time;count=0;
    }
    if(count>=limit)return {accepted:false,
      retryAfterMs:Math.max(1,Math.ceil(windowMs-(time-windowStart)))};
    count++;
    return {accepted:true,retryAfterMs:0};
  }
  return Object.freeze({admit,allow(instance){return admit(instance).accepted;}});

}
