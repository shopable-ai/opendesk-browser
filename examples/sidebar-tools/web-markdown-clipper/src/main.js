(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const q=id=>root.querySelector('#'+id);
const input=q('clip-source'),display=q('clip-preview'),state=q('clip-status');
const modes=Array.from(root.querySelectorAll('[data-clip-mode]'));
let mode='article',version=0,record=null,markdown='';
const say=(value,error=false)=>{state.textContent=String(value);state.dataset.error=String(error);};
const escapeLabel=s=>String(s||'').replace(/[\[\]\\]/g,'\\$&');
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').slice(0,900);
const cite=r=>'来源：['+escapeLabel(r.title)+']('+r.source+')';
function refresh(){
 if(!record){markdown='';input.value='';display.replaceChildren();return;}
 let content=mode==='quote'?record.markdown.trim().split('\n').map(x=>x?'> '+x:'>').join('\n')+'\n':record.markdown;
 if(mode!=='link'){
  if(mode==='quote')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='footer')content+='\n'+cite(record)+'\n';
  else if(q('clip-meta').value==='yaml'){
   content='---\n'+Object.entries({title:clean(record.title),source:clean(record.source),site:clean(record.site),captured_at:clean(record.capturedAt)}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n\n'+content;
  }
 }
 markdown=content;input.value=content;
 const target=document.createDocumentFragment();
 for(const line of content.split('\n')){
  if(!line.trim())continue;
  const m=line.match(/^(#{1,6})\s+(.+)$/);
  const quote=line.startsWith('> ');
  const element=document.createElement(m?'h'+m[1].length:quote?'blockquote':'p');
  element.textContent=m?m[2]:quote?line.slice(2):line;
  target.append(element);
 }
 display.replaceChildren(target);
}
function reset(text){version++;record=null;refresh();if(text)say(text);}
modes.forEach(b=>b.addEventListener('click',()=>{
 mode=b.dataset.clipMode;modes.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 reset(mode==='selection'||mode==='quote'?'请先在网页中选中文字':'点击剪藏获取内容');
}));
q('clip-meta').addEventListener('change',refresh);
q('clip-fetch').addEventListener('click',async()=>{
 const token=++version;
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
 finally{b.disabled=false;}
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
 if(!markdown)return say('请先剪藏',true);
 try{const response=await request('clipboard.writeText',{text:markdown});
  if(!response?.copied)throw Error('复制未确认');say('已复制 Markdown');
 }catch{input.hidden=false;display.hidden=true;input.focus();input.select();say('自动复制失败，请按 Ctrl/Cmd+C',true);}
});
q('clip-download').addEventListener('click',async()=>{
 if(!markdown)return say('请先剪藏',true);
 const filename=(clean(record?.title).replace(/[\/\\:*?"<>|]/g,'-').slice(0,60)||'web-clip')+'.md';
 try{const done=await request('file.download',{text:markdown,filename});
  if(!Number.isInteger(done?.downloadId))throw Error('下载未确认');
  say('已请求下载，请在 Chrome 确认保存');
 }catch(e){say('下载失败：'+String(e.message||e),true);}
});
root.addEventListener('opendesk-page-changed',()=>reset('网页已变化，请重新剪藏'));
refresh();
})();