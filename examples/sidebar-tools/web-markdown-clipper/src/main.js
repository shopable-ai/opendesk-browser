(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const q=id=>root.querySelector('#'+id);
const input=q('clip-source'),display=q('clip-preview'),state=q('clip-status');
const modes=Array.from(root.querySelectorAll('[data-clip-mode]'));
let mode='article',version=0,pageEpoch=0,pageKey='',pageInfo=null;
let results=Object.create(null),record=null,markdown='',exportBusy=false,extracting=false,saving=false;
const emptyHints=Object.freeze({
 article:'点击「提取当前文章」',
 selection:'请先在网页选中文字',
 quote:'先选择文字，再生成带来源引用',
 link:'生成当前网页链接'
});
const actions=Object.freeze({article:'提取当前文章',selection:'提取选中文字',
 quote:'生成引用',link:'生成链接'});
const say=(value,error=false)=>{state.textContent=String(value);state.dataset.error=String(error);};
const setExportBusy=busy=>{exportBusy=busy;updateExportButtons();};
const notes=globalThis.OpenDeskClipNotes?.create?.({
 root,request,sdk:globalThis.OpenDeskSDK.browser,onStatus:say,
 renderMarkdown:renderPreview,onSaveBusy:onSaveBusyChange
});
const escapeLabel=s=>String(s||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().replace(/[\[\]\\]/g,'\\$&')||'网页链接';
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').slice(0,900);
const safeSource=value=>{
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return '';
 try{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
  url.hash='';
  for(const key of [...url.searchParams.keys()]){
   if(/^(?:access[_-]?token|id[_-]?token|token|auth(?:orization)?|jwt|api[_-]?key|session(?:[_-]?id)?|secret|password|credential|oauth[_-]?code)$/i.test(key))
    url.searchParams.delete(key);
  }
  return url.href.replace(/[()]/g,ch=>ch==='('?'%28':'%29');
 }catch{return '';}
};
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
function renderPreview(content,target=display){
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
 flush();target.replaceChildren(out);
}
function updateExportButtons(){
 q('clip-copy').disabled=!markdown||exportBusy||saving;
 q('clip-download').disabled=!markdown||exportBusy||saving;
}
function updateFetchButton(){
 const button=q('clip-fetch');
 button.textContent=actions[mode];button.setAttribute('aria-label',actions[mode]);
 button.disabled=extracting||saving;
 for(const item of modes){
  item.setAttribute('aria-pressed',String(item.dataset.clipMode===mode));
  item.disabled=saving;
 }
 q('clip-meta').disabled=saving;
 const hint=q('clip-selection-hint');
 if(hint)hint.textContent=mode==='selection'||mode==='quote'
  ?'请先在网页中选中文字；也可右键直接进入摘录保存流程。'
  :'在网页选中文字后，也可右键选择「保存选中内容到我的摘录」。';
}
function onSaveBusyChange(busy){
 saving=Boolean(busy);updateFetchButton();updateExportButtons();
}
function cacheFor(target){
 if(results[target])return results[target];
 if(target==='quote'&&results.selection)return results.quote=results.selection;
 if(target==='selection'&&results.quote)return results.selection=results.quote;
 if(target==='link'){
  const base=results.article||results.selection||results.quote;
  if(base)return results.link={...base,markdown:'['+escapeLabel(base.title)+']('+base.source+')\n',
    mode:'clip.link'};
 }
 return null;
}
function composeMarkdown(raw){
 if(!raw)return '';
 if(mode==='link')return raw.markdown;
 const content=mode==='quote'
  ?raw.markdown.trim().split('\n').map(line=>line?'> '+line:'>').join('\n')+'\n'
  :raw.markdown;
 if(q('clip-meta').value==='footer')return content+'\n'+cite(raw)+'\n';
 if(q('clip-meta').value==='yaml')
  return '---\n'+Object.entries({title:clean(raw.title),source:clean(raw.source),
   site:clean(raw.site),captured_at:clean(raw.capturedAt)})
   .map(([key,value])=>key+': '+JSON.stringify(value)).join('\n')+'\n---\n\n'+content;
 return content;
}
function refresh(){
 record=cacheFor(mode);
 markdown=composeMarkdown(record);
 input.value=markdown;input.placeholder=emptyHints[mode];
 q('clip-site').textContent=record?.site||pageInfo?.site||'当前网页';
 q('clip-title').textContent=record?.title||pageInfo?.title||'打开网页，提取文章或选中文字';
 if(markdown)renderPreview(markdown);
 else{
  const hint=previewNode('p',emptyHints[mode]);hint.className='clip-empty-hint';
  display.replaceChildren(hint);
 }
 notes?.setClip(record?{body:markdown,title:record.title,source:record.source}:null);
 updateExportButtons();updateFetchButton();
 const home=q('clip-home');if(home)home.dataset.clipState=extracting?'extracting':record?'ready':'empty';
}
function invalidate(text='网页已变化，请重新剪藏'){
 version++;pageEpoch++;pageKey='';pageInfo=null;results=Object.create(null);
 extracting=false;refresh();say(text);
}
function selectMode(next){
 if(next===mode||saving||!Object.hasOwn(actions,next))return;
 mode=next;version++;extracting=false;refresh();
 say(record?'已恢复本页'+(next==='link'?'链接':next==='quote'?'引用':next==='selection'?'选区':'文章')+' Markdown':emptyHints[next]);
}
modes.forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.clipMode)));
q('clip-meta').addEventListener('change',()=>{
 if(saving)return;
 version++;refresh();
 say(record?'已按来源格式更新完整 Markdown':emptyHints[mode]);
});
q('clip-fetch').addEventListener('click',async()=>{
 if(saving)return;
 const token=++version,selectedMode=mode;
 if(selectedMode==='selection'||selectedMode==='quote'){
  delete results.selection;delete results.quote;
 }else delete results[selectedMode];
 extracting=true;refresh();say('正在读取授权网页…');
 const operation=selectedMode==='article'?'clip.article':selectedMode==='link'?'clip.link':'clip.selection';
 try{
  const result=await request(operation);
  if(token!==version)return;
  const source=safeSource(result?.source);
  if(typeof result?.markdown!=='string'||!result.markdown.trim()||!source||
     (result.mode&&result.mode!==operation))
   throw Error('剪藏结果无效');
  if(pageKey&&pageKey!==source)throw Error('网页已变化，请重新剪藏');
  pageKey=source;
  const raw={...result,source};
  if(selectedMode==='link')
   raw.markdown='['+escapeLabel(raw.title)+']('+source+')\n';
  if(selectedMode==='selection'||selectedMode==='quote'){
   results.selection=raw;results.quote=raw;
  }else results[selectedMode]=raw;
  extracting=false;refresh();
  say('已提取完整 Markdown，可保存到「我的摘录」、复制或下载');
 }catch(error){
  if(token===version){
   extracting=false;refresh();say(error?.message||'剪藏失败',true);
  }
 }finally{if(token===version){extracting=false;updateFetchButton();}}
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
 const ticket=pageEpoch;
 try{
  const info=await request('currentPage.info');
  if(ticket!==pageEpoch||info?.status!=='available')return;
  const source=safeSource(info.url);
  if(!source)return;
  if(pageKey&&pageKey!==source)invalidate('网页已变化，请重新剪藏');
  pageKey=source;
  let host;
  try{host=new URL(source).hostname;}catch{return;}
  pageInfo={site:host,title:clean(info.title||host)};
  refresh();
 }catch{/* An unavailable active website must not break local notes. */}
}
async function receiveRightClick(){
 // The Host validates the one-use launch document, origin and expiry.
 const ticket=version,epoch=pageEpoch;
 try{
  const launch=await globalThis.OpenDeskSDK.browser.launch.consume();
  if(ticket!==version||epoch!==pageEpoch)return;
  if(launch?.toolId!=='web-markdown-clipper'||launch.actionId!=='save-selection'||
     typeof launch.selection!=='string'||!launch.selection.trim()||
     !Number.isFinite(launch.expiresAt)||Date.now()>=launch.expiresAt)return;
  const source=safeSource(launch.source?.url);
  if(!source||(pageKey&&pageKey!==source))return;
  const host=new URL(source).hostname;
  pageKey=source;
  version++;mode='selection';extracting=false;
  const rich=typeof launch.selectionMarkdown==='string'&&launch.selectionMarkdown.trim();
  const raw={markdown:rich?launch.selectionMarkdown:launch.selection,title:host,site:host,source,
   capturedAt:new Date().toISOString(),mode:'clip.selection'};
  results.selection=raw;results.quote=raw;
  refresh();
  say(rich?'已载入右键选区及格式，点击「保存摘录」即可保存。':
   '已载入右键文字（未取得格式，可尝试「提取选中文字」），点击「保存摘录」即可保存。');
 }catch{/* Ordinary opening has no trusted right-click launch ticket. */}
}
root.addEventListener('opendesk-page-changed',()=>{
 invalidate();if(notes)void readCurrentPage();
});
refresh();
if(notes){void readCurrentPage();void receiveRightClick();}

})();