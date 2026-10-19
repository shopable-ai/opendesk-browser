import {readControllerESMAuthorSource,readControllerClassicAuthorSource} from './controller-esm-source.js';

// Formal Controller revision UI only. Host owns durable bytes, CAS and history;
// the temporary editor owns the current source and all execution admission.
export function createControllerRevisionView({host,document:doc,getScriptId,getSource,onUpdate,onStatus}){
  const find=id=>doc.getElementById(id),list=find('script-list');
  const heads=new Map();
  let current=null,currentAuthorSource=null,sequence=0,disposed=false;
  const scriptId=getScriptId;
  const head=id=>heads.get(id);
  const has=id=>heads.has(id);

  function renderRevisionState(){
    const node=find('script-version');
    if(!current||current.scriptId!==scriptId()){
      node.dataset.dirty='false';
      node.textContent=current?'当前脚本 ID 尚未加载持久版本；仍可直接运行草稿':
        '未保存草稿可直接运行；只有点击保存才创建正式版本';
      return;
    }
    if(current.revision!==Number(find('script-revision').value)){
      node.dataset.dirty='false';
      node.textContent=`已加载 r${current.revision}；本次运行始终使用编辑器当前草稿`;
      return;
    }
    let savedSource=current.sourceUtf8;
    try{savedSource=(readControllerESMAuthorSource(savedSource)||
      readControllerClassicAuthorSource(savedSource))?.authorSourceUtf8??savedSource;}
    catch{savedSource='';} // A damaged authoring header cannot look clean.
    const dirty=getSource()!==savedSource;
    node.dataset.dirty=String(dirty);
    node.textContent=dirty
      ?`已保存 r${current.revision} · 存在未保存修改 · 运行草稿不会覆盖已保存版本`
      :`已保存 r${current.revision} · 可运行草稿；不自动创建新 revision`;
  }
  function remember(row,{head:asHead=true,authorSourceUtf8=row.sourceUtf8}={}){
    if(asHead)heads.set(row.scriptId,row.revision);
    current=row;currentAuthorSource=authorSourceUtf8;
    find('script-revision').value=String(row.revision);
    onUpdate();
    return row;
  }
  function savedControllerSource(authorSourceUtf8,compiledSourceUtf8){
    if(current?.scriptId!==scriptId()||
      current.revision!==Number(find('script-revision').value))return compiledSourceUtf8;
    let recorded;
    try{recorded=readControllerESMAuthorSource(current.sourceUtf8)||
      readControllerClassicAuthorSource(current.sourceUtf8);}
    catch{return compiledSourceUtf8;}
    // Header fields alone never prove a compiler/author relationship.
    if(recorded?.programId===scriptId()&&recorded.authorSourceUtf8===authorSourceUtf8&&
      recorded.compiledSourceUtf8===compiledSourceUtf8){
      currentAuthorSource=authorSourceUtf8;
      return current.sourceUtf8;
    }
    return compiledSourceUtf8;
  }
  function executionSource(source){
    return current?.scriptId===scriptId()&&
      current.revision===Number(find('script-revision').value)&&currentAuthorSource===source
      ?current.sourceUtf8:source;
  }
  function renderList(rows){
    const selected=list.value||scriptId();
    heads.clear();
    list.replaceChildren(new Option(rows.length?'选择已保存脚本':'没有已保存脚本',''));
    for(const row of rows){
      heads.set(row.scriptId,row.revision);
      list.append(new Option(`${row.scriptId} · r${row.revision} · ${row.contentHash}`,row.scriptId));
    }
    if(rows.some(row=>row.scriptId===selected))list.value=selected;
    onUpdate();
  }
  async function refresh({silent=false}={}){
    const token=++sequence;
    const rows=await host.controller.listControllerScripts({});
    if(disposed||token!==sequence)return;
    renderList(rows);
    if(!silent)onStatus('scripts',rows.length?`已刷新 ${rows.length} 个已保存脚本`:'没有已保存脚本');
  }
  async function remove(){
    const id=scriptId(),expectedRevision=head(id);
    if(!expectedRevision)throw {code:'E_REVISION',message:'请先加载最新持久版本'};
    await host.controller.tombstoneControllerScript({scriptId:id,expectedRevision});
    if(disposed)return;
    heads.delete(id);
    if(current?.scriptId===id){current=null;currentAuthorSource=null;}
    find('script-version').textContent='脚本已删除';
    onUpdate();
    await refresh({silent:true});
    onStatus('deleted','脚本已删除；已运行版本的源码保留至任务退休');
  }
  return {head,has,remember,savedControllerSource,executionSource,renderRevisionState,refresh,remove,
    clearCurrent(){current=null;currentAuthorSource=null;},
    dispose(){disposed=true;sequence++;}};
}
