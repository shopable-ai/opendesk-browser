(()=>{
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const doc=root.ownerDocument,q=id=>root.querySelector('#ki-'+id);
  const labels={inbox:'待整理',idea:'灵感',draft:'草稿',archived:'归档'};
  let selected=null,exportText='',kind='all',dirty=false,busy=false,generation=0,searchTimer=0;
  const say=(text,error=false)=>{q('status').textContent=text;q('status').hidden=!text;q('status').dataset.error=String(error);};
  const date=value=>new Date(value).toLocaleDateString('zh-CN');
  const discard=async()=>!dirty||await ask('有未保存的修改，确定放弃吗？');
  function lock(value){busy=value;root.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=value;});}
  function setDirty(value){
    if(dirty===value)return;
    dirty=value;
    void request('knowledge.editorState',{dirty:value}).catch(error=>say(error.message,true));
  }
  function ask(message){
    const previousBusy=busy,focused=doc.activeElement;
    lock(true);q('confirm-message').textContent=message;q('confirm').hidden=false;
    const yes=q('confirm-yes'),no=q('confirm-no');yes.disabled=false;no.disabled=false;no.focus();
    return new Promise(resolve=>{
      const finish=value=>{yes.removeEventListener('click',accept);no.removeEventListener('click',cancel);
        q('confirm').removeEventListener('keydown',key);q('confirm').hidden=true;lock(previousBusy);focused?.focus();resolve(value);};
      const accept=()=>finish(true),cancel=()=>finish(false);
      const key=event=>{if(event.key==='Escape'){event.preventDefault();cancel();}
        else if(event.key==='Tab'){event.preventDefault();(doc.activeElement===yes?no:yes).focus();}};
      yes.addEventListener('click',accept);no.addEventListener('click',cancel);q('confirm').addEventListener('keydown',key);
    });
  }
  const action=fn=>async()=>{if(busy)return;lock(true);try{await fn();}catch(e){say(String(e?.message||e),true);}finally{lock(false);}};
  async function list(){
    const token=++generation;
    const result=await request('knowledge.list',{query:q('search').value,kind});
    if(token!==generation)return;
    q('records').replaceChildren();q('empty').hidden=result.records.length!==0;
    q('count').textContent=result.records.length+' / '+result.total+' 条 · '+(result.bytes/1048576).toFixed(2)+' / 4 MiB';
    for(const record of result.records){
      const button=doc.createElement('button');button.type='button';button.className='ki-record';
      button.dataset.recordId=record.id;
      const title=doc.createElement('strong');title.textContent=record.title;
      const excerpt=doc.createElement('p');excerpt.textContent=record.excerpt;
      const meta=doc.createElement('span');meta.className='ki-record-meta';
      const badge=doc.createElement('span');badge.className='ki-badge';badge.dataset.kind=record.kind;badge.textContent=labels[record.kind];
      const time=doc.createElement('span');time.textContent=date(record.updatedAt);
      const tags=doc.createElement('span');tags.className='ki-tags';tags.textContent=record.tags.map(tag=>'#'+tag).join(' ');
      meta.append(badge,time,tags);button.append(title,excerpt,meta);
      button.addEventListener('click',action(()=>open(record.id)));q('records').append(button);
    }
  }
  function present(record,markdown){
    selected=record;exportText=markdown;setDirty(false);
    q('copy-fallback').hidden=true;
    q('title').value=record.title;q('kind').value=record.kind;q('tags').value=record.tags.join(', ');q('note').value=record.note;
    q('content').value=record.draft??record.markdown;q('edit').checked=record.draft!==null;q('content').readOnly=!q('edit').checked;
    q('date').textContent=date(record.createdAt)+' · '+(record.mode==='selection'?'选区':'单条回答');
    q('original').textContent=(record.question?'对应提问'+(record.questionTruncated?'（节选）':'')+'\n'+record.question+'\n\n':'')+record.markdown;
    q('image-note').hidden=!record.imageCount;
    q('image-note').textContent='含 '+record.imageCount+' 张图片。Markdown 保留可用的图片链接；实际图片请在原回答的「更多」中下载，临时链接可能过期。';
    q('list-view').hidden=true;q('detail').hidden=false;q('outline').hidden=true;q('content').hidden=false;
    q('outline-toggle').setAttribute('aria-expanded','false');q('title').focus();
  }
  async function open(id){
    if(!await discard())return;
    const result=await request('knowledge.get',{id});present(result.record,result.markdown);say('');
  }
  async function save(){
    if(!selected)return;
    const record=selected;
    const payload={id:record.id,ifRevision:record.revision,title:q('title').value.trim(),kind:q('kind').value,
      tags:q('tags').value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean),note:q('note').value,
      draft:q('edit').checked?q('content').value:null};
    const result=await request('knowledge.update',payload);
    // Refresh the exact committed version before deriving exports from it.
    const fresh=await request('knowledge.get',{id:result.record.id});present(fresh.record,fresh.markdown);say('修改已保存。原始回答保留在下方。');
  }
  function structure(markdown){
    const tree={text:selected?.title||'回答',level:0,children:[]},stack=[tree];let fence=null,count=0;
    for(const line of markdown.split('\n')){
      const mark=line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if(mark){if(!fence)fence=mark[1];else if(mark[1][0]===fence[0]&&mark[1].length>=fence.length)fence=null;continue;}
      if(fence)continue;
      const heading=line.match(/^(#{1,6})\s+(.+)$/),item=line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
      if(!heading&&!item)continue;
      const level=heading?heading[1].length:7+Math.min(6,Math.floor(item[1].length/2));
      const text=(heading?heading[2]:item[2]).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').slice(0,180);
      while(stack.length>1&&stack.at(-1).level>=level)stack.pop();
      const node={text,level,children:[]};stack.at(-1).children.push(node);stack.push(node);
      if(++count>=160)break;
    }
    const render=nodes=>{const ul=doc.createElement('ul');for(const node of nodes){const li=doc.createElement('li');
      if(node.children.length){const details=doc.createElement('details');details.open=true;const summary=doc.createElement('summary');summary.textContent=node.text;details.append(summary,render(node.children));li.append(details);}
      else li.textContent=node.text;ul.append(li);}return ul;};
    const description=doc.createElement('p');description.textContent=count?'按标题与列表生成，可折叠查看；正文和代码保持在原文中。'+(count>=160?' 仅显示前 160 个结构节点。':''):'正文没有标题或列表，暂时无法生成结构导图。';
    q('outline').replaceChildren(description,render(tree.children));
  }
  q('refresh').addEventListener('click',action(async()=>{await list();say('收件箱已刷新。');}));
  q('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void list().catch(e=>say(e.message,true)),300);});
  root.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',action(async()=>{
    kind=button.dataset.kind;root.querySelectorAll('[data-kind]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));await list();
  })));
  q('back').addEventListener('click',action(async()=>{if(!await discard())return;selected=null;setDirty(false);q('detail').hidden=true;q('list-view').hidden=false;await list();say('');}));
  for(const id of ['title','kind','tags','note','content'])q(id).addEventListener('input',()=>{setDirty(true);say('修改尚未保存。按 Ctrl/Cmd+S 保存。');});
  q('edit').addEventListener('change',async()=>{
    if(busy||!selected)return;
    if(!q('edit').checked&&(selected.draft!==null||q('content').value!==selected.markdown)&&
      !await ask('恢复为原始回答？当前草稿编辑将被放弃，保存修改后会清除已存草稿。')){q('edit').checked=true;return;}
    q('content').readOnly=!q('edit').checked;
    if(!q('edit').checked)q('content').value=selected.markdown;
    else q('kind').value='draft';
    setDirty(true);say('草稿修改尚未保存。原始回答始终保留。');
  });
  q('save').addEventListener('click',action(save));
  root.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void action(save)();}});
  const requireSaved=()=>{if(!selected)throw Error('请先选择记录');if(dirty)throw Error('请先保存修改，再导出或打开来源');};
  q('copy').addEventListener('click',action(async()=>{
    requireSaved();
    try{await request('clipboard.writeText',{text:exportText});say('已复制完整 Markdown。');}
    catch{const fallback=q('copy-fallback');fallback.hidden=false;fallback.disabled=false;fallback.value=exportText;
      fallback.focus();fallback.select();say('自动复制不可用，完整导出文本已选中，请按 Ctrl/Cmd+C。',true);}
  }));
  q('download').addEventListener('click',action(async()=>{requireSaved();await request('knowledge.download',{id:selected.id});say('已请求 Markdown 下载，请在 Chrome 核对保存结果。');}));
  q('workspace').addEventListener('click',action(async()=>{requireSaved();await request('knowledge.workspace',{id:selected.id});say('已送到本地工作区。选择授权目录并创建文件后才会写入磁盘。');}));
  q('source').addEventListener('click',action(async()=>{requireSaved();await request('knowledge.openSource',{id:selected.id});}));
  q('backup').addEventListener('click',action(async()=>{const result=await request('knowledge.backup');say('已请求备份 '+result.records+' 条记录，请在 Chrome 核对下载。');}));
  q('delete').addEventListener('click',action(async()=>{
    if(!selected||!await ask('删除这条记录及草稿？如需保留请先下载或备份。'))return;
    await request('knowledge.remove',{id:selected.id,ifRevision:selected.revision});selected=null;setDirty(false);
    q('detail').hidden=true;q('list-view').hidden=false;await list();say('记录已删除。');
  }));
  q('outline-toggle').addEventListener('click',()=>{
    const show=q('outline').hidden;q('outline').hidden=!show;q('content').hidden=show;q('outline-toggle').setAttribute('aria-expanded',String(show));
    if(show)structure(q('content').value);
  });
  void list().catch(error=>say(error.message,true));
})();
