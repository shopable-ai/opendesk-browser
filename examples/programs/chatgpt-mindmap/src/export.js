// The current reply's semantic tree only; never reverse-engineer original Markdown.
export const MAX_XMIND_BYTES=25*1024*1024;
const invalid=/[<>:"/\\|?*\x00-\x1f\x7f]/g;
export function exportFileBase(title){
  const name=Array.from(String(title||'').replace(invalid,' ').replace(/\s+/g,' ').trim())
    .slice(0,72).join('').replace(/^[. ]+|[. ]+$/g,'');
  return !name||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)
    ?'本条回复-思维导图':name;
}
const escapeText=value=>String(value??'').replace(/\s+/g,' ')
  .replace(/([\\*_{}\[\]()#+.!<>|~-])/g,'\\$1').trim();
export function buildOutlineMarkdown(tree){
  if(!tree||!Array.isArray(tree.children))throw new Error('E_XMIND_OUTLINE_TREE');
  const lines=['# '+escapeText(tree.title||'本条回复')];
  let count=0;
  function notes(text,level){
    if(!text)return;
    for(const line of String(text).split(/\r?\n/))
      lines.push('  '.repeat(level)+'> '+escapeText(line));
  }
  notes(tree.content,0);
  function walk(nodes,depth){
    if(depth>10)throw new Error('E_XMIND_OUTLINE_LIMIT');
    for(const item of nodes){
      if(++count>160)throw new Error('E_XMIND_OUTLINE_LIMIT');
      lines.push('  '.repeat(depth)+'- '+escapeText(item.title||'列表项'));
      notes(item.content,depth+1);
      if(item.children?.length)walk(item.children,depth+1);
    }
  }
  walk(tree.children,0);
  return lines.join('\n')+'\n';
}
export async function verifyXmindZip(blob){
  if(!blob||!Number.isSafeInteger(blob.size)||blob.size<4||
    blob.size>MAX_XMIND_BYTES||typeof blob.slice!=='function')
    throw new Error('E_XMIND_EXPORT_SIZE');
  const bytes=new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)
    throw new Error('E_XMIND_EXPORT_NOT_ZIP');
  return blob;
}
