(() => {
  'use strict';
  const {root,request}=globalThis.OpenDeskTool;
  const el=id=>root.querySelector('#'+id);
  const show=message=>{el('note-status').textContent=message;};
  async function refreshPage() {
    try {
      const page=await request('currentPage.info');
      el('page-summary').textContent=page.status==='available'?
        page.title+' · '+page.url:'当前网页不可用：'+page.message;
    }catch(error){el('page-summary').textContent=error.message;}
  }
  async function restore() {
    try{const result=await request('storage.get',{key:'note'});el('note-text').value=String(result.value||'');}
    catch(error){show('恢复笔记失败：'+error.message);}
  }
  el('refresh-page').addEventListener('click',()=>void refreshPage());
  el('save-note').addEventListener('click',async()=>{
    try{await request('storage.set',{key:'note',value:el('note-text').value});show('笔记已保存到此工具的本地存储');}
    catch(error){show('保存失败：'+error.message);}
  });
  el('open-task').addEventListener('click',async()=>{
    try{await request('tasks.open',{taskId:el('task-name').value.trim()});}
    catch(error){show('打开任务失败：'+error.message);}
  });
  void Promise.all([refreshPage(),restore()]);
})();
