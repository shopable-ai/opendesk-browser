(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const q=id=>root.querySelector('#'+id);
const input=q('clip-source'),display=q('clip-preview'),state=q('clip-status');
const modes=Array.from(root.querySelectorAll('[data-clip-mode]'));
let mode='article',version=0,record=null,markdown='',exportBusy=false;
const say=(value,error=false)=>{state.textContent=String(value);state.dataset.error=String(error);};
const setExportBusy=busy=>{exportBusy=busy;q('clip-copy').disabled=busy;q('clip-download').disabled=busy;};
const notes=globalThis.OpenDeskClipNotes?.create?.({
 root,request,sdk:globalThis.OpenDeskSDK.browser,onStatus:say
});
const escapeLabel=s=>String(s||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().replace(/[\[\]\\]/g,'\\$&')||'网页链接';
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').slice(0,900);
const cite=r=>'来源：['+escapeLabel(r.title)+']('+r.source+')';
const previewNode=(tag,content)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;return n;};
function previewUrl(value,image=false){
 try{
  const url=new URL(value);
  if(url.username||url.password||/[\u0000-\u001f\u007f]/.test(value)||
     !(['http:','https:'].includes(url.protocol)||(!image&&['mailto:','tel:'].includes(url.protocol))))return null;
  return url.href;
 }catch{return null;}
}
function previewInline(text,parent){
 const tokens=/(!?\[[^\]\n]{0,160}\]\([^\)\n]{1,2048}\)|\x60[^\x60\n]*\x60|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
 let last=0,match;
 while((match=tokens.exec(text))){
  if(match.index>last)parent.append(previewNode('span',text.slice(last,match.index)));
  const token=match[0];
  if(token.startsWith('[')||token.startsWith('![')){
   const link=token.match(/^(!?)\[([^\]]*)\]\(([^)]+)\)$/);
   const href=link&&previewUrl(link[3],link[1]==='!');
   if(!href)parent.append(previewNode('span',token));
   else if(link[1]==='!')parent.append(previewNode('span','图片：'+(link[2]||href)));
   else{
    const anchor=previewNode('a',link[2]||href);
    anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';
    parent.append(anchor);
   }
  }else if(token.charCodeAt(0)===96)parent.append(previewNode('code',token.slice(1,-1)));
  else if(token.startsWith('**')||token.startsWith('__'))parent.append(previewNode('strong',token.slice(2,-2)));
  else if(token.startsWith('~~'))parent.append(previewNode('del',token.slice(2,-2)));
  else parent.append(previewNode('em',token.slice(1,-1)));
  last=tokens.lastIndex;
 }
 if(last<text.length)parent.append(previewNode('span',text.slice(last)));
}
function renderPreview(content){
 const lines=content.replace(/\r\n?/g,'\n').split('\n'),out=document.createDocumentFragment();
 let paragraph=[],code=null,codeFence='',lists=[],quote=null,tableBody=null;
 const flush=()=>{if(paragraph.length){const p=previewNode('p');previewInline(paragraph.join(' '),p);out.append(p);paragraph=[];}};
 const end=()=>{flush();lists=[];quote=null;tableBody=null;};
 const cells=line=>line.replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(x=>x.trim().replace(/\\\|/g,'|'));
 const row=(tag,line,parent)=>{const tr=previewNode('tr');for(const value of cells(line).slice(0,24)){
  const td=previewNode(tag);previewInline(value,td);tr.append(td);
 }parent.append(tr);};
 for(let i=0;i<lines.length;i++){
  const line=lines[i],fence=line.match(/^\s*(\x60{3,}|~{3,})([a-z0-9#+-]*)\s*$/i);
  if(code!==null){
   if(fence&&fence[1][0]===codeFence[0]&&fence[1].length>=codeFence.length){
    const pre=previewNode('pre');pre.append(previewNode('code',code.join('\n')));out.append(pre);code=null;codeFence='';
   }else code.push(line);
   continue;
  }
  if(fence){end();code=[];codeFence=fence[1];continue;}
  if(i===0&&line==='---'){
   const closing=lines.indexOf('---',1);
   if(closing>0){out.append(previewNode('pre',lines.slice(0,closing+1).join('\n')));i=closing;continue;}
  }
  if(!line.trim()){end();continue;}
  if(line.includes('|')&&/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1]||'')){
   end();const table=previewNode('table'),head=previewNode('thead');row('th',line,head);
   tableBody=previewNode('tbody');table.append(head,tableBody);out.append(table);i++;continue;
  }
  if(tableBody&&line.includes('|')){row('td',line,tableBody);continue;}
  tableBody=null;
  const heading=line.match(/^(#{1,6})\s+(.+)$/);
  if(heading){end();const h=previewNode('h'+heading[1].length);previewInline(heading[2],h);out.append(h);continue;}
  if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){end();out.append(previewNode('hr'));continue;}
  const quoted=line.match(/^>\s?(.*)$/);
  if(quoted){flush();lists=[];if(!quote){quote=previewNode('blockquote');out.append(quote);}
   if(quoted[1]){const p=previewNode('p');previewInline(quoted[1],p);quote.append(p);}continue;
  }
  quote=null;
  const item=line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
  if(item){
   const type=item[2].endsWith('.')?'ol':'ul';
   flush();
   const indent=item[1].replace(/\t/g,'    ').length;
   while(lists.length&&lists.at(-1).indent>indent)lists.pop();
   if(lists.at(-1)?.indent===indent&&lists.at(-1).type!==type)lists.pop();
   if(!lists.length||lists.at(-1).indent<indent){
    const node=previewNode(type);
    if(type==='ol')node.setAttribute('start',String(parseInt(item[2],10)));
    const parent=lists.at(-1)?.last;
    (parent||out).append(node);lists.push({indent,type,node,last:null});
   }
   const li=previewNode('li');previewInline(item[3],li);
   lists.at(-1).node.append(li);lists.at(-1).last=li;continue;
  }
  lists=[];paragraph.push(line.trim());
 }
 if(code!==null){const pre=previewNode('pre');pre.append(previewNode('code',code.join('\n')));out.append(pre);}
 flush();display.replaceChildren(out);
}
function refresh(){
 if(!record){
  markdown='';input.value='';q('clip-site').textContent='当前网页';
  q('clip-title').textContent='打开网页，提取文章或选中文字';
  display.replaceChildren();notes?.setClip(null);return;
 }
 let content=mode==='quote'?record.markdown.trim().split('\n').map(x=>x?'> '+x:'>').join('\n')+'\n':record.markdown;
 if(mode!=='link'){
  if(mode==='quote')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='footer')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='yaml'){
   content='---\n'+Object.entries({title:clean(record.title),source:clean(record.source),site:clean(record.site),captured_at:clean(record.capturedAt)}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n\n'+content;
  }
 }
 markdown=content;input.value=content;
 const title=q('clip-title');if(title)title.textContent=clean(record.title);
 notes?.setClip({body:mode==='quote'?content:record.markdown,
   title:record.title,source:record.source});
 renderPreview(content);
}
function reset(text){version++;record=null;q('clip-fetch').disabled=false;refresh();if(text)say(text);}
modes.forEach(b=>b.addEventListener('click',()=>{
 mode=b.dataset.clipMode;modes.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 const action=mode==='article'?'提取当前文章':mode==='link'?'生成链接':
   mode==='quote'?'生成引用':'提取选中文字';
 q('clip-fetch').textContent=action;q('clip-fetch').setAttribute('aria-label',action);
 const hint=q('clip-selection-hint');if(hint)hint.textContent=
  mode==='selection'||mode==='quote'?'请先在网页中选中文字；也可右键直接进入摘录保存流程。':
  '在网页选中文字后，也可右键选择「保存选中内容到我的摘录」。';
 reset(mode==='selection'||mode==='quote'?'请先在网页中选中文字':'点击提取获取内容');
}));
q('clip-meta').addEventListener('change',refresh);
q('clip-fetch').addEventListener('click',async()=>{
 const token=++version;
 record=null;refresh();
 const b=q('clip-fetch');b.disabled=true;say('正在读取授权网页…');
 const operation=mode==='article'?'clip.article':mode==='link'?'clip.link':'clip.selection';
 try{
  const result=await request(operation);
  if(token!==version)return;
  if(typeof result?.markdown!=='string'||!result.markdown||
     typeof result.source!=='string'||!/^https?:\/\//.test(result.source))
    throw Error('剪藏结果无效');
  record=result;q('clip-site').textContent=clean(result.site);refresh();
  say('已提取内容，可保存短摘录、复制或下载 Markdown');
 }catch(e){if(token===version){record=null;refresh();say(e.message||'剪藏失败',true);}}
 finally{if(token===version)b.disabled=false;}
});
q('clip-show-source').addEventListener('click',()=>{
 input.hidden=false;display.hidden=true;
 q('clip-show-source').setAttribute('aria-pressed','true');
 q('clip-show-preview').setAttribute('aria-pressed','false');
});
q('clip-show-preview').addEventListener('click',()=>{
 input.hidden=true;display.hidden=false;
 q('clip-show-source').setAttribute('aria-pressed','false');
 q('clip-show-preview').setAttribute('aria-pressed','true');
});
q('clip-copy').addEventListener('click',async()=>{
 if(exportBusy)return;
 if(!markdown)return say('请先剪藏',true);
 const ticket=version,content=markdown;
 const current=()=>ticket===version&&content===markdown;
 setExportBusy(true);
 try{const response=await globalThis.OpenDeskSDK.browser.clipboard.writeText(content);
  if(!current())return;
  if(!response?.copied)throw Error('复制未确认');say('已复制 Markdown');
 }catch(error){
  if(!current())return;
  if(error?.code==='E_CANCELLED')say('已取消复制');
  else if(error?.code==='E_OUTCOME_UNKNOWN')say('复制结果未知，请检查系统剪贴板，勿重复操作',true);
  else{input.hidden=false;display.hidden=true;input.focus();input.select();
   q('clip-show-source').setAttribute('aria-pressed','true');
   q('clip-show-preview').setAttribute('aria-pressed','false');
   say('自动复制失败，请按 Ctrl/Cmd+C',true);}
 }finally{setExportBusy(false);}
});
q('clip-download').addEventListener('click',async()=>{
 if(exportBusy)return;
 if(!markdown)return say('请先剪藏',true);
 const ticket=version,content=markdown;
 setExportBusy(true);
 const filename=(clean(record?.title).replace(/[\/\\:*?"<>|]/g,'-').replace(/^\.+/,'').trim().slice(0,60)||'web-clip')+'.md';
 try{const done=await globalThis.OpenDeskSDK.browser.downloads.text({text:content,filename});
  if(ticket!==version||content!==markdown)return;
  if(done?.started!==true)throw Error('下载未确认');
  say('已请求下载，请在 Chrome 确认保存');
 }catch(e){
  if(ticket!==version||content!==markdown)return;
  if(e?.code==='E_CANCELLED')say('已取消下载');
  else if(e?.code==='E_OUTCOME_UNKNOWN')say('下载结果未知，请检查 Chrome 下载记录，勿重复操作',true);
  else say('下载失败：'+String(e.message||e),true);
 }finally{setExportBusy(false);}
});
async function readCurrentPage(){
 const ticket=version;
 try{
  const info=await request('currentPage.info');
  if(ticket!==version||record||info?.status!=='available')return;
  const current=new URL(info.url);
  if(!['http:','https:'].includes(current.protocol))return;
  q('clip-site').textContent=current.hostname;
  const title=q('clip-title');if(title)title.textContent=clean(info.title||current.hostname);
 }catch{/* An unavailable active website must not break local notes. */}
}
async function receiveRightClick(){
 // Navigation or mode changes during the one-shot Host call must never
 // resurrect a selection from an older page or overwrite the user's mode.
 const ticket=version;
 try{
  const launch=await globalThis.OpenDeskSDK.browser.launch.consume();
  if(ticket!==version)return;
  if(launch?.toolId!=='web-markdown-clipper'||launch.actionId!=='save-selection'||
     typeof launch.selection!=='string'||!launch.selection.trim()||
     !Number.isFinite(launch.expiresAt)||Date.now()>=launch.expiresAt||
     typeof launch.source?.url!=='string')return;
  const url=new URL(launch.source.url);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;
  // Align the right-click path with trusted safeClipSource: never persist a
  // clicked URL fragment or well-known bearer/token fields in local notes.
  url.hash='';
  for(const key of [...url.searchParams.keys()]){
   if(/^(?:access[_-]?token|id[_-]?token|token|auth(?:orization)?|jwt|api[_-]?key|session(?:[_-]?id)?|secret|password|credential|oauth[_-]?code)$/i.test(key))
    url.searchParams.delete(key);
  }
  // The Host has already checked ticket, document ID, Origin and one-use delivery.
  // Do not silently save: the existing open-self menu opens a prefilled draft.
  version++;mode='selection';
  modes.forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.clipMode===mode)));
  q('clip-fetch').textContent='提取选中文字';
  q('clip-fetch').setAttribute('aria-label','提取选中文字');
  const rich=typeof launch.selectionMarkdown==='string'&&launch.selectionMarkdown.trim();
  record={markdown:rich?launch.selectionMarkdown:launch.selection,title:url.hostname,site:url.hostname,
    source:url.href,capturedAt:new Date().toISOString()};
  q('clip-site').textContent=url.hostname;refresh();
  say(rich?'已载入右键选区及格式，点击「保存摘录」即可保存。':'已载入右键文字（未取得格式，可尝试「提取选中文字」），点击「保存摘录」即可保存。');
 }catch{/* Ordinary opening has no trusted right-click launch ticket. */}
}
root.addEventListener('opendesk-page-changed',()=>{
 reset('网页已变化，请重新剪藏');
 if(notes)void readCurrentPage();
});
refresh();
if(notes){void readCurrentPage();void receiveRightClick();}

})();