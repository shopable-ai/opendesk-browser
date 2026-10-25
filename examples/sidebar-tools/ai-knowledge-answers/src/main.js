(() => {
'use strict';
const sdk=globalThis.OpenDeskTool,model=globalThis.OpenDeskKnowledgeAnswersModel;
if(!sdk?.root||typeof sdk.request!=='function'||!model)throw new Error('E_KB_APP_INIT');
const {root,request,setState}=sdk,$=id=>root.querySelector('#'+id);
const editFields=['qa-question','qa-aliases','qa-answer','qa-scope','qa-enabled'];
const editable=['qa-new','qa-delete','qa-save','qa-ask','qa-import',
  'qa-export-json','qa-export-csv','qa-file','qa-mode',...editFields];
let kb=model.empty(),etag='',ready=false,busy=false,dirty=false,uncertain=false,selected=null,review=null;
const status=(message='',error=false)=>{
  $('qa-status').textContent=message;
  $('qa-status').dataset.error=String(error);
  $('qa-status').hidden=!message;
};
function state(){
  setState?.({dirty,busy});
  for(const id of editable)$(id).disabled=!ready||busy||uncertain||Boolean(review);
  $('qa-delete').disabled=!ready||busy||uncertain||Boolean(review)||!selected;
  for(const button of $('qa-list').querySelectorAll('button'))
    button.disabled=!ready||busy||uncertain||Boolean(review);
  $('qa-refresh').disabled=busy||Boolean(review);
  $('qa-count').textContent=ready?kb.items.length+' 条 · '+model.size(kb)+' / 8192 B':'未就绪';
  $('qa-edit-state').textContent=uncertain?'写入待核对':dirty?'未保存':'';
}
function fill(item){
  $('qa-question').value=item?.question||'';
  $('qa-aliases').value=item?.aliases.join('\n')||'';
  $('qa-answer').value=item?.answer||'';
  $('qa-scope').value=item?.scope||'';
  $('qa-enabled').checked=item?.enabled??true;
  dirty=false;state();
}
function renderList(){
  const box=$('qa-list');box.replaceChildren();
  for(const item of kb.items){
    const button=root.ownerDocument.createElement('button');
    button.className='od-button '+(item.id===selected?'od-button--primary':'od-button--secondary');
    button.type='button';button.textContent=item.question;
    button.title=item.question;button.disabled=busy||Boolean(review);
    button.setAttribute('aria-pressed',String(item.id===selected));
    button.addEventListener('click',()=>choose(item.id));
    box.append(button);
  }
  if(!kb.items.length)box.textContent='还没有知识。请新建或导入。';
  state();
}
function confirmAction(message,onAccept,label='确认'){
  if(review||busy)return;
  review={onAccept,focus:root.ownerDocument.activeElement};
  $('qa-review-message').textContent=message;
  $('qa-accept').textContent=label;
  $('qa-review').hidden=false;
  state();$('qa-cancel').focus();
}
function reviewDone(accepted){
  if(!review)return;
  const chosen=review;review=null;
  $('qa-review').hidden=true;state();
  if(accepted)void Promise.resolve().then(chosen.onAccept).catch(error=>
    status('操作失败：'+String(error?.message||error),true));
  else (chosen.focus?.isConnected?chosen.focus:$('qa-question')).focus();
}
$('qa-cancel').addEventListener('click',()=>reviewDone(false));
$('qa-accept').addEventListener('click',()=>reviewDone(true));
function discardThen(action){
  if(busy||!ready)return;
  if(dirty)confirmAction('当前知识尚未保存。确定放弃编辑？',action,'放弃修改');
  else action();
}
function choose(id){
  if(!ready||busy||review||uncertain||selected===id)return;
  discardThen(()=>{
    selected=id;fill(kb.items.find(item=>item.id===id));renderList();
    status('');$('qa-question').focus();
  });
}
$('qa-new').addEventListener('click',()=>{
  if(!ready||busy||review||uncertain)return;
  discardThen(()=>{selected=null;fill(null);renderList();status('');$('qa-question').focus();});
});
for(const id of editFields){
  $(id).addEventListener('input',()=>{if(ready&&!busy&&!uncertain){dirty=true;state();}});
  if(id==='qa-enabled')$(id).addEventListener('change',()=>{if(ready&&!busy&&!uncertain){dirty=true;state();}});
}
function readEditor(){
  return model.row({id:selected||model.newId(),
    question:$('qa-question').value,
    aliases:$('qa-aliases').value.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean),
    answer:$('qa-answer').value,scope:$('qa-scope').value,enabled:$('qa-enabled').checked});
}
async function load(){
  if(busy||review)return;
  busy=true;ready=false;state();
  try{
    const found=await request('storage.get',{key:'library',withEtag:true});
    if(typeof found?.etag!=='string'||!/^[a-f0-9]{64}$/u.test(found.etag))
      throw new Error('Host 未返回知识库版本，禁止覆盖');
    kb=found.value==null?model.empty():model.library(found.value);
    etag=found.etag;ready=true;dirty=false;uncertain=false;selected=null;fill(null);
    renderList();$('qa-result').hidden=true;status('知识库已从可信存储读回');
  }catch(error){
    uncertain=true;status('知识库读取失败，已停止写入：'+String(error?.message||error),true);
  }finally{busy=false;state();}
}
async function commit(next,{after,success='知识已保存并读回确认'}={}){
  if(!ready||busy||uncertain||review)return;
  busy=true;state();
  try{
    const receipt=await request('storage.set',{key:'library',value:next,ifMatch:etag});
    if(receipt?.saved!==true)throw new Error('未获得有效保存回执');
    const verification=await request('storage.get',{key:'library',withEtag:true});
    if(typeof verification?.etag!=='string'||!/^[a-f0-9]{64}$/u.test(verification.etag)||
       JSON.stringify(model.library(verification.value))!==JSON.stringify(next))
      throw new Error('保存后独立读回未确认一致');
    kb=model.library(verification.value);etag=verification.etag;
    dirty=false;after?.();renderList();$('qa-result').hidden=true;status(success);
  }catch(error){
    // Unknown write effects must not be replayed automatically or overwritten.
    uncertain=true;dirty=true;
    status('保存结果待核对（'+String(error?.code||'UNKNOWN')+'）：'+String(error?.message||error)+
      '。请保留输入，重新读取实际存储后才能继续。',true);
  }finally{busy=false;state();}
}
$('qa-save').addEventListener('click',()=>{
  if(!ready||busy||uncertain||review)return;
  let entry,next;
  try{entry=readEditor();next=model.save(kb,entry);}
  catch(error){status('内容校验失败：'+String(error?.message||error),true);return;}
  void commit(next,{after:()=>{selected=entry.id;fill(entry);}});
});
$('qa-delete').addEventListener('click',()=>{
  if(!selected||!ready||busy||uncertain||review)return;
  const item=kb.items.find(x=>x.id===selected);
  confirmAction('确认删除这条知识？\n'+item.question+'\n删除后无法撤销。',()=>{
    const next=model.remove(kb,item.id);
    return commit(next,{after:()=>{selected=null;fill(null);},success:'已删除并读回确认'});
  },'删除知识');
});
$('qa-ask').addEventListener('click',()=>{
  if(!ready||busy||uncertain)return;
  const resultBox=$('qa-result'),sources=$('qa-result-sources');
  resultBox.hidden=true;sources.replaceChildren();
  try{
    const result=model.lookup(kb,{question:$('qa-query').value,scope:$('qa-query-scope').value.trim()});
    const labels={ANSWERED_FIXED:'固定答案 · 无需 AI',
      RETRIEVED_ONLY:'检索候选 · AI 尚未接入',
      NO_MATCH:'没有可信知识 · 转人工',
      AMBIGUOUS:'固定规则冲突 · 转人工'};
    $('qa-result-kind').textContent=labels[result.status]||'需人工核对';
    $('qa-result-text').textContent=result.answer||(
      result.status==='RETRIEVED_ONLY'?'找到相关知识，但未调用模型，不能自动回答。':
      '没有足够的确定依据，因此没有生成业务答案。');
    for(const id of result.sourceIds){
      const original=kb.items.find(x=>x.id===id);
      const li=root.ownerDocument.createElement('li');
      li.textContent=(original?.question||'未知来源')+' ['+id+']';
      sources.append(li);
    }
    resultBox.hidden=false;status('');
  }catch(error){status('查询失败：'+String(error?.message||error),true);}
});
$('qa-refresh').addEventListener('click',()=>discardThen(()=>void load()));
$('qa-import').addEventListener('click',()=>{
  if(!ready||busy||uncertain||review)return;
  discardThen(async()=>{
    const file=$('qa-file').files?.[0];
    if(!file){status('请先选择 JSON 或 CSV 文件',true);return;}
    if(file.size>65536){status('导入文件超过 64 KiB，未读取',true);return;}
    busy=true;state();
    try{
      const raw=await file.text();
      const parsed=/\.csv$/iu.test(file.name)?model.parseCsv(raw):model.parseJson(raw);
      const mode=$('qa-mode').value,plan=model.merge(kb,parsed,mode);
      busy=false;state();
      confirmAction('请核对导入预览：\n文件 '+file.name.slice(0,80)+
        '\n方式 '+(mode==='replace'?'替换全部':'按 ID 合并')+
        '\n新增 '+plan.added+' 条；重复 '+plan.conflicts+' 条；最终 '+plan.library.items.length+' 条。'+
        (mode==='replace'?'\n注意：原有知识将被替换。':''),()=>{
          return commit(plan.library,{after:()=>{selected=null;fill(null);},success:'导入已保存并读回确认'});
        },'确认导入');
    }catch(error){status('导入失败，未更改已有知识：'+String(error?.message||error),true);}
    finally{busy=false;state();}
  });
});
$('qa-export-json').addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;busy=true;state();
  try{
    const receipt=await request('file.download',{filename:'ai-knowledge-answers.json',text:JSON.stringify(kb,null,2)});
    status('JSON 下载请求已提交（'+String(receipt?.downloadId??'无下载 ID')+'）。请在浏览器实际检查文件。');
  }catch(error){status('JSON 导出失败：'+String(error?.message||error),true);}
  finally{busy=false;state();}
});
$('qa-export-csv').addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;busy=true;state();
  try{
    const receipt=await request('clipboard.writeText',{text:model.exportCsv(kb)});
    if(receipt?.copied!==true)throw new Error('没有获得剪贴板写入确认');
    status('CSV 已复制到剪贴板，未创建文件。');
  }catch(error){status('CSV 复制失败：'+String(error?.message||error),true);}
  finally{busy=false;state();}
});
void load();
})();
