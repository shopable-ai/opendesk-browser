(() => {
'use strict';
const sdk=globalThis.OpenDeskTool,m=globalThis.OpenDeskKnowledgeAnswersModel;
if(!sdk?.root||typeof sdk.request!=='function'||!m)throw new Error('E_KB_APP_INIT');
const {root,request,setState}=sdk,$=id=>root.querySelector('#'+id);
const edits=['qa-question','qa-answer','qa-aliases','qa-scope','qa-enabled'];
const actions=['qa-new','qa-empty-new','qa-delete','qa-save','qa-ask','qa-search',
  'qa-file','qa-mode','qa-import','qa-export-json','qa-export-csv'];
let kb=m.empty(),etag='',ready=false,busy=false,dirty=false,uncertain=false;
let view='ask',selected=null,review=null,filter='all',search='';
function notice(text='',error=false){
  const el=$('qa-status');el.hidden=!text;el.textContent=text;el.dataset.error=String(error);
}
function state(){
  const blocked=!ready||busy||uncertain||Boolean(review);
  setState?.({dirty,busy});
  for(const id of [...edits,...actions])$(id).disabled=blocked;
  $('qa-delete').hidden=!selected;$('qa-delete').disabled=blocked||!selected;
  $('qa-refresh').disabled=busy||Boolean(review);
  $('qa-manage-toggle').disabled=blocked;
  for(const button of $('qa-list').querySelectorAll('button'))button.disabled=blocked;
  $('qa-count').textContent=ready?kb.items.length:'—';
  $('qa-edit-state').textContent=uncertain?'写入待核对':busy?'正在保存…':dirty?'未保存修改':'';
}
function show(target,focus=true){
  view=target;
  $('qa-view-ask').hidden=view!=='ask';$('qa-view-list').hidden=view!=='list';
  $('qa-view-edit').hidden=view!=='edit';
  for(const [id,k] of [['qa-tab-ask','ask'],['qa-tab-list','list']]){
    const tab=$(id),active=k===(view==='edit'?'list':view);
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    tab.classList.toggle('od-button--secondary',active);tab.classList.toggle('od-button--quiet',!active);
  }
  state();
  if(focus)$(view==='ask'?'qa-query':view==='list'?'qa-search':'qa-question').focus({preventScroll:true});
}
function confirmAction(message,work,label='确认'){
  if(review||busy)return;
  review={work,focus:root.ownerDocument.activeElement};
  $('qa-review-message').textContent=message;$('qa-accept').textContent=label;
  $('qa-review').hidden=false;state();$('qa-cancel').focus();
}
function reviewDone(ok){
  if(!review)return;
  const chosen=review;review=null;$('qa-review').hidden=true;state();
  if(ok)void Promise.resolve().then(chosen.work).catch(e=>notice('操作失败：'+String(e?.message||e),true));
  else (chosen.focus?.isConnected?chosen.focus:$('qa-tab-list')).focus({preventScroll:true});
}
$('qa-cancel').addEventListener('click',()=>reviewDone(false));
$('qa-accept').addEventListener('click',()=>reviewDone(true));
root.ownerDocument.addEventListener('keydown',e=>{if(e.key==='Escape'&&review){e.preventDefault();reviewDone(false);}});
function guard(action){
  if(busy||review)return;
  if(dirty||uncertain)confirmAction(uncertain?
    '写入结果尚未确认。请先复制重要输入。放弃输入并重新读取真实存储？':
    '当前内容尚未保存。确定放弃本次编辑吗？',action,uncertain?'放弃并核对':'放弃修改');
  else action();
}
function navigate(target){if(target===view)return;guard(()=>{dirty=false;show(target);});}
$('qa-tab-ask').addEventListener('click',()=>navigate('ask'));
$('qa-tab-list').addEventListener('click',()=>navigate('list'));
for(const id of ['qa-tab-ask','qa-tab-list'])$(id).addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();const other=$(id==='qa-tab-ask'?'qa-tab-list':'qa-tab-ask');
  other.click();other.focus({preventScroll:true});
});
$('qa-back').addEventListener('click',()=>navigate('list'));
$('qa-manage-toggle').addEventListener('click',()=>{
  const panel=$('qa-manage');panel.hidden=!panel.hidden;
  $('qa-manage-toggle').setAttribute('aria-expanded',String(!panel.hidden));
});
function fill(row){
  $('qa-question').value=row?.question||'';$('qa-answer').value=row?.answer||'';
  $('qa-aliases').value=row?.aliases.join('\n')||'';$('qa-scope').value=row?.scope||'';
  $('qa-enabled').checked=row?.enabled??true;
  $('qa-editor-more').open=Boolean(row&&(row.aliases.length||row.scope||!row.enabled));
  dirty=false;state();
}
function openEditor(id=null){
  if(!ready||busy||uncertain||review)return;
  const row=id?kb.items.find(x=>x.id===id):null;
  if(id&&!row){notice('知识条目已不存在，请重新读取',true);return;}
  selected=id;fill(row);
  $('qa-editor-title').textContent=row?'编辑知识':'新建知识';
  $('qa-manage').hidden=true;$('qa-manage-toggle').setAttribute('aria-expanded','false');
  notice('');show('edit');
}
$('qa-new').addEventListener('click',()=>openEditor());
$('qa-empty-new').addEventListener('click',()=>openEditor());
function list(){
  const box=$('qa-list');box.replaceChildren();
  const rows=kb.items.filter(row=>(filter==='all'||(filter==='enabled')===row.enabled)&&
    [row.question,row.answer,row.scope,...row.aliases].join(' ').toLowerCase().includes(search));
  for(const row of rows){
    const outer=root.ownerDocument.createElement('div');outer.className='qa-record-row';
    outer.setAttribute('role','listitem');
    const button=root.ownerDocument.createElement('button');button.className='od-button od-button--secondary qa-record';
    button.type='button';button.setAttribute('aria-label','编辑知识：'+row.question);
    const body=root.ownerDocument.createElement('span');body.className='qa-record-main';
    const title=root.ownerDocument.createElement('strong');title.className='qa-record-title';
    title.textContent=row.question;
    const excerpt=root.ownerDocument.createElement('span');excerpt.className='qa-record-excerpt';
    excerpt.textContent=row.answer;
    const meta=root.ownerDocument.createElement('span');meta.className='qa-record-meta';
    const dot=root.ownerDocument.createElement('span');dot.className='qa-dot'+(row.enabled?'':' off');
    dot.setAttribute('aria-hidden','true');
    const summary=root.ownerDocument.createElement('span');
    summary.textContent=(row.enabled?'已启用':'已停用')+(row.scope?' · '+row.scope:'')+
      (row.aliases.length?' · '+row.aliases.length+' 条同义问法':'');
    meta.append(dot,summary);body.append(title,excerpt,meta);
    const arrow=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
    arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');
    const path=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','m9 5 7 7-7 7');arrow.append(path);
    button.append(body,arrow);button.addEventListener('click',()=>openEditor(row.id));
    outer.append(button);box.append(outer);
  }
  $('qa-filter-count').textContent=rows.length+' 条';
  $('qa-list-empty').hidden=rows.length>0;
  $('qa-empty-title').textContent=kb.items.length?'没有匹配的知识':'知识库还是空的';
  $('qa-empty-description').textContent=kb.items.length?'试试清除搜索或切换筛选。':'可以先导入示例知识或新建一条问答。';
  $('qa-empty-new').hidden=kb.items.length>0;state();
}
$('qa-search').addEventListener('input',()=>{search=$('qa-search').value.trim().toLowerCase();list();});
root.querySelectorAll('[data-qa-filter]').forEach(b=>b.addEventListener('click',()=>{
  filter=b.dataset.qaFilter;
  root.querySelectorAll('[data-qa-filter]').forEach(el=>{
    const active=el===b;el.setAttribute('aria-pressed',String(active));
    el.classList.toggle('od-button--secondary',active);el.classList.toggle('od-button--quiet',!active);
  });
  list();
}));
async function load(){
  if(busy||review)return;
  busy=true;ready=false;state();
  try{
    const response=await request('storage.get',{key:'library',withEtag:true});
    if(typeof response?.etag!=='string'||!/^[a-f0-9]{64}$/u.test(response.etag))
      throw new Error('未获得可信存储版本，不能覆盖原数据');
    kb=response.value==null?m.empty():m.library(response.value);etag=response.etag;
    ready=true;uncertain=false;dirty=false;selected=null;fill(null);list();
    $('qa-result').hidden=true;
    if(view==='edit')show('list',false);
    notice('已从本机知识库读取');
  }catch(e){uncertain=true;notice('读取失败：'+String(e?.message||e)+'。请保留原数据并核对。',true);}
  finally{busy=false;state();}
}
$('qa-refresh').addEventListener('click',()=>guard(()=>void load()));
async function commit(next,{success='保存并读回成功',after}={}){
  if(!ready||busy||uncertain||review)return false;
  busy=true;state();
  try{
    const result=await request('storage.set',{key:'library',value:next,ifMatch:etag});
    if(result?.saved!==true)throw Error('未获得保存回执');
    const checked=await request('storage.get',{key:'library',withEtag:true});
    if(!/^[a-f0-9]{64}$/u.test(checked?.etag||'')||
       JSON.stringify(m.library(checked.value))!==JSON.stringify(next))
      throw Error('保存后独立读回未确认一致');
    kb=m.library(checked.value);etag=checked.etag;uncertain=false;dirty=false;
    after?.();list();$('qa-result').hidden=true;notice(success);return true;
  }catch(e){
    uncertain=true;dirty=true;
    notice('写入结果未确认（'+String(e?.code||'UNKNOWN')+'）：'+String(e?.message||e)+
      '。请保留当前内容，核对实际存储，不自动重复写入。',true);
    return false;
  }finally{busy=false;state();}
}
$('qa-editor').addEventListener('submit',e=>{
  e.preventDefault();
  if(!ready||busy||uncertain||review)return;
  let row,next;
  try{
    row=m.row({id:selected||m.newId(),question:$('qa-question').value,answer:$('qa-answer').value,
      aliases:$('qa-aliases').value.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean),
      scope:$('qa-scope').value,enabled:$('qa-enabled').checked});
    next=m.save(kb,row);
  }catch(error){notice('内容校验失败：'+String(error?.message||error),true);return;}
  void commit(next,{success:'知识已保存并读回确认',after:()=>{
    selected=null;fill(null);search='';filter='all';$('qa-search').value='';
    root.querySelectorAll('[data-qa-filter]').forEach(b=>{
      const active=b.dataset.qaFilter==='all';b.setAttribute('aria-pressed',String(active));
      b.classList.toggle('od-button--secondary',active);b.classList.toggle('od-button--quiet',!active);
    });
    show('list',false);
  }});
});
$('qa-delete').addEventListener('click',()=>{
  if(!selected||busy||uncertain||review)return;
  const row=kb.items.find(x=>x.id===selected);if(!row)return;
  confirmAction('确定删除这条知识？\n'+row.question+'\n删除后无法直接撤销。',()=>
    commit(m.remove(kb,row.id),{success:'已删除并读回确认',after:()=>{
      selected=null;fill(null);show('list',false);}}),'删除');
});
for(const id of edits){
  $(id).addEventListener('input',()=>{if(ready&&!busy&&!uncertain){dirty=true;state();}});
  $(id).addEventListener('change',()=>{if(ready&&!busy&&!uncertain){dirty=true;state();}});
}
$('qa-ask').addEventListener('click',()=>{
  if(!ready||busy||uncertain)return;
  const sources=$('qa-result-sources');sources.replaceChildren();$('qa-result').hidden=true;
  try{
    const r=m.lookup(kb,{question:$('qa-query').value,scope:$('qa-query-scope').value.trim()});
    $('qa-result-kind').textContent=({ANSWERED_FIXED:'固定答案',RETRIEVED_ONLY:'检索到相关知识',
      AMBIGUOUS:'资料冲突',NO_MATCH:'没有可信依据'})[r.status]||'人工核对';
    $('qa-result-count').textContent=r.sourceIds.length+' 条来源';
    $('qa-result-text').textContent=r.answer||(r.status==='RETRIEVED_ONLY'?
      '找到了相关资料，本次仅展示检索结果。如上方显示可信 AI 问答，请在那里准备并审阅知识后发送。':
      '缺少确定的知识依据，请人工核对。');
    for(const id of r.sourceIds){
      const row=kb.items.find(x=>x.id===id),li=root.ownerDocument.createElement('li');
      const name=root.ownerDocument.createElement('span');name.textContent=row?.question||'未知来源';
      const key=root.ownerDocument.createElement('span');key.className='qa-source-id';key.textContent=id;
      li.append(name,key);sources.append(li);
    }
    $('qa-result').hidden=false;notice('');
  }catch(error){notice('查询失败：'+String(error?.message||error),true);}
});
$('qa-import').addEventListener('click',async()=>{
  if(!ready||busy||uncertain||review)return;
  const file=$('qa-file').files?.[0];
  if(!file){notice('请选择 JSON 或 CSV 文件',true);return;}
  if(file.size>65536){notice('导入文件超过 64 KiB',true);return;}
  busy=true;state();let plan=null;
  try{
    const content=await file.text();
    const parsed=/\.csv$/iu.test(file.name)?m.parseCsv(content):m.parseJson(content);
    plan=m.merge(kb,parsed,$('qa-mode').value);
  }catch(e){notice('导入校验失败，原知识未修改：'+String(e?.message||e),true);}
  finally{busy=false;state();}
  if(!plan)return;
  confirmAction('导入预览：'+file.name.slice(0,80)+
    '\n方式：'+(plan.mode==='replace'?'替换全部':'按 ID 合并')+
    '\n新增 '+plan.added+' 条，跳过重复 '+plan.conflicts+' 条，最终 '+plan.library.items.length+' 条。'+
    (plan.mode==='replace'?'\n现有知识将被替换。':''),()=>
      commit(plan.library,{success:'导入已保存并读回确认',after:()=>{
        $('qa-manage').hidden=true;$('qa-manage-toggle').setAttribute('aria-expanded','false');}}),'确认导入');
});
$('qa-export-json').addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;busy=true;state();
  try{
    const r=await request('file.download',{filename:'ai-knowledge-answers.json',text:JSON.stringify(kb,null,2)});
    notice('已提交 JSON 下载（'+String(r?.downloadId??'无 ID')+'），请确认浏览器实际保存文件。');
  }catch(e){notice('导出失败：'+String(e?.message||e),true);}
  finally{busy=false;state();}
});
$('qa-export-csv').addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;busy=true;state();
  try{
    const r=await request('clipboard.writeText',{text:m.exportCsv(kb)});
    if(r?.copied!==true)throw Error('没有收到复制回执');
    notice('CSV 已复制到剪贴板；未创建文件。');
  }catch(e){notice('复制 CSV 失败：'+String(e?.message||e),true);}
  finally{busy=false;state();}
});
show('ask',false);void load();
})();
