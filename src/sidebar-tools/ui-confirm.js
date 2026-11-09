// Ordinary presentation data only. No callbacks, identity or authority fields.
export const TOOL_UI_CONFIRM_TIMEOUT_MS=120000;
export const TOOL_UI_CONFIRM_CLIENT_TIMEOUT_MS=125000;
const keys=Reflect.ownKeys,prototype=Object.getPrototypeOf,descriptor=Object.getOwnPropertyDescriptor;
const objectPrototype=Object.prototype;
const freeze=Object.freeze;
function fields(value,allowed){
  if(!value||typeof value!=='object'||![null,objectPrototype].includes(prototype(value)))return null;
  const result=Object.create(null);
  for(const key of keys(value)){
    if(typeof key!=='string'||!allowed.includes(key))return null;
    const field=descriptor(value,key);
    if(!field||!Object.hasOwn(field,'value'))return null;
    result[key]=field.value;
  }
  return result;
}
function text(value,max,multiline=false){
  if(typeof value!=='string'||value.length>max||
    (multiline?/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u:
      /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u).test(value))return null;
  const trimmed=value.trim();return trimmed&&trimmed.length<=max?trimmed:null;
}
export function normalizeToolUiConfirmOptions(value){
  try{
    const data=fields(value,['title','message','confirmLabel','cancelLabel','tone']);
    if(!data)return null;
    const title=text(data.title,80),message=text(data.message,1200,true),confirmLabel=text(data.confirmLabel,32);
    if(!title||!message||!confirmLabel)return null;
    const result={title,message,confirmLabel};
    if(Object.hasOwn(data,'cancelLabel')){
      const cancelLabel=text(data.cancelLabel,32);if(!cancelLabel)return null;result.cancelLabel=cancelLabel;
    }
    if(Object.hasOwn(data,'tone')){
      if(data.tone!=='neutral'&&data.tone!=='danger')return null;result.tone=data.tone;
    }
    return freeze(result);
  }catch{return null;}
}
export function normalizeToolUiConfirmResult(value){
  try{
    const data=fields(value,['action','reason']);if(!data)return null;
    if(data.action==='confirm'&&!Object.hasOwn(data,'reason'))return freeze({action:'confirm'});
    if(data.action==='cancel'&&['user','escape','aborted','invalidated','expired'].includes(data.reason))
      return freeze({action:'cancel',reason:data.reason});
    return null;
  }catch{return null;}
}
