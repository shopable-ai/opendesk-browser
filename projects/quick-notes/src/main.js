(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const {root,request,setState}=tool;
  const el=id=>root.querySelector('#'+id);
  const STORAGE_KEY='notes';
  const MAX_NOTES=16;
  let notes=[],selectedId=null,dirty=false,pageInfo=null,busy=false,ready=false,activeView='list';
  let notesEtag=null,legacyPending=false,pageEpoch=0,deleting=false,confirmation=null;
  let draftRevision=0,disposed=false,writeUnknown=false,navigationKey=null,navigationAccepted=false;
  const reportState=()=>{
    setState?.({dirty,busy});
    const badge=el('editor-unsaved');
    if(badge){badge.hidden=!dirty&&!busy;badge.textContent=busy?'保存中…':'未保存';}
  };
  const validEtag=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const show=(message='',state='info')=>{
    const node=el('note-status');node.textContent=message;node.dataset.state=state;node.hidden=!message;
  };
  const label=note=>note.text.trim().split('\n').find(Boolean)?.slice(0,22)||'未命名笔记';
  const selected=()=>notes.find(note=>note.id===selectedId);
  const newId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,9);
  const validNote=note=>note&&typeof note==='object'&&typeof note.id==='string'&&
    typeof note.text==='string'&&note.text.length<=8192;
  function attachment() {
    const note=selected();
    const title=note?.pageTitle;
    el('note-attachment').textContent=title?'已关联：'+title:'';
    el('note-attachment').hidden=!title;
    el('attach-page').disabled=!ready||busy||Boolean(confirmation)||(!pageInfo&&!note?.pageUrl);
  }
  function renderView(){
    const index=el('notes-list-view'),edit=el('notes-edit-view');
    if(index)index.hidden=activeView!=='list';
    if(edit)edit.hidden=activeView!=='edit';
    const title=el('editor-title');if(title)title.textContent=selected()?'编辑笔记':'新建笔记';
    const empty=el('note-empty');if(empty)empty.hidden=notes.length>0;
    const close=el('back-to-notes');if(close){
      close.disabled=!ready||busy||Boolean(confirmation);
      const navigation={page:activeView==='edit'?'edit':'home',
        title:activeView==='edit'?(selected()?'编辑笔记':'新建笔记'):'我的笔记',
        canBack:activeView==='edit',primary:null};
      const key=JSON.stringify(navigation);
      if(key!==navigationKey){
        navigationKey=key;
        navigationAccepted=tool.setNavigation?.(navigation)===true;
      }
      close.hidden=navigationAccepted;
    }
  }
  function renderList() {
    reportState();
    el('note-text').disabled=!ready||deleting||Boolean(confirmation);
    const list=el('note-list');list.replaceChildren();
    for(const note of notes) {
      const button=root.ownerDocument.createElement('button');
      button.type='button';button.className='od-button od-button--secondary note-row';
      button.disabled=!ready||busy||Boolean(confirmation);
      button.title=label(note);
      button.setAttribute('aria-label','编辑笔记：'+label(note));
      const body=root.ownerDocument.createElement('span');body.className='note-row-body';
      const heading=root.ownerDocument.createElement('span');heading.className='note-row-title';heading.textContent=label(note);
      const excerpt=root.ownerDocument.createElement('span');excerpt.className='note-row-preview';
      const lines=note.text.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      excerpt.textContent=(lines.length>1?lines.slice(1).join(' '):note.text.trim().slice(22)).slice(0,140);
      body.append(heading);if(excerpt.textContent)body.append(excerpt);
      const cue=root.ownerDocument.createElement('span');cue.className='note-row-chevron';
      cue.textContent='›';cue.setAttribute('aria-hidden','true');
      button.append(body);button.append(cue);
      button.addEventListener('click',()=>selectNote(note.id));
      list.append(button);
    }
    el('note-count').textContent=notes.length+' 条';
    el('delete-note').disabled=!ready||busy||writeUnknown||Boolean(confirmation)||!selected();
    el('add-note').disabled=!ready||busy||Boolean(confirmation);
    el('save-note').disabled=!ready||busy||writeUnknown||Boolean(confirmation);
    el('open-task').disabled=!ready||busy||Boolean(confirmation);
    el('task-name').disabled=Boolean(confirmation);
    attachment();renderView();
  }
  // Shared confirmation is display-only. The original local control is used only
  // when the method is missing or Bridge explicitly rejects before sending.
  const snapshot=()=>({id:selectedId,etag:notesEtag,revision:draftRevision,
    view:activeView,text:el('note-text').value,include:el('attach-page').checked});
  const unchanged=prior=>!disposed&&ready&&!busy&&selectedId===prior.id&&
    notesEtag===prior.etag&&draftRevision===prior.revision&&activeView===prior.view&&
    el('note-text').value===prior.text&&el('attach-page').checked===prior.include;
  function ask(options,action) {
    if(confirmation||disposed)return;
    const pending={action,prior:snapshot(),focus:root.ownerDocument.activeElement,
      controller:typeof AbortController==='function'?new AbortController():null,local:false};
    confirmation=pending;
    const fallback=()=>{
      if(confirmation!==pending||!unchanged(pending.prior)){
        finishConfirmation(pending,{action:'cancel',reason:'invalidated'});return;
      }
      pending.local=true;
      el('note-confirm-message').textContent=options.message;
      el('note-confirm').hidden=false;
      renderList();el('note-confirm')?.scrollIntoView?.({block:'nearest'});el('note-confirm-cancel').focus();
    };
    const failed=error=>{
      if(confirmation!==pending)return;
      if(error?.code==='E_UI_CONFIRM_UNAVAILABLE'){fallback();return;}
      finishConfirmation(pending,{action:'cancel',reason:'invalidated'});
      if(!disposed)show('确认未完成，未执行操作。请保留草稿后重试。','error');
    };
    try{
      if(typeof tool.ui?.confirm!=='function'){fallback();return;}
      // Must remain in the original click/navigation dispatch stack.
      const deciding=tool.ui.confirm(options,{signal:pending.controller?.signal});
      renderList();
      Promise.resolve(deciding).then(answer=>finishConfirmation(pending,answer),failed)
        .catch(error=>{
          if(confirmation===pending)finishConfirmation(pending,{action:'cancel',reason:'invalidated'});
          if(!disposed)show('操作未完成，请保留草稿并重新核对。','error');
        });
    }catch(error){failed(error);}
  }
  function finishConfirmation(pending,answer) {
    if(confirmation!==pending)return;
    confirmation=null;
    el('note-confirm').hidden=true;
    if(disposed)return;
    renderList();
    if(answer?.action==='confirm'&&unchanged(pending.prior)){
      // Return the write promise so rejection stays on the confirmation chain.
      return pending.action(pending.prior);
    }
    (pending.focus?.isConnected?pending.focus:el('note-text')).focus();
  }
  function finishLocal(accepted,reason='user'){
    if(!confirmation?.local)return;
    try{
      Promise.resolve(finishConfirmation(confirmation,accepted?{action:'confirm'}:{action:'cancel',reason}))
        .catch(()=>{if(!disposed)show('操作未完成，请保留草稿并重新核对。','error');});
    }catch{if(!disposed)show('操作未完成，请保留草稿并重新核对。','error');}
  }
  function confirmDiscard(action) {
    if(!dirty){action();return;}
    ask({title:'放弃未保存的修改？',message:'当前笔记有未保存的修改，确定放弃吗？',
      confirmLabel:'放弃修改',cancelLabel:'保留修改',tone:'danger'},action);
  }
  function selectNote(id) {
    if(!ready||(id===selectedId&&activeView==='edit')||busy||confirmation||!notes.some(note=>note.id===id))return;
    confirmDiscard(()=>{
      if(!notes.some(note=>note.id===id))return;
      selectedId=id;dirty=false;
      const note=selected();
      el('note-text').value=note?.text||'';
      el('attach-page').checked=Boolean(note?.pageUrl);
      activeView='edit';renderList();show('');el('note-text').focus();
    });
  }
  function backToList(){
    if(!ready||busy||confirmation||activeView!=='edit')return;
    confirmDiscard(()=>{
      dirty=false;
      el('note-text').value=selected()?.text||'';
      el('attach-page').checked=Boolean(selected()?.pageUrl);
      activeView='list';renderList();show('');el('add-note').focus();
    });
  }
  function createNote() {
    if(!ready||busy||confirmation)return;
    confirmDiscard(()=>{
      selectedId=null;dirty=false;
      el('note-text').value='';el('attach-page').checked=false;
      activeView='edit';renderList();show('');el('note-text').focus();
    });
  }
  async function refreshPage() {
    const summary=el('page-summary'),url=el('page-url'),epoch=pageEpoch;
    if(el('refresh-page').disabled)return;
    el('refresh-page').disabled=true;
    try {
      const result=await request('currentPage.info');
      if(epoch!==pageEpoch)return;
      const address=result?.status==='available'?String(result.url||''):'';
      pageInfo=/^https?:\/\//i.test(address)?{title:String(result.title||'未命名网页'),url:address}:null;
      summary.textContent=pageInfo?pageInfo.title:'当前页面暂不支持读取，仍可使用离线笔记。';
      url.textContent=pageInfo?pageInfo.url:'';url.hidden=!pageInfo;
    }catch{
      if(epoch!==pageEpoch)return;
      pageInfo=null;summary.textContent='网页信息暂不可用，离线笔记不受影响。';url.textContent='';url.hidden=true;
    }finally{el('refresh-page').disabled=false;attachment();}
  }
  async function restore() {
    el('note-text').disabled=true;
    renderList();
    try{
      const current=await request('storage.get',{key:STORAGE_KEY,withEtag:true});
      if(typeof current.etag!=='string'||!/^[0-9a-f]{64}$/.test(current.etag))
        throw new Error('请更新并重新加载扩展以支持安全存储');
      let recovered=[];
      if(Array.isArray(current.value)){
        if(current.value.length>MAX_NOTES||!current.value.every(validNote))
          throw new Error('数据格式无效，禁止覆盖');
        recovered=current.value.map(note=>({id:note.id,text:note.text,
          pageTitle:typeof note.pageTitle==='string'?note.pageTitle.slice(0,512):'',
          pageUrl:typeof note.pageUrl==='string'?note.pageUrl.slice(0,4096):'',
          updatedAt:typeof note.updatedAt==='number'?note.updatedAt:0}));
      }else if(current.value!==null)throw new Error('数据格式无效，禁止覆盖');
      const old=await request('storage.get',{key:'note'});
      legacyPending=typeof old.value==='string'&&Boolean(old.value);
      const upgrading=current.value===null&&legacyPending;
      if(upgrading)recovered=[{id:newId(),text:old.value,pageTitle:'',pageUrl:'',updatedAt:0}];
      notes=recovered;notesEtag=current.etag;ready=true;activeView='list';
      selectedId=notes[0]?.id||null;el('note-text').disabled=false;
      el('note-text').value=selected()?.text||'';
      el('attach-page').checked=Boolean(selected()?.pageUrl);
      renderList();
      if(upgrading)show('已恢复旧版笔记，保存即可升级。');
      else if(legacyPending)show('旧版备份将在下次保存时清理。');
    }catch(error){
      ready=false;renderList();
      show('读取失败，已禁止写入以保护原数据。请返回工具列表并重开：'+error.message,'error');
    }
  }
  async function clearLegacy(){
    if(!legacyPending)return true;
    try{await request('storage.set',{key:'note',value:''});legacyPending=false;return true;}
    catch{return false;}
  }
  async function saveNote() {
    if(!ready||busy||writeUnknown||confirmation||disposed)return;
    const text=el('note-text').value,include=el('attach-page').checked,prior=selected(),id=prior?.id||newId();
    if(!text.trim()){show('请输入笔记内容再保存。','error');return;}
    if(!prior&&notes.length>=MAX_NOTES){show('最多保存 '+MAX_NOTES+' 条笔记。','error');return;}
    const linked=pageInfo;
    let writing=false;
    busy=true;renderList();
    try{
      if(include&&linked){
        const live=await request('currentPage.info');
        if(disposed)return;
        if(live?.status!=='available'||live.url!==linked.url){
          pageEpoch++;pageInfo=null;
          el('page-summary').textContent='网页已切换，请刷新网页信息。';
          el('page-url').textContent='';el('page-url').hidden=true;
          show('网页信息已变化，当前笔记未保存；请刷新或取消关联。','error');return;
        }
        linked.title=String(live.title||'未命名网页');
      }
      if(include&&!linked&&!prior?.pageUrl){
        show('当前网页不可关联，请取消勾选后保存离线笔记。','error');return;
      }
      const note={id,text,pageTitle:include?(linked?.title||prior?.pageTitle||''):'',
        pageUrl:include?(linked?.url||prior?.pageUrl||''):'',updatedAt:Date.now()};
      const next=prior?notes.map(row=>row.id===id?note:row):[note,...notes];
      if(bytes(next)>8192){
        show('所有笔记共用一个 8 KiB 存储项，已超出上限；请精简或删除旧笔记。','error');return;
      }
      writing=true;
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:notesEtag});
      if(result?.saved!==true||!validEtag(result.etag))throw new Error('存储回执无效');
      if(disposed)return;
      notes=next;notesEtag=result.etag;selectedId=id;
      dirty=el('note-text').value!==text||el('attach-page').checked!==include;
      const cleaned=await clearLegacy();
      if(disposed)return;
      show(!cleaned?'保存成功，但旧版备份清理失败；下次保存将重试。':
        dirty?'已保存此前内容；新修改仍未保存。':'已保存到本机。',cleaned?'success':'error');
    }catch(error){
      if(disposed)return;
      writeUnknown=writing;
      show(/其他窗口修改/.test(String(error?.message))
        ?'其他窗口已更新笔记，此次未覆盖。请复制当前输入，重新打开后核对。'
        :'保存失败或结果未知，输入仍保留。请重新打开核对后重试：'+error.message,'error');
    }finally{busy=false;if(!disposed)renderList();}
  }
  function deleteNote() {
    const note=selected();
    if(!ready||!note||busy||writeUnknown||confirmation||disposed)return;
    ask({title:'删除这条笔记？',message:'删除这条笔记？删除后无法恢复。',
      confirmLabel:'删除笔记',cancelLabel:'保留笔记',tone:'danger'},deleteConfirmed);
  }
  async function deleteConfirmed(prior) {
    if(!unchanged(prior)||writeUnknown||!selected())return;
    const next=notes.filter(row=>row.id!==prior.id);
    busy=true;deleting=true;renderList();
    try{
      // The original ID and whole-array version remain fixed across confirmation.
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:prior.etag});
      if(result?.saved!==true||!validEtag(result.etag))throw new Error('存储回执无效');
      if(disposed)return;
      notes=next;notesEtag=result.etag;selectedId=notes[0]?.id||null;dirty=false;activeView='list';
      el('note-text').value=selected()?.text||'';
      el('attach-page').checked=Boolean(selected()?.pageUrl);
      const cleaned=await clearLegacy();
      if(disposed)return;
      show(cleaned?'笔记已删除。':'笔记已删除，但旧版备份清理失败，下次保存会重试。',
        cleaned?'success':'error');
    }catch(error){
      if(disposed)return;
      writeUnknown=true;
      show(/其他窗口修改/.test(String(error?.message))
        ?'其他窗口已更改笔记，删除被阻止，请重开核对。'
        :'删除失败或结果未知，请重新打开核对：'+error.message,'error');
    }finally{busy=false;deleting=false;if(!disposed)renderList();}
  }
  el('note-confirm-cancel').addEventListener('click',()=>finishLocal(false));
  el('note-confirm-accept').addEventListener('click',()=>finishLocal(true));
  root.addEventListener('opendesk-tool-navigation',event=>{
    if(event.detail?.action==='back')backToList();
  });
  // Retire only this document's decision; late Host answers cannot execute it.
  root.ownerDocument.defaultView?.addEventListener('pagehide',()=>{
    disposed=true;
    const pending=confirmation;confirmation=null;
    pending?.controller?.abort();
    el('note-confirm').hidden=true;
  });
  root.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){
    event.preventDefault();if(!confirmation)void saveNote();return;
  }
    if(!confirmation?.local){
      return;
    }
    if(event.key==='Escape'){event.preventDefault();finishLocal(false,'escape');}
    if(event.key==='Tab'){
      event.preventDefault();
      const cancel=el('note-confirm-cancel'),accept=el('note-confirm-accept');
      (root.ownerDocument.activeElement===cancel?accept:cancel).focus();
    }
  });
  el('note-text').addEventListener('input',()=>{if(!ready||deleting)return;draftRevision++;dirty=true;reportState();show('当前修改尚未保存。');});
  el('attach-page').addEventListener('change',()=>{if(!ready||busy)return;draftRevision++;dirty=true;reportState();show('当前修改尚未保存。');});
  el('refresh-page').addEventListener('click',()=>void refreshPage());
  el('add-note').addEventListener('click',createNote);
  el('back-to-notes')?.addEventListener('click',backToList);
  el('save-note').addEventListener('click',()=>void saveNote());
  el('delete-note').addEventListener('click',()=>void deleteNote());
  el('open-task').addEventListener('click',async()=>{
    if(!ready||busy||confirmation)return;
    const taskId=el('task-name').value.trim();
    if(!taskId){show('请先填写任务 ID。','error');return;}
    try{await request('tasks.open',{taskId});}
    catch(error){show('打开任务失败：'+error.message,'error');}
  });
  root.addEventListener('opendesk-page-changed',()=>{
    pageEpoch++;pageInfo=null;
    el('page-summary').textContent='网页已切换，点击刷新获取当前网页信息。';
    el('page-url').textContent='';el('page-url').hidden=true;attachment();
  });
  void Promise.all([restore(),refreshPage()]);
})();
