(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const q=id=>root.querySelector('#'+id);
const input=q('clip-source'),display=q('clip-preview'),state=q('clip-status');
const modes=Array.from(root.querySelectorAll('[data-clip-mode]'));
let mode='article',version=0,record=null,markdown='',exportBusy=false;
const say=(value,error=false)=>{state.textContent=String(value);state.dataset.error=String(error);};
const setExportBusy=busy=>{exportBusy=busy;q('clip-copy').disabled=busy;q('clip-download').disabled=busy;};
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
 let paragraph=[],code=null,codeFence='',list=null,quote=null,tableBody=null;
 const flush=()=>{if(paragraph.length){const p=previewNode('p');previewInline(paragraph.join(' '),p);out.append(p);paragraph=[];}};
 const end=()=>{flush();list=null;quote=null;tableBody=null;};
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
  if(quoted){flush();list=null;if(!quote){quote=previewNode('blockquote');out.append(quote);}
   if(quoted[1]){const p=previewNode('p');previewInline(quoted[1],p);quote.append(p);}continue;
  }
  quote=null;
  const item=line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
  if(item){
   const type=item[2].endsWith('.')?'ol':'ul';
   if(!list||list.tagName.toLowerCase()!==type){end();list=previewNode(type);out.append(list);}
   const li=previewNode('li');previewInline(item[3],li);list.append(li);continue;
  }
  list=null;paragraph.push(line.trim());
 }
 if(code!==null){const pre=previewNode('pre');pre.append(previewNode('code',code.join('\n')));out.append(pre);}
 flush();display.replaceChildren(out);
}
function refresh(){
 if(!record){markdown='';input.value='';q('clip-site').textContent='当前网页';display.replaceChildren();return;}
 let content=mode==='quote'?record.markdown.trim().split('\n').map(x=>x?'> '+x:'>').join('\n')+'\n':record.markdown;
 if(mode!=='link'){
  if(mode==='quote')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='footer')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='yaml'){
   content='---\n'+Object.entries({title:clean(record.title),source:clean(record.source),site:clean(record.site),captured_at:clean(record.capturedAt)}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n\n'+content;
  }
 }
 markdown=content;input.value=content;
 renderPreview(content);
}
function reset(text){version++;record=null;q('clip-fetch').disabled=false;refresh();if(text)say(text);}
modes.forEach(b=>b.addEventListener('click',()=>{
 mode=b.dataset.clipMode;modes.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 reset(mode==='selection'||mode==='quote'?'请先在网页中选中文字':'点击剪藏获取内容');
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
  say('已获取内容，请检查 Markdown');
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
  else{input.hidden=false;display.hidden=true;input.focus();input.select();say('自动复制失败，请按 Ctrl/Cmd+C',true);}
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
root.addEventListener('opendesk-page-changed',()=>reset('网页已变化，请重新剪藏'));
refresh();
})();