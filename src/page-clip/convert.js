// Fixed-source offline DOM-to-Markdown converter; never alters the original DOM.
export const CLIP_MAX_BYTES=150000;
const TICK=String.fromCharCode(96);
const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','IFRAME','OBJECT','EMBED','CANVAS','SVG',
  'NAV','ASIDE','FOOTER','FORM','BUTTON','INPUT','SELECT','TEXTAREA','OPTION','DIALOG']);
const BLOCK=new Set(['ARTICLE','MAIN','SECTION','DIV','HEADER','FIGURE','FIGCAPTION',
  'P','H1','H2','H3','H4','H5','H6','PRE','BLOCKQUOTE','UL','OL','TABLE','HR','DL']);
const escapeText=value=>String(value||'').replace(/\\/g,'\\\\').replace(/([*_[\]\x60<>])/g,'\\$1');
const clean=value=>String(value||'').replace(/\u0000/g,'').replace(/\r\n?/g,'\n');
const squeeze=value=>value.replace(/[ \t]+/g,' ').replace(/ *\n */g,' ').trim();
export function safeMarkdownUrl(value,base,{image=false}={}){
  try{
    const url=new URL(String(value||''),base);
    if(url.username||url.password)return null;
    if(!['https:','http:'].includes(url.protocol)&&!(!image&&['mailto:','tel:'].includes(url.protocol)))return null;
    return url.href.replace(/[\u0000-\u001f\u007f]/g,'');
  }catch{return null;}
}
function excluded(el){
  if(el.nodeType!==1)return false;
  if(SKIP.has(el.tagName)||el.hidden||el.getAttribute('aria-hidden')==='true'||
    el.matches?.('[data-opendesk-toc-root],[data-opendesk-clip-root],[inert],.ad,.ads,.advertisement,.cookie-banner,[role="navigation"],[role="banner"],[role="contentinfo"]'))return true;
  const cls=String(el.className?.baseVal||el.className||'');
  if(/\b(?:ad|ads|advert|advertisement|sponsor|paywall|cookie-consent|social-share|related-posts)\b/i.test(cls))return true;
  const style=el.getAttribute('style')||'';
  if(/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style))return true;
  try{
    if(el.ownerDocument?.defaultView&&el.isConnected){
      const cs=el.ownerDocument.defaultView.getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden')return true;
    }
  }catch{}
  return false;
}
function budget(state,node){
  if(++state.nodes>9000)throw new Error('网页结构超过剪藏处理上限，请改用选区');
  if(node?.nodeType===3&&node.textContent?.length>CLIP_MAX_BYTES)throw new Error('网页文本过大，请缩小选区');
}
function inlineChildren(el,state){return [...el.childNodes].map(n=>inline(n,state)).join('');}
function inline(node,state){
  budget(state,node);
  if(node.nodeType===3)return escapeText(clean(node.nodeValue)).replace(/\s+/g,' ');
  if(node.nodeType!==1||excluded(node))return '';
  const tag=node.tagName;
  if(tag==='BR')return '  \n';
  if(tag==='IMG'){
    const url=safeMarkdownUrl(node.getAttribute('src')||node.getAttribute('data-src'),state.base,{image:true});
    return url?'!['+escapeText(node.getAttribute('alt')||'')+']('+url+')':'';
  }
  if(tag==='A'){
    const label=squeeze(inlineChildren(node,state));
    const href=safeMarkdownUrl(node.getAttribute('href'),state.base);
    return href?'['+(label||escapeText(href))+']('+href+')':label;
  }
  if(tag==='CODE'&&node.parentElement?.tagName!=='PRE'){
    const value=clean(node.textContent),fence=value.includes(TICK)?TICK+TICK:TICK;
    return fence+(value.startsWith(TICK)||value.endsWith(TICK)?' '+value+' ':value)+fence;
  }
  if(tag==='KBD')return TICK+clean(node.textContent).replaceAll(TICK,'')+TICK;
  if(tag==='SPAN'||tag==='MATH'||tag==='ANNOTATION'){
    const tex=node.getAttribute('data-tex')||node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent;
    if(tex&&tex.length<4000&&!/[\u0000-\u001f]/.test(tex))return '$'+tex.replace(/\$/g,'\\$')+'$';
  }
  let value=inlineChildren(node,state);
  if(tag==='STRONG'||tag==='B')value='**'+value.trim()+'**';
  if(tag==='EM'||tag==='I')value='*'+value.trim()+'*';
  if(tag==='S'||tag==='DEL'||tag==='STRIKE')value='~~'+value.trim()+'~~';
  return value;
}
function codeBlock(node,state){
  budget(state,node);
  const code=node.querySelector?.('code')||node;
  let lang=String(code.className||'').match(/(?:^|\s)(?:language|lang)-([a-z0-9#+-]+)/i)?.[1]||
    code.getAttribute?.('data-language')||'';
  lang=/^[a-z0-9#+-]{1,30}$/i.test(lang)?lang:'';
  const content=clean(code.textContent).replace(/\n+$/,'');
  if(!content.trim())return '';
  const runs=content.match(new RegExp(TICK+'{3,}','g'))||[];
  const width=Math.max(3,...runs.map(s=>s.length+1));
  if(width>80)throw new Error('代码块分隔符异常，请缩小选区');
  const fence=TICK.repeat(width);
  return fence+lang+'\n'+content+'\n'+fence+'\n\n';
}
function renderTable(node,state){
  const rows=[...node.querySelectorAll('tr')].slice(0,121);
  if(!rows.length||rows.length>120)throw new Error('表格过大，请缩小选区');
  const lines=[];
  for(const row of rows){
    const cells=[...row.children].filter(cell=>cell.matches('th,td'));
    if(cells.length>24)throw new Error('表格列数超过 24');
    if(cells.some(cell=>Number(cell.getAttribute('rowspan')||1)>1||Number(cell.getAttribute('colspan')||1)>1))
      throw new Error('表格含合并单元格，无法无损转换，请剪藏选区并检查');
    lines.push(cells.map(cell=>squeeze(inlineChildren(cell,state)).replace(/\|/g,'\\|')).join(' | '));
  }
  if(!lines[0])return '';
  const cols=(lines[0].match(/ \| /g)||[]).length+1;
  return '| '+lines[0]+' |\n| '+Array(cols).fill('---').join(' | ')+' |\n'+
    lines.slice(1).map(l=>'| '+l+' |').join('\n')+'\n\n';
}
function renderList(node,state,depth){
  if(depth>6)throw new Error('列表嵌套过深');
  const ordered=node.tagName==='OL',start=Number(node.getAttribute('start')||1);
  return [...node.children].filter(c=>c.tagName==='LI').map((li,i)=>{
    let value='',nested='';
    for(const child of li.childNodes){
      if(child.nodeType===1&&['UL','OL'].includes(child.tagName))nested+=renderList(child,state,depth+1);
      else if(child.nodeType===1&&BLOCK.has(child.tagName)&&child.tagName!=='DIV')value+=renderBlock(child,state,depth+1).trim();
      else value+=inline(child,state);
    }
    const check=li.querySelector(':scope > input[type="checkbox"]');
    const prefix=(ordered?String((Number.isInteger(start)?start:1)+i)+'.':'-')+' ';
    const checkbox=check?'['+(check.checked?'x':' ')+'] ':'';
    return '  '.repeat(depth)+prefix+checkbox+squeeze(value)+(nested?'\n'+nested.trimEnd():'');
  }).join('\n')+'\n\n';
}
function renderBlock(node,state,depth=0){
  budget(state,node);
  if(node.nodeType===3)return squeeze(inline(node,state))?inline(node,state)+'\n\n':'';
  if(node.nodeType===11)return renderChildren(node,state,depth);
  if(node.nodeType!==1||excluded(node))return '';
  const tag=node.tagName;
  if(/^H[1-6]$/.test(tag))return '#'.repeat(Number(tag[1]))+' '+squeeze(inlineChildren(node,state))+'\n\n';
  if(tag==='PRE')return codeBlock(node,state);
  if(tag==='HR')return '---\n\n';
  if(tag==='TABLE')return renderTable(node,state);
  if(tag==='UL'||tag==='OL')return renderList(node,state,depth);
  if(tag==='BLOCKQUOTE'){
    const content=renderChildren(node,state,depth).trim();
    return content.split('\n').map(line=>line?'> '+line:'>').join('\n')+'\n\n';
  }
  if(tag==='P'||tag==='FIGCAPTION')return squeeze(inlineChildren(node,state))+'\n\n';
  if(tag==='IMG')return inline(node,state)+'\n\n';
  if(['DIV','SECTION','ARTICLE','MAIN','HEADER','FIGURE','BODY','DL'].includes(tag))
    return renderChildren(node,state,depth);
  return squeeze(inlineChildren(node,state))+'\n\n';
}
function renderChildren(root,state,depth){
  let pending='',result='';
  const flush=()=>{if(pending.trim())result+=squeeze(pending)+'\n\n';pending='';};
  for(const child of root.childNodes){
    if(child.nodeType===1&&BLOCK.has(child.tagName)){
      flush();result+=renderBlock(child,state,depth);
    }else pending+=inline(child,state);
  }
  flush();return result;
}
export function domToMarkdown(root,base){
  if(!root||typeof root.nodeType!=='number')throw new Error('没有可剪藏的内容');
  const state={base,nodes:0};
  const text=renderBlock(root,state).replace(/\n{3,}/g,'\n\n').trim();
  if(!text)throw new Error('未找到可剪藏的文字');
  if(new TextEncoder().encode(text).length>CLIP_MAX_BYTES)
    throw new Error('正文超过 150 KB，请选择范围缩小剪藏');
  return text+'\n';
}
export function chooseArticle(doc){
  const candidates=[...doc.querySelectorAll('article,[role="main"],main,[itemprop="articleBody"],.article-content,.post-content')]
    .filter(el=>!excluded(el));
  const score=el=>{
    const content=String(el.textContent||''),links=[...el.querySelectorAll('a')].map(a=>a.textContent).join('');
    return Math.min(content.length,40000)+Math.min(el.querySelectorAll('p').length,80)*50-Math.min(links.length,content.length)*0.5;
  };
  candidates.sort((a,b)=>score(b)-score(a));
  const chosen=candidates.find(el=>String(el.textContent||'').trim().length>=120);
  if(!chosen)throw new Error('无法可靠识别文章正文，请在网页选中文字后选择「选区」剪藏');
  return chosen;
}
