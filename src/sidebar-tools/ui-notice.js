// Presentation-only notification payload for installed Sidebar Tools.
// This contract never grants page injection, browser notifications, update
// installation or access to the trusted Host DOM.
export const TOOL_UI_NOTICE_MAX_LENGTH=160;
export const TOOL_UI_NOTICE_RATE_LIMIT=3;
export const TOOL_UI_NOTICE_WINDOW_MS=60000;

export function normalizeToolUiNotice(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).length!==1||!Object.hasOwn(value,'message'))return null;
  const message=value.message;
  if(typeof message!=='string'||message.length>TOOL_UI_NOTICE_MAX_LENGTH)return null;
  const trimmed=message.trim();
  if(!trimmed||trimmed.length>TOOL_UI_NOTICE_MAX_LENGTH||
     /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(trimmed))return null;
  return Object.freeze({message:trimmed});
}

// One live frame / instance may request a few UI notices, not flood the Host.
// New instance receives its own limited budget, never installation privileges.
export function createToolUiNoticeRateGate({
  now=()=>Date.now(),limit=TOOL_UI_NOTICE_RATE_LIMIT,
  windowMs=TOOL_UI_NOTICE_WINDOW_MS
}={}){
  let owner=null,windowStart=0,count=0;
  return Object.freeze({
    allow(instance){
      if(typeof instance!=='string'||!instance)return false;
      const time=now();
      if(!Number.isFinite(time))return false;
      if(owner!==instance||time<windowStart||time-windowStart>=windowMs){
        owner=instance;windowStart=time;count=0;
      }
      if(count>=limit)return false;
      count++;
      return true;
    }
  });
}
