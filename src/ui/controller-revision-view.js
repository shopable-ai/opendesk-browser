import {patchDeveloperField,developerOptions} from './develop-view.js';
import {createControllerESMSavedSource,readControllerESMAuthorSource,verifiedControllerESMAuthorSource,
  createControllerClassicSavedSource,readControllerClassicAuthorSource,verifiedControllerClassicAuthorSource} from './controller-esm-source.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {parseControllerClassicDependencies} from '../scripting/user-scripts/controller-classic.js';

// Formal Controller revision UI only. Host owns durable bytes, CAS and history;
// the temporary editor owns the current source and all execution admission.
export function createControllerRevisionView({host,client,view,programSource,prepareESM,getGeneration,onLoad,onUpdate,onStatus}){
  const find=id=>view.fields[id],list=find('script-list');
  const heads=new Map();
  let current=null,currentAuthorSource=null,sequence=0,disposed=false,preparingKind=null;
  const scriptId=()=>find('script-id').value.trim(),getSource=()=>programSource.source();
  const head=id=>heads.get(id);
  const has=id=>heads.has(id);
  const editorSnapshot=()=>({source:getSource(),id:scriptId(),revision:find('script-revision').value,
    generation:getGeneration(),selected:list.value,world:find('script-javascript-world').value,
    navigationGeneration:view.getSnapshot?.().navigationGeneration,
    modes:['javascript','react','vue'].map(value=>find('page-component-'+value).checked),current});
  function checkEditor(snapshot){
    const now=editorSnapshot();
    if(disposed||Object.keys(snapshot).some(key=>key==='modes'
      ?snapshot.modes.some((value,index)=>value!==now.modes[index]):snapshot[key]!==now[key]))
      throw {code:'E_REVISION',message:'编辑内容或选择已变化，请重新操作'};
  }

  function renderRevisionState() {
    const node = find('script-version');
    if (!current || current.scriptId !== scriptId()) {
      patchDeveloperField(view,node,{data:{...node.data,dirty:'false'},
        textContent:current ? '当前名称尚未保存；请保存后再从列表加载。' : '草稿尚未保存；运行不会保存修改。'});
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
      ? `已保存 r${current.revision}；当前草稿有未保存修改。`
      : `已保存 r${current.revision}；后续编辑需再次手动保存。`});
  }
  function update({busy,local,page}){
    patchDeveloperField(view,find('script-load'),{disabled:busy||local});
    patchDeveloperField(view,find('script-list-refresh'),{disabled:busy});
    patchDeveloperField(view,find('script-list-load'),{disabled:busy||local||!list.value});
    patchDeveloperField(view,find('script-delete'),{disabled:busy||local||!has(list.value)});
    patchDeveloperField(view,find('script-save-version'),{hidden:page||local,disabled:busy||page||!getSource().trim()});
    patchDeveloperField(view,find('script-library-tools'),{hidden:local});
    if(local)patchDeveloperField(view,find('script-version'),{textContent:'本地项目模式 · 直接编辑内容保持不变；运行所选项目准备完成的代码'});
    else renderRevisionState();
  }
  function remember(row,{head:asHead=true,authorSourceUtf8=row.sourceUtf8}={}){
    if(asHead)heads.set(row.scriptId,row.revision);
    current=row;currentAuthorSource=authorSourceUtf8;
    patchDeveloperField(view,find('script-revision'),{value:String(row.revision)});
    patchDeveloperField(view,find('script-source'),{loadedScript:{kind:'controller',id:row.scriptId,
      revision:row.revision,framework:'javascript',source:authorSourceUtf8??getSource()}});
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
    // Avoid one React snapshot per saved version; preserve selection or
    // initially select the current script ID when it exists in the catalog.
    for (const row of rows) heads.set(row.scriptId, row.revision);
    developerOptions(view,list,[{label:rows.length ? '选择已保存脚本' : '没有已保存脚本',value:''},
      ...rows.map(row=>({label:`${row.scriptId} · r${row.revision}`,value:row.scriptId,
        scriptId:row.scriptId,revision:row.revision,kind:'controller',typeLabel:'自动化 · Controller JS'}))]);
    if (!list.value && rows.some(row=>row.scriptId===selected)) patchDeveloperField(view,list,{value:selected});
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
    const id=list.value,expectedRevision=head(id),snapshot=editorSnapshot();
    if(!expectedRevision)throw {code:'E_REVISION',message:'请先加载最新持久版本'};
    const answer=await view.requestConfirmation({title:'删除这个已保存脚本？',
      message:`所选脚本：${id} · r${expectedRevision}\n\n所有已保存版本都将被删除，无法撤销；原脚本 ID 不能再次使用。\n当前编辑草稿不会被清空。`,
      confirmLabel:'删除脚本',cancelLabel:'取消',tone:'danger'});
    if(answer.action!=='confirm')return;
    checkEditor(snapshot);
    if(head(id)!==expectedRevision)throw {code:'E_REVISION',message:'已保存版本已变化，请重新选择后删除'};
    await host.controller.tombstoneControllerScript({scriptId:id,expectedRevision});
    if(disposed)return;
    heads.delete(id);
    if(current?.scriptId===id){current=null;currentAuthorSource=null;}
    patchDeveloperField(view,find('script-version'),{textContent:'脚本已删除'});
    onUpdate();
    await refresh({silent:true});
    onStatus('deleted',`已删除 ${id}；当前编辑草稿已保留`);
  }
  async function save(){
    const id=scriptId(),source=getSource(),esm=hasUnbuiltESM(source),
      classic=parseControllerClassicDependencies(source).length>0;
    if(esm&&classic)throw {code:'E_CONTROLLER_CLASSIC_FORMAT',message:'Controller 不能同时使用 ESM import 与 Classic 声明'};
    const previous=head(id)||0,generation=getGeneration();
    const check=()=>{if(disposed||generation!==getGeneration()||getSource()!==source||scriptId()!==id)
      throw {code:esm?'E_CONTROLLER_ESM_STALE':'E_CONTROLLER_CLASSIC_STALE',message:'源码、身份已变化或准备已取消，不保存过期版本'};};
    preparingKind=esm?'esm':classic?'classic':null;onUpdate();
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
      // The last cancelable boundary is before the durable Host commit. Once
      // submitted, Stop cannot claim to undo an in-flight persistence effect.
      check();
      if(preparingKind){preparingKind=null;onUpdate();}
      const row=await host.controller.commitControllerScript({scriptId:id,expectedRevision:previous,sourceUtf8:executable});
      if(disposed)return;
      if(scriptId()===id)remember(row,{authorSourceUtf8:row.sourceUtf8===executable?source:null});
      await refresh({silent:true});
      onStatus('saved',`已保存 ${id} · r${row.revision}；${host.currentRun?'当前任务继续使用原版本':'可在「更多 → 管理脚本」查看'}`);
    }finally{preparingKind=null;onUpdate();}
  }
  async function load(fromList=false,{scriptId:requestedId,revision,stillCurrent=()=>true}={}){
    const snapshot=editorSnapshot(),id=fromList?requestedId??snapshot.selected:snapshot.id,
      revisionText=snapshot.revision.trim(),selectedHead=head(id),catalogGeneration=sequence;
    const check=()=>{
      checkEditor(snapshot);
      if(!stillCurrent()||sequence!==catalogGeneration||head(id)!==selectedHead)
        throw {code:'E_REVISION',message:'已保存版本或打开请求已变化，请重新加载'};
    };
    if(fromList&&!id)throw {code:'E_REVISION',message:'请选择已保存脚本'};
    check();
    if(fromList&&(!selectedHead||revision!==undefined&&revision!==selectedHead))
      throw {code:'E_REVISION',message:'所选版本已变化，请刷新后选择'};
    const row=await host.controller.getControllerScript({scriptId:id,
      ...(!fromList&&revisionText?{revision:Number(revisionText)}:{})});
    if(!row||row.scriptId!==id||row.revision!==(fromList?selectedHead:revisionText?Number(revisionText):row.revision))
      throw {code:'E_REVISION',message:'读取结果与所选脚本版本不一致'};
    const recorded=await verifiedControllerESMAuthorSource(row.sourceUtf8)||await verifiedControllerClassicAuthorSource(row.sourceUtf8);
    if(disposed)return;
    check();
    const authorSource=recorded?.authorSourceUtf8??row.sourceUtf8;
    let savedAuthorSource=currentAuthorSource;
    if(current&&savedAuthorSource===null){
      savedAuthorSource=(readControllerESMAuthorSource(current.sourceUtf8)||
        readControllerClassicAuthorSource(current.sourceUtf8))?.authorSourceUtf8??current.sourceUtf8;
    }
    // Matching bytes alone do not make a renamed or repurposed draft saved.
    const cleanSavedDraft=current?.scriptId===snapshot.id&&current.revision===Number(snapshot.revision)&&
      snapshot.world==='controller'&&snapshot.modes[0]&&!snapshot.modes[1]&&!snapshot.modes[2]&&
      snapshot.source===savedAuthorSource;
    if(snapshot.source&&snapshot.source!==authorSource&&!cleanSavedDraft){
      const answer=await view.requestConfirmation({title:'替换未保存的草稿？',
        message:`加载 ${id} · r${row.revision} 将替换当前未保存的编辑内容。\n\n要保留草稿，请取消后先保存。加载不会运行脚本。`,
        confirmLabel:'加载并替换',cancelLabel:'继续编辑',tone:'neutral'});
      if(answer.action!=='confirm')return false;
      check();
    }
    if(fromList)patchDeveloperField(view,find('script-id'),{value:id});
    onLoad(recorded?.authorSourceUtf8??row.sourceUtf8);
    remember(row,{head:fromList||!revisionText||head(id)===row.revision,authorSourceUtf8:recorded?null:row.sourceUtf8});
    if(fromList&&selectedHead!==row.revision)await refresh({silent:true});
    onStatus('loaded',fromList?`已加载 ${id} 最新 r${row.revision}`:`已加载持久版本 r${row.revision}`);
    if(fromList)patchDeveloperField(view,list,{value:id});
    return row;
  }
  return {savedControllerSource,executionSource,update,refresh,remove,save,load,
    loadLatest:options=>load(true,options),get preparing(){return !!preparingKind;},
    get esmPreparing(){return preparingKind==='esm';},
    clearCurrent(){current=null;currentAuthorSource=null;},
    dispose(){disposed=true;sequence++;}};
}
