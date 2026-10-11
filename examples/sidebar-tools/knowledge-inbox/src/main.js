(()=>{
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const doc=root.ownerDocument,q=id=>root.querySelector('#ki-'+id);
  const labels={inbox:'待整理',idea:'灵感',draft:'草稿',archived:'归档'};
  let selected=null,exportText='',exportReady=false,kind='all',tag='',records=[],total=0,bytes=0;
  let dirty=false,busy=false,editing=false,creating=false,restoring=false,generation=0,openedFrom=null,searchTimer=0,statusTimer=0,lockedFocus=null;
  let editorStateQueue=Promise.resolve();

  const date=value=>{
    const d=new Date(value);
    return Number.isFinite(d.getTime())?d.toLocaleDateString('zh-CN'):'时间未知';
  };
  const errorText=error=>String(error?.message||error||'操作失败');
  function say(message,error=false){
    clearTimeout(statusTimer);
    q('status').textContent=message;
    q('status').hidden=!message;
    q('status').dataset.error=String(error);
    if(message&&!error)statusTimer=setTimeout(()=>{q('status').hidden=true;},3400);
  }
  function syncControls(){
    root.querySelectorAll('button,input,select,textarea').forEach(control=>{
      if(q('confirm').contains(control))return;
      let disabled=busy;
      if(control.id==='ki-save')disabled=disabled||!editing||!dirty;
      if(control.id==='ki-create-save')disabled=disabled||!creating||
        !q('create-title').value.trim()||!q('create-body').value.trim()||
        new TextEncoder().encode(q('create-body').value).length>150000;
      if(control.id==='ki-clear')disabled=disabled||!q('search').value;
      if(control.id==='ki-copy')disabled=disabled||!exportReady;
      control.disabled=disabled;
    });
  }
  function lock(value){
    if(value&&!busy)lockedFocus=doc.activeElement;
    if(!value)lockedFocus=null;
    busy=value;globalThis.OpenDeskTool.setState?.({dirty,busy});syncControls();
  }
  function setDirty(value){
    // The generic sandbox bridge sets toolDirty on every trusted input. Clear it
    // using its official edit-state channel, even when values return to their baseline.
    const changed=dirty!==value;
    dirty=value;
    globalThis.OpenDeskTool.setState?.({dirty,busy});
    q('create-state').textContent=creating?(value?'有未保存内容':'填写标题和正文'):'填写标题和正文';
    q('create-state').dataset.dirty=String(value);
    if(!changed){syncControls();return;}
    q('edit-state').textContent=value?'有未保存修改':'尚未修改';
    q('edit-state').dataset.dirty=String(value);
    syncControls();
    // Preserve notification order so a late "dirty=true" cannot re-arm the host after a save.
    editorStateQueue=editorStateQueue.catch(()=>{}).then(()=>request('knowledge.editorState',{dirty:value}))
      .catch(error=>say('无法同步编辑保护状态：'+errorText(error),true));
  }
  function ask(message){
    const previousBusy=busy,focused=busy?lockedFocus:doc.activeElement;
    lock(true);
    q('confirm-message').textContent=message;
    q('confirm').hidden=false;
    const yes=q('confirm-yes'),no=q('confirm-no');
    yes.disabled=false;no.disabled=false;no.focus();
    return new Promise(resolve=>{
      const finish=value=>{
        yes.removeEventListener('click',accept);no.removeEventListener('click',cancel);
        q('confirm').removeEventListener('keydown',onKey);
        q('confirm').hidden=true;lock(previousBusy);
        resolve(value);
        laterFocus(focused);
      };
      const accept=()=>finish(true),cancel=()=>finish(false);
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}
        else if(event.key==='Tab'){event.preventDefault();(doc.activeElement===yes?no:yes).focus();}
      };
      yes.addEventListener('click',accept);no.addEventListener('click',cancel);
      q('confirm').addEventListener('keydown',onKey);
    });
  }
  const laterFocus=element=>setTimeout(()=>{if(element?.isConnected&&!element.disabled)element.focus();},0);
  const discard=()=>!dirty?Promise.resolve(true):ask('有未保存的修改。确定放弃这些修改吗？');
  const action=fn=>async()=>{
    if(busy)return;
    lock(true);
    try{await fn();}catch(error){say(errorText(error),true);}
    finally{lock(false);}
  };
  function updateFilters(){
    q('clear').hidden=!q('search').value;
    for(const button of root.querySelectorAll('.ki-filters button[data-kind]'))
      button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
  }
  function fillTags(){
    const options=new Set(records.flatMap(row=>row.tags||[]));
    const values=[...options].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    if(tag&&!options.has(tag))values.unshift(tag);
    const select=q('tag-filter'),fragment=doc.createDocumentFragment();
    const all=doc.createElement('option');all.value='';all.textContent='全部标签';fragment.append(all);
    for(const value of values){const option=doc.createElement('option');option.value=value;option.textContent=value;fragment.append(option);}
    select.replaceChildren(fragment);select.value=tag;
  }
  function cleanExcerpt(text){
    return String(text||'').replace(/[\x60*_#>~\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,155);
  }
  function renderList(){
    const sort=q('sort').value;
    const filtered=records.filter(row=>!tag||(row.tags||[]).includes(tag)).sort((a,b)=>
      sort==='title'?a.title.localeCompare(b.title,'zh-CN'):
      sort==='created'?b.createdAt.localeCompare(a.createdAt):b.updatedAt.localeCompare(a.updatedAt));
    const fragment=doc.createDocumentFragment();
    for(const record of filtered){
      const button=doc.createElement('button');button.type='button';button.className='ki-record';
      button.dataset.recordId=record.id;
      const title=doc.createElement('strong');title.textContent=record.title;
      const excerpt=doc.createElement('p');excerpt.textContent=cleanExcerpt(record.excerpt)||'（没有摘要）';
      const meta=doc.createElement('span');meta.className='ki-record-meta';
      const badge=doc.createElement('span');badge.className='ki-badge';badge.dataset.kind=record.kind;
      badge.textContent=labels[record.kind]||record.kind;
      const time=doc.createElement('span');time.textContent=date(record.updatedAt);
      const tags=doc.createElement('span');tags.className='ki-tags';tags.textContent=(record.tags||[]).map(value=>'#'+value).join(' ');
      meta.append(badge,time,tags);button.append(title,excerpt,meta);
      button.addEventListener('click',action(()=>open(record.id)));fragment.append(button);
    }
    q('records').replaceChildren(fragment);
    q('count').textContent=filtered.length+' 条结果 · '+(bytes/1048576).toFixed(2)+' / 4 MiB';
    q('total-count').textContent=total?String(total):'';
    const none=!filtered.length,filteredOut=Boolean(total&&(kind!=='all'||q('search').value.trim()||tag));
    q('empty').hidden=!none;
    q('empty-title').textContent=filteredOut?'没有符合条件的记录':'收件箱还是空的';
    q('empty-description').textContent=filteredOut?'试试清除关键词、分类或标签筛选。':'你可以直接写一条笔记，也可以在 ChatGPT 回答下点击「保存」。';
    q('empty-new').hidden=filteredOut;
    q('reset').hidden=!filteredOut;
  }
  async function list(){
    const token=++generation;
    q('list-loading').hidden=false;
    updateFilters();
    try{
      const result=await request('knowledge.list',{query:q('search').value,kind});
      if(token!==generation||q('list-view').hidden)return;
      records=result.records;total=result.total;bytes=result.bytes;
      fillTags();renderList();return true;
    }catch(error){
      if(token===generation) {
        q('records').replaceChildren();records=[];total=0;
        q('empty').hidden=true;q('count').textContent='读取失败';
        say('读取收件箱失败：'+errorText(error),true);
      }
    }finally{if(token===generation)q('list-loading').hidden=true;}
  }

  // Text-node-only Markdown presentation. Never use innerHTML, execute HTML,
  // fetch remote resources or create image elements from captured content.
  function safeUrl(value){
    try{
      const url=selected?.source?new URL(value.trim(),selected.source):new URL(value.trim());
      return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;
    }catch{return null;}
  }
  function inline(target,content){
    const text=String(content);
    const pattern=/(!?\[([^\]\n]{1,200})\]\(([^)\n]{1,2048})\)|\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|~~([^~\n]+)~~)/g;
    let previous=0,match;
    while((match=pattern.exec(text))){
      if(match.index>previous)target.append(doc.createTextNode(text.slice(previous,match.index)));
      if(match[2]!==undefined){
        const image=match[0].startsWith('!'),url=safeUrl(match[3]);
        const node=doc.createElement(url?'a':'span');
        if(url){node.href=url;node.target='_blank';node.rel='noopener noreferrer';}
        if(image)node.className='ki-inline-image';
        node.textContent=(image?'图片链接：':'')+match[2];
        target.append(node);
      }else{
        const name=match[4]!==undefined?'code':match[5]!==undefined||match[6]!==undefined?'strong':
          match[7]!==undefined||match[8]!==undefined?'em':'del';
        const node=doc.createElement(name);
        node.textContent=match.slice(4).find(value=>value!==undefined);
        target.append(node);
      }
      previous=pattern.lastIndex;
    }
    if(previous<text.length)target.append(doc.createTextNode(text.slice(previous)));
  }
  function tableCells(line){return line.trim().replace(/^\||\|$/g,'').split('|').map(value=>value.trim());}
  function tableDivider(line){return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);}
  function blockStart(line){
    return /^ {0,3}(?:#{1,6}\s+|>|(?:[-+*]|\d+[.)])\s+|\x60{3,}|~{3,}|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line);
  }
  function renderMarkdown(markdown){
    const host=q('markdown');host.replaceChildren();
    const text=String(markdown||'').replace(/\r\n?/g,'\n');
    const lines=text.split('\n');
    const firstNonBlankLine=lines.findIndex(line=>Boolean(line.trim()));
    if(lines.length>4000){
      const hint=doc.createElement('p');hint.textContent='正文较长，使用纯文本模式保证完整显示。';
      const pre=doc.createElement('pre');pre.textContent=text;pre.style.whiteSpace='pre-wrap';
      host.append(hint,pre);return;
    }
    const fragment=doc.createDocumentFragment();
    let i=0,blocks=0;
    while(i<lines.length){
      if(++blocks>2500){
        const pre=doc.createElement('pre');pre.textContent=lines.slice(i).join('\n');pre.style.whiteSpace='pre-wrap';
        fragment.append(pre);break;
      }
      const line=lines[i];
      if(!line.trim()){i++;continue;}
      const fence=line.match(/^ {0,3}(\x60{3,}|~{3,})\s*([^\s]*)/);
      if(fence){
        const marker=fence[1],closing=new RegExp('^ {0,3}'+(marker[0]==='~'?'~':'\\x60')+'{'+marker.length+',}\\s*$');
        const parts=[];i++;
        while(i<lines.length&&!closing.test(lines[i]))parts.push(lines[i++]);
        if(i<lines.length)i++;
        const pre=doc.createElement('pre'),code=doc.createElement('code');
        if(/^[\w+#.-]{1,25}$/.test(fence[2])){
          const lang=doc.createElement('span');lang.className='ki-code-lang';lang.textContent=fence[2];pre.append(lang);
        }
        code.textContent=parts.join('\n');pre.append(code);fragment.append(pre);continue;
      }
      const heading=line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
      if(heading){
        const headingText=heading[2].replace(/\s+#+\s*$/,'').trim();
        // Only omit a matching first heading in the reader; do not alter the saved original.
        if(i===firstNonBlankLine&&headingText===selected?.title?.trim()){i++;continue;}
        const element=doc.createElement('h'+heading[1].length);
        inline(element,headingText);fragment.append(element);i++;continue;
      }
      if(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){fragment.append(doc.createElement('hr'));i++;continue;}
      if(tableDivider(lines[i+1]||'')&&line.includes('|')){
        const heads=tableCells(line).slice(0,12),wrap=doc.createElement('div');
        wrap.className='ki-table-wrap';const table=doc.createElement('table'),thead=doc.createElement('thead'),tr=doc.createElement('tr');
        for(const head of heads){const th=doc.createElement('th');inline(th,head);tr.append(th);}
        thead.append(tr);table.append(thead);i+=2;const tbody=doc.createElement('tbody');
        while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){
          const cells=tableCells(lines[i++]).slice(0,heads.length),row=doc.createElement('tr');
          for(let n=0;n<heads.length;n++){const td=doc.createElement('td');inline(td,cells[n]||'');row.append(td);}
          tbody.append(row);
        }
        table.append(tbody);wrap.append(table);fragment.append(wrap);continue;
      }
      if(/^ {0,3}>\s?/.test(line)){
        const quote=doc.createElement('blockquote'),p=doc.createElement('p'),parts=[];
        while(i<lines.length&&/^ {0,3}>\s?/.test(lines[i]))parts.push(lines[i++].replace(/^ {0,3}>\s?/,''));
        inline(p,parts.join('\n'));quote.append(p);fragment.append(quote);continue;
      }
      const item=line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
      if(item){
        const numbered=/^\d/.test(item[1]),list=doc.createElement(numbered?'ol':'ul');
        while(i<lines.length){
          const row=lines[i].match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
          if(!row||(/^\d/.test(row[1]))!==numbered)break;
          const li=doc.createElement('li'),check=row[2].match(/^\[([ xX])\]\s+(.*)$/);
          if(check){const symbol=doc.createElement('span');symbol.textContent=check[1].toLowerCase()==='x'?'☑ ':'☐ ';li.append(symbol);}
          inline(li,check?check[2]:row[2]);list.append(li);i++;
        }
        fragment.append(list);continue;
      }
      const parts=[line];i++;
      while(i<lines.length&&lines[i].trim()&&!blockStart(lines[i])&&
        !(lines[i].includes('|')&&tableDivider(lines[i+1]||'')))parts.push(lines[i++]);
      const p=doc.createElement('p');inline(p,parts.join('\n'));fragment.append(p);
    }
    host.append(fragment);
  }
  function structure(markdown){
    const tree={text:selected?.title||'回答',level:0,children:[]},stack=[tree];
    let fence=null,count=0;
    for(const line of markdown.split('\n')){
      const mark=line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
      if(mark){if(!fence)fence=mark[1];else if(mark[1][0]===fence[0]&&mark[1].length>=fence.length)fence=null;continue;}
      if(fence)continue;
      const heading=line.match(/^(#{1,6})\s+(.+)$/),item=line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
      if(!heading&&!item)continue;
      const level=heading?heading[1].length:7+Math.min(6,Math.floor(item[1].length/2));
      const title=(heading?heading[2]:item[2]).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_\x60]/g,'').slice(0,180);
      while(stack.length>1&&stack.at(-1).level>=level)stack.pop();
      const node={text:title,level,children:[]};stack.at(-1).children.push(node);stack.push(node);
      if(++count>=160)break;
    }
    const render=nodes=>{
      const ul=doc.createElement('ul');
      for(const node of nodes){
        const li=doc.createElement('li');
        if(node.children.length){
          const details=doc.createElement('details');details.open=true;
          const summary=doc.createElement('summary');summary.textContent=node.text;
          details.append(summary,render(node.children));li.append(details);
        }else li.textContent=node.text;
        ul.append(li);
      }
      return ul;
    };
    const p=doc.createElement('p');
    p.textContent=count?'根据标题和列表生成的可折叠结构'+(count>=160?'（仅列出前 160 项）':''):'正文没有可提取的标题或列表。';
    q('outline').replaceChildren(p,render(tree.children));
  }
  const compactMeta=(kind,tags,note)=>{
    const count=Array.isArray(tags)?tags.length:0;
    return (labels[kind]||'待整理')+(count?' · '+count+' 标签':'')+(note?.trim()?' · 有备注':'');
  };
  function updateEditMeta(){
    q('editor-extra-summary').textContent=compactMeta(q('kind').value,
      q('tags').value.split(/[,，]/).map(value=>value.trim()).filter(Boolean),q('note').value);
  }
  function updateCreateMeta(){
    q('create-extra-summary').textContent=compactMeta(q('create-kind').value,
      q('create-tags').value.split(/[,，]/).map(value=>value.trim()).filter(Boolean),q('create-note').value);
  }
  function detailLayout(isEditing){
    q('detail').dataset.mode=isEditing?'edit':'read';
    for(const id of ['view-title','view-meta','date','toolbar','original-details'])
      q(id).hidden=isEditing;
    q('writing-label').hidden=!isEditing;
    q('image-note').hidden=isEditing||!selected?.imageCount;
    q('reader').hidden=isEditing;q('editor').hidden=!isEditing;
    q('edit').textContent='编辑';
    q('edit').setAttribute('aria-expanded',String(isEditing));
    q('outline-toggle').hidden=isEditing;
  }
  function presentation(record,markdown){
    selected=record;exportText=markdown;exportReady=typeof markdown==='string';editing=false;restoring=false;
    setDirty(false);
    q('copy-fallback').hidden=true;
    q('title').value=record.title;q('kind').value=record.kind;q('tags').value=record.tags.join(', ');
    q('note').value=record.note;q('content').value=record.draft??record.markdown;
    q('view-title').textContent=record.title;q('view-kind').textContent=labels[record.kind]||record.kind;
    q('view-kind').dataset.kind=record.kind;
    q('view-tags').textContent=record.tags.map(value=>'#'+value).join(' ');
    q('date').textContent=date(record.updatedAt)+' · '+(record.mode==='manual'?'手动创建':record.mode==='selection'?'选区':'单条回答');
    q('source').hidden=!record.source;
    q('original').textContent=(record.question?'对应提问'+(record.questionTruncated?'（节选）':'')+'\n'+record.question+'\n\n':'')+record.markdown;
    q('original-details').open=false;
    q('image-note').textContent=record.imageCount+' 张图片的链接可能过期；下载原图片请返回来源对话。';
    creating=false;q('create-view').hidden=true;
    q('list-view').hidden=true;q('detail').hidden=false;
    q('editor-extra').open=false;updateEditMeta();detailLayout(false);
    q('outline-toggle').textContent='结构导图';
    q('outline-toggle').setAttribute('aria-expanded','false');
    q('outline').hidden=true;q('markdown').hidden=false;
    q('more').open=false;
    renderMarkdown(record.draft??record.markdown);
    syncControls();
    q('view-title').focus();
  }
  async function open(id){
    if(!await discard())return;
    openedFrom=id;generation++;
    const result=await request('knowledge.get',{id});
    presentation(result.record,result.markdown);say('');
  }
  function currentPayload(){
    const text=q('content').value;
    const tags=[...new Set(q('tags').value.split(/[,，]/).map(value=>value.trim()).filter(Boolean))];
    const draft=restoring&&text===selected.markdown?null:text===(selected.draft??selected.markdown)?selected.draft:text;
    return {id:selected.id,ifRevision:selected.revision,title:q('title').value.trim(),
      kind:q('kind').value,tags,note:q('note').value,draft};
  }
  function refreshDirty(){
    if(!editing||!selected)return;
    const now=currentPayload();
    const next=now.title!==selected.title||now.kind!==selected.kind||
      JSON.stringify(now.tags)!==JSON.stringify(selected.tags)||now.note!==selected.note||
      now.draft!==selected.draft;
    updateEditMeta();
    setDirty(next);
  }
  async function toggleEdit(){
    if(!selected)return;
    if(editing){
      if(!await discard())return;
      presentation(selected,exportReady?exportText:null);laterFocus(q('edit'));return;
    }
    // On re-entry after Cancel, always restore the durable values, not
    // abandoned edits left in the hidden form controls.
    q('title').value=selected.title;q('kind').value=selected.kind;
    q('tags').value=selected.tags.join(', ');q('note').value=selected.note;
    q('content').value=selected.draft??selected.markdown;
    editing=true;restoring=false;q('editor-extra').open=false;
    q('more').open=false;q('original-details').open=false;
    updateEditMeta();detailLayout(true);setDirty(false);
    q('edit-state').textContent='尚未修改';q('edit-state').dataset.dirty='false';
    syncControls();laterFocus(q('content'));
  }
  async function save(){
    if(!selected||!editing||!dirty)return;
    const payload=currentPayload();
    q('edit-state').textContent='正在保存…';
    let result;
    try{result=await request('knowledge.update',payload);}
    catch(error){q('edit-state').textContent='保存失败，请重试';throw error;}
    // The update response confirms persistence even if a following read fails.
    setDirty(false);
    try{
      const fresh=await request('knowledge.get',{id:result.record.id});
      presentation(fresh.record,fresh.markdown);say('已保存修改。');
    }catch{
      presentation(result.record,null);
      say('已保存，但重新读取导出文本失败。请返回列表后重新打开记录。',true);
    }
  }
  const createTags=value=>[...new Set(value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean))];
  function createPayload(){
    return {title:q('create-title').value.trim(),markdown:q('create-body').value,
      kind:q('create-kind').value,tags:createTags(q('create-tags').value),note:q('create-note').value};
  }
  function refreshCreate(){
    if(!creating)return;
    const payload=createPayload();
    const size=new TextEncoder().encode(payload.markdown).length;
    q('create-size').textContent=size.toLocaleString('zh-CN')+' / 150,000 字节'+(size>150000?'（超出限制）':'');
    q('create-size').dataset.over=String(size>150000);
    updateCreateMeta();
    setDirty(Boolean(payload.title||payload.markdown||payload.tags.length||payload.note||payload.kind!=='inbox'));
  }
  async function startCreate(){
    clearTimeout(searchTimer);generation++;
    creating=true;selected=null;exportReady=false;editing=false;
    for(const id of ['create-title','create-body','create-tags','create-note'])q(id).value='';
    q('create-kind').value='inbox';q('create-size').textContent='0 / 150,000 字节';
    q('create-size').dataset.over='false';q('create-extra').open=false;updateCreateMeta();
    q('manage').open=false;
    q('list-view').hidden=true;q('detail').hidden=true;q('create-view').hidden=false;
    setDirty(false);syncControls();q('create-title').focus();say('');
  }
  const cancelCreate=action(async()=>{
    if(!await discard())return;
    creating=false;setDirty(false);
    q('create-view').hidden=true;q('list-view').hidden=false;
    await list();laterFocus(q('new'));say('');
  });
  async function saveCreate(){
    if(!creating||!q('create-title').value.trim()||!q('create-body').value.trim())return;
    const result=await request('knowledge.create',createPayload());
    // The write is confirmed; never resubmit on a later read failure.
    setDirty(false);creating=false;openedFrom=result.record.id;
    q('create-view').hidden=true;
    kind='all';tag='';q('search').value='';q('sort').value='updated';updateFilters();
    try{
      const fresh=await request('knowledge.get',{id:result.record.id});
      presentation(fresh.record,fresh.markdown);say('新知识已保存。');
    }catch{
      q('list-view').hidden=false;await list().catch(()=>{});
      laterFocus(q('new'));say('已保存，但暂时无法打开详情，请在列表刷新后查看。',true);
    }
  }
  q('new').addEventListener('click',action(startCreate));
  q('empty-new').addEventListener('click',action(startCreate));
  q('create-cancel').addEventListener('click',cancelCreate);
  q('create-discard').addEventListener('click',cancelCreate);
  q('create-save').addEventListener('click',action(saveCreate));
  for(const id of ['create-title','create-body','create-kind','create-tags','create-note'])
    q(id).addEventListener('input',refreshCreate);
  q('create-kind').addEventListener('change',refreshCreate);
  const requireSaved=()=>{if(!selected)throw Error('请先选择记录');if(dirty)throw Error('请先保存修改，再执行导出操作');};
  q('refresh').addEventListener('click',action(async()=>{q('manage').open=false;if(await list())say('已刷新收件箱。');}));
  q('search').addEventListener('input',()=>{
    updateFilters();syncControls();clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>void list(),250);
  });
  q('clear').addEventListener('click',()=>{if(busy)return;q('search').value='';updateFilters();syncControls();q('search').focus();void list();});
  for(const button of root.querySelectorAll('.ki-filters button[data-kind]'))
    button.addEventListener('click',action(async()=>{kind=button.dataset.kind;await list();}));
  q('sort').addEventListener('change',renderList);
  q('tag-filter').addEventListener('change',()=>{tag=q('tag-filter').value;renderList();});
  q('reset').addEventListener('click',action(async()=>{
    kind='all';tag='';q('search').value='';q('sort').value='updated';await list();laterFocus(q('search'));
  }));
  const goBack=action(async()=>{
    if(!await discard())return;
    selected=null;exportReady=false;setDirty(false);
    q('detail').hidden=true;q('list-view').hidden=false;
    await list();const previous=root.querySelector('.ki-record[data-record-id="'+openedFrom+'"]');
    laterFocus(previous||q('search'));say('');
  });
  q('back').addEventListener('click',goBack);
  // Native button focus, not a custom selection state or mutation of saved data.
  q('records').addEventListener('keydown',event=>{
    if(busy||q('list-view').hidden||event.altKey||event.ctrlKey||event.metaKey||
        !['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=[...q('records').querySelectorAll('button.ki-record:not(:disabled)')];
    const current=items.indexOf(event.target);
    if(current<0)return;
    event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?items.length-1:
      Math.max(0,Math.min(items.length-1,current+(event.key==='ArrowDown'?1:-1)));
    items[index]?.focus();
  });
  for(const id of ['title','kind','tags','note','content'])q(id).addEventListener('input',refreshDirty);
  q('kind').addEventListener('change',refreshDirty);
  q('edit').addEventListener('click',action(toggleEdit));
  q('edit-cancel').addEventListener('click',action(toggleEdit));
  q('restore').addEventListener('click',action(async()=>{
    if(!selected||!editing)return;
    if(!await ask('将草稿恢复为最初保存的回答？已保存的个人草稿将会在下次保存时清除。'))return;
    restoring=true;q('content').value=selected.markdown;refreshDirty();laterFocus(q('content'));
  }));
  q('save').addEventListener('click',action(save));
  root.addEventListener('keydown',event=>{
    if(!q('confirm').hidden)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&(editing||creating)){
      event.preventDefault();
      if(creating&&!q('create-save').disabled)void action(saveCreate)();
      else if(editing&&dirty)void action(save)();
    }else if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!q('list-view').hidden&&
      !['INPUT','TEXTAREA','SELECT'].includes(doc.activeElement?.tagName)){
      event.preventDefault();q('search').focus();
    }else if(event.key==='Escape'&&!busy){
      if(creating){
        event.preventDefault();
        if(q('create-extra').open){q('create-extra').open=false;q('create-extra').querySelector('summary')?.focus();}
        else void cancelCreate();
        return;
      }
      if(editing){
        event.preventDefault();
        if(q('editor-extra').open){q('editor-extra').open=false;q('editor-extra').querySelector('summary')?.focus();}
        else void action(toggleEdit)();
        return;
      }
      if(!q('detail').hidden){
        event.preventDefault();
        if(q('more').open){q('more').open=false;q('more').querySelector('summary')?.focus();}
        else if(!q('outline').hidden){q('outline-toggle').click();q('outline-toggle').focus();}
        else if(q('original-details').open){q('original-details').open=false;q('original-details').querySelector('summary')?.focus();}
        else void goBack();
      }else if(q('manage').open){
        event.preventDefault();q('manage').open=false;q('manage').querySelector('summary')?.focus();
      }
    }
  });
  q('copy').addEventListener('click',action(async()=>{
    requireSaved();
    if(!exportReady)throw Error('内容尚未读取完成，请重新打开记录');
    try{await request('clipboard.writeText',{text:exportText});say('完整 Markdown 已复制。');}
    catch{
      q('copy-fallback').hidden=false;q('copy-fallback').value=exportText;
      q('copy-fallback').disabled=false;q('copy-fallback').focus();q('copy-fallback').select();
      say('自动复制不可用，请按 Ctrl/Cmd+C 复制已选中的内容。',true);
    }
  }));
  q('download').addEventListener('click',action(async()=>{
    q('more').open=false;requireSaved();await request('knowledge.download',{id:selected.id});
    say('已请求 Chrome 下载，请检查下载列表。');
  }));
  q('workspace').addEventListener('click',action(async()=>{
    q('more').open=false;requireSaved();await request('knowledge.workspace',{id:selected.id});
    say('已打开工作区。选择授权目录并创建文件后才会写入磁盘。');
  }));
  q('source').addEventListener('click',action(async()=>{
    q('more').open=false;requireSaved();await request('knowledge.openSource',{id:selected.id});
  }));
  q('backup').addEventListener('click',action(async()=>{
    q('manage').open=false;const result=await request('knowledge.backup');
    say('已请求备份 '+result.records+' 条记录，请核对 Chrome 下载。');
  }));
  q('delete').addEventListener('click',action(async()=>{
    q('more').open=false;
    if(!selected||!await ask('确定删除「'+selected.title+'」及其备注和草稿？此操作无法撤销。'))return;
    await request('knowledge.remove',{id:selected.id,ifRevision:selected.revision});
    selected=null;exportReady=false;setDirty(false);
    q('detail').hidden=true;q('list-view').hidden=false;await list();
    laterFocus(q('search'));say('记录已删除。');
  }));
  q('outline-toggle').addEventListener('click',()=>{
    if(editing)return;
    const show=q('outline').hidden;
    q('outline').hidden=!show;q('markdown').hidden=show;
    q('outline-toggle').setAttribute('aria-expanded',String(show));
    q('outline-toggle').textContent=show?'查看正文':'结构导图';
    if(show)structure(selected.draft??selected.markdown);
  });
  updateFilters();syncControls();void list();
})();
