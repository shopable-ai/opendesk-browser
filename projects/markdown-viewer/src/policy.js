// Only the currently open local Markdown document is readable.
export const READ_PROTOCOL='opendesk.markdown-viewer.read.v1';
export const MAX_BYTES=4*1024*1024;
export function markdownFile(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='file:'||u.hostname||u.username||u.password)return null;
    if(!/\.(md|markdown)$/i.test(decodeURIComponent(u.pathname)))return null;
    u.hash='';u.search='';return u.href;
  }catch{return null;}
}
export function isPlainMarkdownMime(value){
  return /^text\/(?:plain|(?:x-)?markdown)(?:\s*;|$)/i.test(value||'');
}
export function resolveReference(value,base,{image=false}={}){
  if(typeof value!=='string'||!value||/[\u0000-\u001f\u007f]/u.test(value))return null;
  try{
    let target=value.trim();
    if(/^[a-z]:[\\/]/i.test(target))target='file:///'+target.replace(/\\/g,'/');
    const u=new URL(target,base);
    if(u.username||u.password)return null;
    if(u.protocol==='file:')return u.hostname?null:u.href;
    if(!image&&['https:','http:','mailto:','tel:'].includes(u.protocol))return u.href;
    // Remote and data images are not loaded automatically from private documents.
    return null;
  }catch{return null;}
}
export function headingSlug(value){
  return String(value).trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s+/gu,'-')||'section';
}
export function uniqueSlug(value,used){
  const base=headingSlug(value);let slug=base,n=0;
  while(used.has(slug))slug=base+'-'+(++n);
  used.add(slug);return slug;
}
export function blockHash(value){
  let h=2166136261;for(const c of String(value).trim()){h=Math.imul(h^c.codePointAt(0),16777619);}
  return (h>>>0).toString(36);
}
export function decodeText(value){
  const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',copy:'©',reg:'®',hellip:'…',mdash:'—',ndash:'–'};
  return String(value??'').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,(all,key)=>{
    if(key[0]==='#'){
      const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
      return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
    }
    return Object.hasOwn(names,key)?names[key]:all;
  });
}
