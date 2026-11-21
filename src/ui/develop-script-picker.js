// Presentation adapter only: each source type retains its original loader.
export function createDevelopScriptPicker({view,loadController,loadPage,isBlocked}){
  let disposed=false,pending=null;
  async function openScript(item){
    if(disposed||pending||isBlocked())return false;
    const state=view.getSnapshot(),ticket=state.scriptPicker.generation;
    const field=item?.kind==='controller'?'script-list':item?.kind==='page'?'page-program-list':null;
    const option=field&&view.fields[field].options.find(row=>row.value===item.value);
    if(!state.scriptPicker.open||!option||option.revision!==item.revision)return false;
    const options=view.fields[field].options;
    const sameRequest=()=>!disposed&&view.getSnapshot().presentationActive&&
      view.getSnapshot().scriptPicker.open&&view.getSnapshot().scriptPicker.generation===ticket;
    const current=()=>sameRequest()&&
      view.fields[field].options===options;
    const identity={};pending=identity;
    view.patchScriptPicker({pending:item.kind+':'+item.value,error:''});
    try{
      const loaded=await (item.kind==='controller'
        ?loadController({scriptId:option.scriptId,revision:option.revision,stillCurrent:current})
        :loadPage(item.value,{stillCurrent:current}));
      if(!loaded)return false;
      // Successful loaders may already navigate, closing the same picker.
      if(!disposed){view.setScriptPickerOpen(false);view.focus('script-source');}
      return true;
    }catch(error){
      if(sameRequest())view.patchScriptPicker({error:current()
        ?(error.code||'E_LOAD')+'：'+(error.message||String(error)):'列表已变化，请重新选择；当前草稿已保留。'});
      return false;
    }finally{
      if(pending===identity){pending=null;if(sameRequest())view.patchScriptPicker({pending:''});}
    }
  }
  view.actions['developer-script-open']=openScript;
  return {dispose(){disposed=true;if(view.actions['developer-script-open']===openScript)delete view.actions['developer-script-open'];}};
}
