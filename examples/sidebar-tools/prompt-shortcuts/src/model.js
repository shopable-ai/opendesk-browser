(function(){
'use strict';
// Packaged as a pinned Classic dependency; statically imported by the trusted page.
const fail=msg=>{const e=new Error(msg);e.code='E_PROMPT_DATA';throw e;};
const parts=text=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),v=>v.segment);
const visible=part=>/[\p{L}\p{N}\p{M}\p{P}\p{S}]/u.test(part);
const auto=body=>parts(body).filter(visible).slice(0,2).join('');
const validLabel=label=>{const p=parts(label);return p.length>=1&&p.length<=2&&p.every(visible);};
const defaults=()=>({schema:1,items:[],settings:{webButtons:true}});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function draft(input,previous=null,newId=()=>crypto.randomUUID()){
  if(typeof input?.body!=='string'||!input.body.trim())fail('提示词内容是唯一必填项');
  const label=typeof input.label==='string'?input.label.trim():'';
  const name=typeof input.name==='string'?input.name.trim():'';
  if(label&&!validLabel(label))fail('短标签只能是 1–2 个 Unicode 可见字素');
  if(name&&name.length>60)fail('显示名称最多 60 个字符');
  const fallback=auto(input.body);
  if(!fallback)fail('请输入包含可见字符的正文');
  return {id:previous?.id||newId(),body:input.body,label:label||fallback,name:name||fallback,
    labelAuto:!label,nameAuto:!name,shape:input.shape==='round'?'round':'square',
    enabled:input.enabled!==false,order:previous?.order??0};
}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,64}$/.test(id);
function load(value){
  if(value==null)return defaults();
  if(!value||value.schema!==1||!Array.isArray(value.items)||value.items.length>80||
      typeof value.settings?.webButtons!=='boolean')fail('提示词存储无效，已拒绝覆盖');
  const seen=new Set();
  const items=value.items.map(v=>{
    if(!v||!validId(v.id)||seen.has(v.id)||typeof v.body!=='string'||!v.body.trim()||
      typeof v.label!=='string'||!validLabel(v.label)||typeof v.name!=='string'||!v.name.trim()||v.name.length>60||
      !['square','round'].includes(v.shape)||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.order)||v.order<0)
      fail('某条提示词数据无效，已拒绝覆盖');
    seen.add(v.id);
    const fallback=auto(v.body);if(!fallback)fail('提示词正文无可见字符');
    // Old saved entries without auto flags stay manual.
    const labelAuto=v.labelAuto===true,nameAuto=v.nameAuto===true;
    return {...v,labelAuto,nameAuto,label:labelAuto?fallback:v.label,name:nameAuto?fallback:v.name};
  });
  return {schema:1,items:items.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),
    settings:{webButtons:value.settings.webButtons}};
}
Object.defineProperty(globalThis,'OpenDeskPromptShortcutsModel',{
  value:Object.freeze({parts,visible,auto,validLabel,defaults,bytes,draft,load}),configurable:true
});
})();
