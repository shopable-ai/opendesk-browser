(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool,q=id=>root.querySelector('#'+id);
const editor=q('mdw-source'),rendered=q('mdw-preview'),pane=q('mdw-panes');
const message=q('mdw-status'),state=q('mdw-state'),file=q('mdw-file');
// ToolHost owns the application title. Preserve the existing optional navigation contract.
globalThis.OpenDeskTool.setNavigation?.({page:'home',title:'Markdown 工作台',canBack:false});
const review=q('mdw-inline-review'),reviewText=q('mdw-review-text');
const reviewConfirm=q('mdw-review-confirm'),reviewCancel=q('mdw-review-cancel');
const buttons=[...root.querySelectorAll('.mdw-modes button[data-mode]')],MARK=String.fromCharCode(96);
let dirty=false,timer=0,filename='markdown.md',importSerial=0,reviewAction=null;
// Remember only explicit end-of-document reading, never a pixel/height ratio.
let followEnd=false,editorWidth=editor.clientWidth,editorHeight=editor.clientHeight;
const releaseEnd=()=>{followEnd=false;};
const rememberEnd=()=>{
 // Reflow can itself emit scroll before ResizeObserver reports the new box.
 if(editor.clientWidth!==editorWidth||editor.clientHeight!==editorHeight)return;
 followEnd=editor.scrollTop>0&&editor.scrollHeight-editor.clientHeight-editor.scrollTop<=2;
};
const scrollIntent=['wheel','touchstart','pointerdown','keydown'];
editor.addEventListener('scroll',rememberEnd,{passive:true});
scrollIntent.forEach(type=>editor.addEventListener(type,releaseEnd,{passive:true}));
const editorResize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
 const width=editor.clientWidth,height=editor.clientHeight;
 if(!width||!height)return;
 const changed=width!==editorWidth||height!==editorHeight;
 editorWidth=width;editorHeight=height;
 if(changed&&followEnd)editor.scrollTop=editor.scrollHeight;
}):null;
editorResize?.observe(editor);
globalThis.addEventListener('pagehide',()=>{
 releaseEnd();editorResize?.disconnect();clearTimeout(timer);
 editor.removeEventListener('scroll',rememberEnd);
 scrollIntent.forEach(type=>editor.removeEventListener(type,releaseEnd));
},{once:true});
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const bytes=text=>new TextEncoder().encode(text).length;
const status=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error);};
const cancelReview=()=>{reviewAction=null;review.hidden=true;};
const markDirty=()=>{releaseEnd();cancelReview();importSerial++;dirty=true;state.textContent='尚未下载的修改';};
function reviewDiscard(message,action){
 cancelReview();reviewAction=action;reviewText.textContent=message;review.hidden=false;
 reviewConfirm.focus({preventScroll:true});
}
reviewConfirm.addEventListener('click',()=>{
 const action=reviewAction;if(!action)return;
 cancelReview();void Promise.resolve().then(action).catch(e=>status(String(e?.message||e),true));
});
reviewCancel.addEventListener('click',()=>{cancelReview();status('已取消操作，原稿仍保留。');editor.focus();});
function safeUrl(value,image=false){
 try{
  const u=new URL(value);
  if(u.username||u.password||!(['http:','https:'].includes(u.protocol)||(!image&&['mailto:','tel:'].includes(u.protocol))))return null;
  return u.href;
 }catch{return null;}
}
function inline(text,parent){
 const token=/(!?\[[^\]\n]{0,160}\]\([^\)\n]{1,2048}\)|\x60[^\x60\n]*\x60|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
 let last=0,m;
 while((m=token.exec(text))){
  if(m.index>last)parent.append(node('span',text.slice(last,m.index)));
  const v=m[0];
  if(v.startsWith('![')||v.startsWith('[')){
   const data=v.match(/^(!?)\[([^\]]*)\]\(([^)]+)\)$/),href=data&&safeUrl(data[3],data[1]==='!');
   if(!href)parent.append(node('span',v));
   else if(data[1]==='!'){
    const image=node('span','图片：'+(data[2]||href),'mdw-image');
    image.title=href;parent.append(image);
   }else{
    const a=node('a',data[2]||href);a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
   }
  }else if(v[0]===MARK)parent.append(node('code',v.slice(1,-1)));
  else if(v.startsWith('**')||v.startsWith('__'))parent.append(node('strong',v.slice(2,-2)));
  else if(v.startsWith('~~'))parent.append(node('del',v.slice(2,-2)));
  else parent.append(node('em',v.slice(1,-1)));
  last=token.lastIndex;
 }
 if(last<text.length)parent.append(node('span',text.slice(last)));
}
function preview(markdown){
 const lines=markdown.replace(/\r\n?/g,'\n').split('\n'),fragment=document.createDocumentFragment();
 let para=[],code=null,codeFence='',list=null,table=null;
 const flush=()=>{if(para.length){const p=node('p');inline(para.join(' '),p);fragment.append(p);para=[];}list=null;table=null;};
 const cells=line=>line.replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(x=>x.trim().replace(/\\\|/g,'|'));
 for(let i=0;i<lines.length;i++){
  const line=lines[i],fence=line.match(/^\s*(\x60{3,}|~{3,})([a-z0-9#+-]*)\s*$/i);
  if(code){
   if(fence&&fence[1][0]===codeFence[0]&&fence[1].length>=codeFence.length){
    const pre=node('pre');pre.append(node('code',code.join('\n')));fragment.append(pre);code=null;codeFence='';
   }else code.push(line);
   continue;
  }
  if(fence){flush();code=[];codeFence=fence[1];continue;}
  if(!line.trim()){flush();continue;}
  if(/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1]||'')&&line.includes('|')){
   flush();table=node('table');const h=node('thead'),tr=node('tr');
   cells(line).slice(0,24).forEach(x=>{const th=node('th');inline(x,th);tr.append(th);});
   h.append(tr);table.append(h,node('tbody'));fragment.append(table);i++;continue;
  }
  if(table&&line.includes('|')){
   const tr=node('tr');cells(line).slice(0,24).forEach(x=>{const td=node('td');inline(x,td);tr.append(td);});
   table.querySelector('tbody').append(tr);continue;
  }
  const heading=line.match(/^(#{1,6})\s+(.+)$/);
  if(heading){flush();const h=node('h'+heading[1].length);inline(heading[2],h);fragment.append(h);continue;}
  if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){flush();fragment.append(node('hr'));continue;}
  const quote=line.match(/^\s*>\s?(.*)$/);
  if(quote){flush();const block=node('blockquote');inline(quote[1],block);fragment.append(block);continue;}
  const item=line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
  if(item){
   if(!list||list.tagName!==(item[2].endsWith('.')?'OL':'UL')){
    flush();list=node(item[2].endsWith('.')?'ol':'ul');fragment.append(list);
   }
   const li=node('li'),task=item[3].match(/^\[([ xX])\]\s*(.*)$/);
   if(task){
    const check=node('input');check.type='checkbox';check.checked=task[1].toLowerCase()==='x';
    check.disabled=true;li.append(check,' ');inline(task[2],li);
   }else inline(item[3],li);
   list.append(li);continue;
  }
  list=null;para.push(line.trim());
 }
 if(code){const pre=node('pre');pre.append(node('code',code.join('\n')));fragment.append(pre);}
 flush();rendered.replaceChildren(fragment);
}
const refresh=()=>{timer=0;preview(editor.value);};
editor.addEventListener('input',()=>{markDirty();clearTimeout(timer);timer=setTimeout(refresh,100);});
buttons.forEach(b=>b.addEventListener('click',()=>{
 releaseEnd();
 pane.dataset.mode=b.dataset.mode;buttons.forEach(x=>{
  const active=x===b;x.setAttribute('aria-pressed',String(active));
  x.classList.toggle('od-button--secondary',active);
  x.classList.toggle('od-button--quiet',!active);
 });refresh();
}));
q('mdw-import').addEventListener('click',()=>{cancelReview();file.click();});
async function importMarkdown(chosen){
 const serial=++importSerial;
 try{
  const data=await chosen.text();
  if(serial!==importSerial)return; // Never overwrite edits made during a pending read.
  if(bytes(data)>150000)throw Error('文件超过 150 KB');
  editor.value=data;
  filename=/^[^/\\\x00-\x1f:?*"<>|]+\.md$/i.test(chosen.name)?chosen.name:'markdown.md';
  markDirty();refresh();status('已导入 '+filename+'；尚未下载保存');
 }catch(e){if(serial===importSerial)status(String(e.message||e),true);}
}
file.addEventListener('change',()=>{
 const chosen=file.files?.[0];file.value='';if(!chosen)return;
 if(chosen.size>150000){status('文件超过 150 KB，请选择小文件',true);return;}
 const proceed=()=>importMarkdown(chosen);
 if(dirty)reviewDiscard('导入 '+chosen.name+' 将替换当前未保存的 Markdown。请先下载或复制备份，再选择是否继续。',proceed);
 else void proceed();
});
q('mdw-copy').addEventListener('click',async()=>{
 if(!editor.value){status('没有可复制的内容',true);return;}
 try{await globalThis.OpenDeskSDK.browser.clipboard.writeText(editor.value);status('Markdown 已复制');}
 catch{editor.focus();editor.select();status('自动复制不可用：已选中，请按 Ctrl/Cmd+C',true);}
});
q('mdw-download').addEventListener('click',async()=>{
 if(!editor.value){status('没有可下载的内容',true);return;}
 try{
  await globalThis.OpenDeskSDK.browser.downloads.text({text:editor.value,filename});
  // A browser download request is not proof that a durable file exists.
  // Retain discard protection until the user decides to replace the draft.
  state.textContent='下载已发起 · 请核对文件';
  status('已发起 Markdown 下载；请在下载记录中确认文件已保存。');
 }catch(e){status('下载失败：'+String(e.message||e),true);}
});
q('mdw-clear').addEventListener('click',()=>{
 if(!editor.value)return;
 reviewDiscard('清空将删除当前编辑区的全部 Markdown，且无法撤销。建议先下载或复制备份。',()=>{
  editor.value='';markDirty();refresh();status('已清空，内容尚未下载保存');
 });
});
refresh();
})();
