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
  // The XMind converter promotes a unique, matching overarching heading
  // to the root topic. The Markdown outline must mirror that exact hierarchy,
  // not repeat the same title as a redundant first child.
  const direct=tree.children;
  const headings=direct.filter(item=>item.kind==='heading');
  const heading=headings.length===1?headings[0]:null;
  const at=heading?direct.indexOf(heading):-1;
  const title=tree.title||'回答概览';
  const matches=heading&&(heading.title===title||
    (title.endsWith('…')&&heading.title.startsWith(title.slice(0,-1))));
  const safe=at>=0&&direct.every((item,i)=>i===at||
    (i<at&&item.kind==='paragraph'));
  const promote=matches&&safe;
  const visible=promote?[...direct.slice(0,at),...(heading.children||[])]:direct;
  const rootNote=promote?[tree.content,heading.content].filter(Boolean).join('\n'):tree.content;
  let count=0;
  function notes(text,level){
    if(!text)return;
    for(const line of String(text).split(/\r?\n/))
      lines.push('  '.repeat(level)+'> '+escapeText(line));
  }
  notes(rootNote,0);
  function walk(nodes,depth){
    if(depth>10)throw new Error('E_XMIND_OUTLINE_LIMIT');
    for(const item of nodes){
      if(++count>160)throw new Error('E_XMIND_OUTLINE_LIMIT');
      lines.push('  '.repeat(depth)+'- '+escapeText(item.title||'列表项'));
      notes(item.content,depth+1);
      if(item.children?.length)walk(item.children,depth+1);
    }
  }
  walk(visible,0);
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


// Validate the actual SDK archive and semantic content, not merely its PK header.
// This runs inside the same approved XMind frame that already owns JSZip.
export async function verifyXmindWorkbook(sdk,blob,tree){
  await verifyXmindZip(blob);
  if(typeof sdk?.JSZip!=='function'||!tree||!Array.isArray(tree.children))
    throw Object.assign(new Error('无法核对 XMind 工作簿'),{code:'E_XMIND_EXPORT_CONTENT'});
  const invalid=()=>Object.assign(new Error('导出的 XMind 与当前回复不一致'),
    {code:'E_XMIND_EXPORT_CONTENT'});
  try{
    const zip=await new sdk.JSZip().loadAsync(
      new Uint8Array(await blob.arrayBuffer()),{checkCRC32:true});
    const entry=zip.file('content.json');
    if(!entry||entry._data?.uncompressedSize>8*1024*1024)throw invalid();
    const sheet=JSON.parse(await entry.async('string'))?.[0];
    const root=sheet?.rootTopic;
    if(!root)throw invalid();
    // Mirror only the converter's semantic promotion rule. This is archive
    // verification, not another drawing, ZIP generation, or XMind engine.
    const direct=tree.children;
    const headings=direct.filter(item=>item.kind==='heading');
    const heading=headings.length===1?headings[0]:null;
    const at=heading?direct.indexOf(heading):-1;
    const title=tree.title||'回答概览';
    const matches=heading&&(heading.title===title||
      (title.endsWith('…')&&heading.title.startsWith(title.slice(0,-1))));
    const safe=at>=0&&direct.every((item,i)=>i===at||
      (i<at&&item.kind==='paragraph'));
    const promote=matches&&safe;
    const expected=promote?[...direct.slice(0,at),...heading.children]:direct;
    const note=promote?[tree.content,heading.content].filter(Boolean).join('\n'):tree.content;
    let count=0;
    const check=(actual,expectedTitle,expectedNote,expectedChildren,depth)=>{
      if(depth>11||String(actual?.title??'')!==String(expectedTitle??''))throw invalid();
      if(expectedNote&&actual?.notes?.plain?.content!==expectedNote)throw invalid();
      const children=actual?.children?.attached||[];
      if(children.length!==expectedChildren.length)throw invalid();
      if(++count>161)throw invalid();
      for(let i=0;i<children.length;i++){
        const child=expectedChildren[i];
        check(children[i],child.title||'',child.content||'',child.children||[],depth+1);
      }
    };
    check(root,title,note||'',expected,0);
    return Object.freeze({topicCount:count,byteLength:blob.size});
  }catch(error){
    if(error?.code==='E_XMIND_EXPORT_CONTENT')throw error;
    throw Object.assign(new Error('无法解析导出的 XMind 内容'),
      {code:'E_XMIND_EXPORT_CONTENT',cause:error});
  }
}


export async function verifyPngBlob(blob){
  if(!blob||!Number.isSafeInteger(blob.size)||blob.size<512||
     blob.size>30*1024*1024||typeof blob.slice!=='function')
    throw Object.assign(new Error('PNG 文件超出限制'),{code:'E_XMIND_PNG_SIZE'});
  const bytes=new Uint8Array(await blob.slice(0,24).arrayBuffer());
  const signature=[137,80,78,71,13,10,26,10];
  const valid=signature.every((value,index)=>bytes[index]===value)&&
    bytes[12]===73&&bytes[13]===72&&bytes[14]===68&&bytes[15]===82;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(!valid||width<100||height<100||width>8192||height>8192||
    width*height>24_000_000)
    throw Object.assign(new Error('PNG 文件头或完整尺寸无效'),
      {code:'E_XMIND_PNG_INVALID'});
  return blob;
}
