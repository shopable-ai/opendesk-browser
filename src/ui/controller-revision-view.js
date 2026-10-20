import {patchDeveloperField,developerOptions,appendDeveloperOptions} from './develop-view.js';
import {createControllerESMSavedSource,readControllerESMAuthorSource,verifiedControllerESMAuthorSource,
  createControllerClassicSavedSource,readControllerClassicAuthorSource,verifiedControllerClassicAuthorSource} from './controller-esm-source.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {parseControllerClassicDependencies} from '../scripting/user-scripts/controller-classic.js';

// Formal Controller revision UI only. Host owns durable bytes, CAS and history;
// the temporary editor owns the current source and all execution admission.
export function createControllerRevisionView({host,client,view,programSource,prepareESM,getGeneration,onLoad,onUpdate,onStatus}){
  const find=id=>view.fields[id],list=find('script-list');
  const heads=new Map();
  let current=null,currentAuthorSource=null,sequence=0,disposed=false,preparing=false;
  const scriptId=()=>find('script-id').value.trim(),getSource=()=>programSource.source();
  const head=id=>heads.get(id);
  const has=id=>heads.has(id);

  function renderRevisionState() {
    const node = find('script-version');
    if (!current || current.scriptId !== scriptId()) {
      patchDeveloperField(view,node,{data:{...node.data,dirty:'false'},
        textContent:current ? '当前脚本 ID 尚未加载持久版本；仍可直接运行' : '当前源码可直接运行；只有点击保存才创建正式版本'});
      return;
    }
    if (current.revision !== Number(find('script-revision').value)) {
      patchDeveloperField(view,node,{data:{...node.data,dirty:'false'},textContent:`已加载 r${current.revision}；运行使用输入框当前源码`});
      return;
    }
    let savedSource=current.sourceUtf8;
    try{savedSource=(readControllerESMAuthorSource(savedSource)||
      readControllerClassicAuthorSource(savedSource))?.authorSourceUtf8??savedSource;}
    catch{savedSource='';} // Damaged authoring headers must not appear clean.
    const dirty = getSource() !== savedSource;
    patchDeveloperField(view,node,{data:{...node.data,dirty:String(dirty)},textContent:dirty
      ? `已保存 r${current.revision} · 存在未保存修改 · 运行不会覆盖已保存版本`
      : `已保存 r${current.revision} · 可直接运行；不自动创建新 revision`});
  }
  function update({busy,local,page}){
    patchDeveloperField(view,find('script-load'),{disabled:busy||local});
    patchDeveloperField(view,find('script-list-refresh'),{disabled:busy});
    patchDeveloperField(view,find('script-list-load'),{disabled:busy||local||!list.value});
    patchDeveloperField(view,find('script-delete'),{disabled:busy||local||!has(scriptId())});
    patchDeveloperField(view,find('script-save-version'),{hidden:page||local,disabled:busy||page||!getSource().trim()});
    patchDeveloperField(view,find('script-library-tools'),{hidden:local||page});
    if(local)patchDeveloperField(view,find('script-version'),{textContent:'本地项目模式 · 直接编辑内容保持不变；运行所选项目准备完成的代码'});
    else renderRevisionState();
  }
  function remember(row,{head:asHead=true,authorSourceUtf8=row.sourceUtf8}={}){
    if(asHead)heads.set(row.scriptId,row.revision);
    current=row;currentAuthorSource=authorSourceUtf8;
    patchDeveloperField(view,find('script-revision'),{value:String(row.revision)});
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
  function renderList(rows) {
    const selected = list.value || scriptId();
    heads.clear();
    developerOptions(view,list,[{label:rows.length ? '选择已保存脚本' : '没有已保存脚本',value:''}]);
    for (const row of rows) {
      heads.set(row.scriptId, row.revision);
      appendDeveloperOptions(view,list,[{label:`${row.scriptId} · r${row.revision} · ${row.contentHash}`,value:row.scriptId}]);
    }
    if (rows.some(row => row.scriptId === selected)) patchDeveloperField(view,list,{value:selected});
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
    patchDeveloperField(view,find('script-version'),{textContent:'脚本已删除'});
    onUpdate();
    await refresh({silent:true});
    onStatus('deleted','脚本已删除；已运行版本的源码保留至任务退休');
  }
  async function save(){
    const id=scriptId(),source=getSource(),esm=hasUnbuiltESM(source),
      classic=parseControllerClassicDependencies(source).length>0;
    if(esm&&classic)throw {code:'E_CONTROLLER_CLASSIC_FORMAT',message:'Controller 不能同时使用 ESM import 与 Classic 声明'};
    const previous=head(id)||0,generation=getGeneration();
    const check=()=>{if(disposed||generation!==getGeneration()||getSource()!==source||scriptId()!==id)
      throw {code:esm?'E_CONTROLLER_ESM_STALE':'E_CONTROLLER_CLASSIC_STALE',message:'源码、身份已变化或准备已取消，不保存过期版本'};};
    preparing=esm||classic;onUpdate();
    try{
      let executable=source;
      if(esm){
        const {built,lockId}=await prepareESM(source,id,check);check();
        executable=await createControllerESMSavedSource({authorSourceUtf8:source,programId:id,built,lockId});check();
      }else if(classic){
        // Save only reuses the SHA-verified lock created by an explicit Run.
        const prepared=await client.request('prepareControllerClassicDependencies',{
          programId:id,sourceUtf8:source,explicitUserAction:true,allowDownload:false});check();
        executable=await createControllerClassicSavedSource({authorSourceUtf8:source,programId:id,prepared});check();
      }
      const row=await host.controller.commitControllerScript({scriptId:id,expectedRevision:previous,sourceUtf8:executable});
      if(disposed)return;
      if(scriptId()===id)remember(row,{authorSourceUtf8:row.sourceUtf8===executable?source:null});
      await refresh({silent:true});
      onStatus('saved',`${id} · r${row.revision} 已持久保存固定${esm?' ESM ':classic?' Classic ':''}版本；${host.currentRun?'当前任务继续使用启动时的版本':'保存不会运行脚本'}`);
    }finally{preparing=false;onUpdate();}
  }
  async function load(fromList=false){
    const id=fromList?list.value:scriptId(),activeId=scriptId(),revisionText=find('script-revision').value.trim(),
      source=getSource(),selectedHead=head(id),generation=getGeneration(),world=find('script-javascript-world').value,
      mode=['javascript','react','vue'].find(value=>find('page-component-'+value).checked);
    if(fromList&&!id)throw {code:'E_REVISION',message:'请选择已保存脚本'};
    const row=await host.controller.getControllerScript({scriptId:id,
      ...(!fromList&&revisionText?{revision:Number(revisionText)}:{})});
    const recorded=await verifiedControllerESMAuthorSource(row.sourceUtf8)||await verifiedControllerClassicAuthorSource(row.sourceUtf8);
    if(disposed)return;
    if(scriptId()!==activeId||(fromList&&list.value!==id)||find('script-revision').value.trim()!==revisionText||
      getSource()!==source||generation!==getGeneration()||world!==find('script-javascript-world').value||
      !find('page-component-'+mode).checked)
      throw {code:'E_REVISION',message:'加载期间编辑内容已变化，请重新加载'};
    if(fromList)patchDeveloperField(view,find('script-id'),{value:id});
    onLoad(recorded?.authorSourceUtf8??row.sourceUtf8);
    remember(row,{head:fromList||!revisionText||head(id)===row.revision,authorSourceUtf8:recorded?null:row.sourceUtf8});
    if(fromList&&selectedHead!==row.revision)await refresh({silent:true});
    onStatus('loaded',fromList?`已加载 ${id} 最新 r${row.revision}`:`已加载持久版本 r${row.revision}`);
  }
  return {savedControllerSource,executionSource,update,refresh,remove,save,load,
    loadLatest:()=>load(true),get preparing(){return preparing;},
    clearCurrent(){current=null;currentAuthorSource=null;},
    dispose(){disposed=true;sequence++;}};
}
