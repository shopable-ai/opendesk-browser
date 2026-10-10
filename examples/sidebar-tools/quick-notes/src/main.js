(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const el=id=>root.querySelector('#'+id);
  const STORAGE_KEY='notes';
  const MAX_NOTES=16;
  let notes=[],selectedId=null,dirty=false,pageInfo=null,busy=false,ready=false;
  let notesEtag=null,legacyPending=false,pageEpoch=0;
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
    el('attach-page').disabled=!ready||busy||(!pageInfo&&!note?.pageUrl);
  }
  function renderList() {
    const list=el('note-list');list.replaceChildren();
    for(const note of notes) {
      const button=root.ownerDocument.createElement('button');
      button.type='button';button.className='note-chip';button.textContent=label(note);
      button.disabled=!ready||busy;
      button.title=label(note);button.dataset.selected=String(note.id===selectedId);
      button.setAttribute('aria-label','编辑笔记：'+label(note));
      button.setAttribute('aria-pressed',String(note.id===selectedId));
      button.addEventListener('click',()=>selectNote(note.id));
      list.append(button);
    }
    el('note-count').textContent=notes.length+' 条';
    el('delete-note').disabled=!ready||busy||!selected();
    el('add-note').disabled=!ready||busy;
    el('save-note').disabled=!ready||busy;
    attachment();
  }
  function confirmDiscard() {
    return !dirty||globalThis.confirm('当前笔记有未保存的修改，确定放弃吗？');
  }
  function selectNote(id) {
    if(!ready||id===selectedId||busy||!confirmDiscard())return;
    selectedId=id;dirty=false;
    const note=selected();
    el('note-text').value=note?.text||'';
    el('attach-page').checked=Boolean(note?.pageUrl);
    renderList();show('');
  }
  function createNote() {
    if(!ready||busy||!confirmDiscard())return;
    selectedId=null;dirty=false;
    el('note-text').value='';el('attach-page').checked=false;
    renderList();show('');el('note-text').focus();
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
      notes=recovered;notesEtag=current.etag;ready=true;
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
    if(!ready||busy)return;
    const text=el('note-text').value,include=el('attach-page').checked,prior=selected(),id=prior?.id||newId();
    if(!text.trim()){show('请输入笔记内容再保存。','error');return;}
    if(!prior&&notes.length>=MAX_NOTES){show('最多保存 '+MAX_NOTES+' 条笔记。','error');return;}
    const linked=pageInfo;
    busy=true;renderList();
    try{
      if(include&&linked){
        const live=await request('currentPage.info');
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
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:notesEtag});
      notes=next;notesEtag=result.etag;selectedId=id;
      dirty=el('note-text').value!==text||el('attach-page').checked!==include;
      const cleaned=await clearLegacy();
      show(!cleaned?'保存成功，但旧版备份清理失败；下次保存将重试。':
        dirty?'已保存此前内容；新修改仍未保存。':'已保存到本机。',cleaned?'success':'error');
    }catch(error){
      show(/其他窗口修改/.test(String(error?.message))
        ?'其他窗口已更新笔记，此次未覆盖。请复制当前输入，重新打开后核对。'
        :'保存失败或结果未知，输入仍保留。请重新打开核对后重试：'+error.message,'error');
    }finally{busy=false;renderList();}
  }
  async function deleteNote() {
    const note=selected();
    if(!ready||!note||busy||!globalThis.confirm('删除这条笔记？删除后无法恢复。'))return;
    const next=notes.filter(row=>row.id!==note.id);
    busy=true;renderList();
    try{
      // The authoritative array/tombstone is committed before obsolete-field cleanup.
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:notesEtag});
      notes=next;notesEtag=result.etag;selectedId=notes[0]?.id||null;dirty=false;
      el('note-text').value=selected()?.text||'';
      el('attach-page').checked=Boolean(selected()?.pageUrl);
      const cleaned=await clearLegacy();
      show(cleaned?'笔记已删除。':'笔记已删除，但旧版备份清理失败，下次保存会重试。',
        cleaned?'success':'error');
    }catch(error){
      show(/其他窗口修改/.test(String(error?.message))
        ?'其他窗口已更改笔记，删除被阻止，请重开核对。'
        :'删除失败或结果未知，请重新打开核对：'+error.message,'error');
    }finally{busy=false;renderList();}
  }
  el('note-text').addEventListener('input',()=>{if(!ready)return;dirty=true;show('当前修改尚未保存。');});
  el('attach-page').addEventListener('change',()=>{if(!ready)return;dirty=true;show('当前修改尚未保存。');});
  el('refresh-page').addEventListener('click',()=>void refreshPage());
  el('add-note').addEventListener('click',createNote);
  el('save-note').addEventListener('click',()=>void saveNote());
  el('delete-note').addEventListener('click',()=>void deleteNote());
  el('note-text').addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();void saveNote();}
  });
  el('open-task').addEventListener('click',async()=>{
    if(!confirmDiscard())return;
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
