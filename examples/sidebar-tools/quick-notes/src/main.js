(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const el=id=>root.querySelector('#'+id);
  const STORAGE_KEY='notes';
  const MAX_NOTES=16;
  let notes=[],selectedId=null,dirty=false,pageInfo=null,busy=false,legacyId=null;
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
    el('attach-page').disabled=!pageInfo&&!note?.pageUrl;
  }
  function renderList() {
    const list=el('note-list');list.replaceChildren();
    for(const note of notes) {
      const button=root.ownerDocument.createElement('button');
      button.type='button';button.className='note-chip';button.textContent=label(note);
      button.title=label(note);button.dataset.selected=String(note.id===selectedId);
      button.setAttribute('aria-label','编辑笔记：'+label(note));
      button.setAttribute('aria-pressed',String(note.id===selectedId));
      button.addEventListener('click',()=>selectNote(note.id));
      list.append(button);
    }
    el('note-count').textContent=notes.length+' 条';
    el('delete-note').disabled=!selected();
    attachment();
  }
  function confirmDiscard() {
    return !dirty||globalThis.confirm('当前笔记有未保存的修改，确定放弃吗？');
  }
  function selectNote(id) {
    if(id===selectedId||busy||!confirmDiscard())return;
    selectedId=id;dirty=false;
    const note=selected();
    el('note-text').value=note?.text||'';
    el('attach-page').checked=Boolean(note?.pageUrl);
    renderList();show('');
  }
  function createNote() {
    if(busy||!confirmDiscard())return;
    selectedId=null;dirty=false;
    el('note-text').value='';el('attach-page').checked=false;
    renderList();show('');el('note-text').focus();
  }
  async function refreshPage() {
    const summary=el('page-summary'),url=el('page-url');
    el('refresh-page').disabled=true;
    try {
      const result=await request('currentPage.info');
      const address=result?.status==='available'?String(result.url||''):'';
      pageInfo=/^https?:\/\//i.test(address)?{title:String(result.title||'未命名网页'),url:address}:null;
      summary.textContent=pageInfo?pageInfo.title:'当前页面暂不支持读取，仍可使用离线笔记。';
      url.textContent=pageInfo?pageInfo.url:'';url.hidden=!pageInfo;
    }catch{
      pageInfo=null;summary.textContent='网页信息暂不可用，离线笔记不受影响。';url.hidden=true;
    }finally{el('refresh-page').disabled=false;attachment();}
  }
  async function restore() {
    try {
      const result=await request('storage.get',{key:STORAGE_KEY});
      if(Array.isArray(result.value)) {
        if(result.value.length>MAX_NOTES||!result.value.every(validNote))throw new Error('本地笔记格式无效');
        notes=result.value.map(note=>({id:note.id,text:note.text,
          pageTitle:typeof note.pageTitle==='string'?note.pageTitle.slice(0,512):'',
          pageUrl:typeof note.pageUrl==='string'?note.pageUrl.slice(0,4096):'',
          updatedAt:typeof note.updatedAt==='number'?note.updatedAt:0}));
      }else if(result.value===null) {
        // R1 stored one plain-text `note` string. Keep it readable without deleting that key.
        const old=await request('storage.get',{key:'note'});
        if(typeof old.value==='string'&&old.value.trim()){
          legacyId=newId();notes=[{id:legacyId,text:old.value,pageTitle:'',pageUrl:'',updatedAt:0}];
          show('已恢复旧版笔记，点击保存即可升级。');
        }
      }else throw new Error('本地笔记格式无效');
      selectedId=notes[0]?.id||null;
      el('note-text').value=selected()?.text||'';
      el('attach-page').checked=Boolean(selected()?.pageUrl);
      renderList();
    }catch(error){show('读取本地笔记失败：'+error.message,'error');}
  }
  async function saveNote() {
    if(busy)return;
    const text=el('note-text').value;
    if(!text.trim()){show('请输入笔记内容再保存。','error');return;}
    if(!selected()&&notes.length>=MAX_NOTES){show('最多保存 '+MAX_NOTES+' 条笔记。','error');return;}
    const prior=selected(),id=prior?.id||newId();
    const include=el('attach-page').checked;
    const note={id,text,pageTitle:include?(pageInfo?.title||prior?.pageTitle||''):'',
      pageUrl:include?(pageInfo?.url||prior?.pageUrl||''):'',updatedAt:Date.now()};
    const next=prior?notes.map(row=>row.id===id?note:row):[note,...notes];
    if(bytes(next)>8192){show('本地笔记已达到 8 KB 容量，请精简内容或删除旧笔记。','error');return;}
    busy=true;el('save-note').disabled=true;
    try {
      await request('storage.set',{key:STORAGE_KEY,value:next});
      notes=next;selectedId=id;dirty=el('note-text').value!==text;renderList();
      show(dirty?'已保存之前的内容；当前修改尚未保存。':'已保存到本机。','success');
    }catch(error){show('保存失败：'+error.message,'error');}
    finally{busy=false;el('save-note').disabled=false;}
  }
  async function deleteNote() {
    const note=selected();
    if(!note||busy||!globalThis.confirm('删除这条笔记？删除后无法恢复。'))return;
    const next=notes.filter(row=>row.id!==note.id);
    busy=true;el('delete-note').disabled=true;
    try {
      await request('storage.set',{key:STORAGE_KEY,value:next});
      if(note.id===legacyId){await request('storage.set',{key:'note',value:''});legacyId=null;}
      notes=next;selectedId=notes[0]?.id||null;dirty=false;
      el('note-text').value=selected()?.text||'';el('attach-page').checked=Boolean(selected()?.pageUrl);
      renderList();show('笔记已删除。','success');
    }catch(error){renderList();show('删除失败：'+error.message,'error');}
    finally{busy=false;}
  }
  el('note-text').addEventListener('input',()=>{dirty=true;show('');});
  el('attach-page').addEventListener('change',()=>{dirty=true;show('');});
  el('refresh-page').addEventListener('click',()=>void refreshPage());
  el('add-note').addEventListener('click',createNote);
  el('save-note').addEventListener('click',()=>void saveNote());
  el('delete-note').addEventListener('click',()=>void deleteNote());
  el('note-text').addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();void saveNote();}
  });
  el('open-task').addEventListener('click',async()=>{
    const taskId=el('task-name').value.trim();
    if(!taskId){show('请先填写任务 ID。','error');return;}
    try{await request('tasks.open',{taskId});}
    catch(error){show('打开任务失败：'+error.message,'error');}
  });
  void Promise.all([restore(),refreshPage()]);
})();
