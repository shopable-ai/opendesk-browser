import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {Button,IconButton,Card,CardContent} from '@opendesk/ui';
import {STORAGE_KEY,LEGACY_KEY,noteLabel,pageInfoFrom,recoverNotes,
  proposedSave,proposedDelete} from './model.js';

const initial={
  notes:[],selectedId:null,text:'',attach:false,dirty:false,ready:false,
  busy:false,deleting:false,pageBusy:false,pageInfo:null,
  pageSummary:'正在读取网页…',pageUrl:'',etag:null,legacyPending:false,
  confirmation:null,status:null,taskId:''
};
const errorText=error=>String(error?.message||error||'未知错误');
function Glyph({kind}){
  const path={
    refresh:'M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5',
    plus:'M12 5v14M5 12h14',
    trash:'M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5',
    save:'M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-8h10v8',
    task:'M13 5h6v6m0-6-9 9M19 13v6H5V5h6'
  }[kind];
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round"><path d={path}/></svg>;
}

export default function App({request,setState,hostRoot,markUrl}){
  const [view,setView]=useState(initial);
  const live=useRef(initial);
  const mounted=useRef(true);
  const inFlight=useRef(false);
  const pageEpoch=useRef(0);
  const previouslyFocused=useRef(null);
  const cancelButton=useRef(null);
  const acceptButton=useRef(null);
  const editor=useRef(null);
  function patch(changes){
    if(!mounted.current)return;
    const before=live.current;
    const next={...before,...changes};
    live.current=next;
    setView(next);
    if(before.dirty!==next.dirty||before.busy!==next.busy)
      setState?.({dirty:next.dirty,busy:next.busy});
  }
  function show(text='',type='info'){patch({status:text?{text,type}:null});}
  function pageChanged(){
    pageEpoch.current++;
    patch({pageInfo:null,pageUrl:'',pageBusy:false,
      pageSummary:'网页已切换，点击刷新获取当前网页信息。'});
  }
  async function refreshPage(){
    const before=live.current;
    if(before.pageBusy)return;
    const epoch=++pageEpoch.current;
    patch({pageBusy:true});
    try{
      const info=pageInfoFrom(await request('currentPage.info'));
      if(epoch!==pageEpoch.current||!mounted.current)return;
      patch({pageInfo:info,pageSummary:info?info.title:
        '当前页面暂不支持读取，仍可使用离线笔记。',pageUrl:info?.url||''});
    }catch{
      if(epoch!==pageEpoch.current||!mounted.current)return;
      patch({pageInfo:null,pageSummary:'网页信息暂不可用，离线笔记不受影响。',pageUrl:''});
    }finally{
      if(epoch===pageEpoch.current)patch({pageBusy:false});
    }
  }
  async function restore(){
    try{
      const current=await request('storage.get',{key:STORAGE_KEY,withEtag:true});
      const old=await request('storage.get',{key:LEGACY_KEY});
      if(!mounted.current)return;
      const recovered=recoverNotes(current,old?.value);
      const selected=recovered.notes[0];
      patch({...recovered,selectedId:selected?.id||null,text:selected?.text||'',
        attach:Boolean(selected?.pageUrl),dirty:false,ready:true,
        status:recovered.upgrading?{text:'已恢复旧版笔记，保存即可升级。',type:'info'}:
          recovered.legacyPending?{text:'旧版备份将在下次保存时清理。',type:'info'}:null});
    }catch(error){
      patch({ready:false,status:{type:'error',text:
        '读取失败，已禁止写入以保护原数据。请返回工具列表并重开：'+errorText(error)}});
    }
  }
  useEffect(()=>{
    mounted.current=true;
    setState?.({dirty:false,busy:false});
    hostRoot.addEventListener('opendesk-page-changed',pageChanged);
    void restore();
    void refreshPage();
    return ()=>{
      mounted.current=false;
      pageEpoch.current++;
      hostRoot.removeEventListener('opendesk-page-changed',pageChanged);
    };
  },[hostRoot,request,setState]);
  useEffect(()=>{
    if(view.confirmation)cancelButton.current?.focus();
  },[view.confirmation]);

  function selectNow(id){
    const current=live.current;
    const selected=current.notes.find(note=>note.id===id);
    patch({selectedId:id,text:selected?.text||'',attach:Boolean(selected?.pageUrl),
      dirty:false,status:null});
  }
  function newNow(){
    patch({selectedId:null,text:'',attach:false,dirty:false,status:null});
    editor.current?.focus();
  }
  function ask(message,action){
    if(live.current.confirmation)return;
    previouslyFocused.current=hostRoot.ownerDocument.activeElement;
    patch({confirmation:{message,action}});
  }
  function guardedAction(action){
    const state=live.current;
    if(!state.ready||state.busy||state.confirmation)return;
    if(state.dirty)ask('当前笔记有未保存的修改，确定放弃吗？',action);
    else runAction(action);
  }
  function runAction(action){
    if(action.type==='new')newNow();
    if(action.type==='select')selectNow(action.id);
    if(action.type==='delete')void deleteConfirmed(action.id);
  }
  function closeConfirmation(accepted){
    const choice=live.current.confirmation;
    if(!choice)return;
    patch({confirmation:null});
    if(accepted)runAction(choice.action);
    else{
      const previous=previouslyFocused.current;
      (previous?.isConnected?previous:editor.current)?.focus();
    }
  }
  function selectNote(id){
    if(id===live.current.selectedId)return;
    guardedAction({type:'select',id});
  }
  async function clearLegacy(){
    if(!live.current.legacyPending)return true;
    try{
      await request('storage.set',{key:LEGACY_KEY,value:''});
      patch({legacyPending:false});
      return true;
    }catch{return false;}
  }
  async function saveNote(){
    const state=live.current;
    if(!state.ready||state.busy||state.confirmation||inFlight.current)return;
    if(!state.text.trim()){show('请输入笔记内容再保存。','error');return;}
    if(state.selectedId===null&&state.notes.length>=16){
      show('最多保存 16 条笔记。','error');return;
    }
    const snapshot={text:state.text,include:state.attach};
    const startedEpoch=pageEpoch.current;
    inFlight.current=true;patch({busy:true});
    try{
      let linked=state.pageInfo;
      const prior=state.notes.find(note=>note.id===state.selectedId);
      if(snapshot.include&&linked){
        const result=await request('currentPage.info');
        if(!mounted.current)return;
        if(startedEpoch!==pageEpoch.current||result?.status!=='available'||result.url!==linked.url){
          pageChanged();show('网页信息已变化，当前笔记未保存；请刷新或取消关联。','error');
          return;
        }
        linked={...linked,title:String(result.title||'未命名网页')};
      }
      if(!mounted.current)return;
      const {id,next}=proposedSave({notes:state.notes,selectedId:state.selectedId,
        text:snapshot.text,include:snapshot.include,pageInfo:linked});
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:state.etag});
      if(!mounted.current)return;
      if(typeof result?.etag!=='string'||!/^[0-9a-f]{64}$/.test(result.etag))
        throw Error('写入回执异常，请重新打开核对');
      const changed=live.current.text!==snapshot.text||live.current.attach!==snapshot.include;
      patch({notes:next,etag:result.etag,selectedId:id,dirty:changed});
      const cleaned=await clearLegacy();
      show(!cleaned?'保存成功，但旧版备份清理失败；下次保存将重试。':
        changed?'已保存此前内容；新修改仍未保存。':'已保存到本机。',
      cleaned?'success':'error');
    }catch(error){
      show(/其他窗口修改/.test(errorText(error))?
        '其他窗口已更新笔记，此次未覆盖。请复制当前输入，重新打开后核对。':
        '保存失败或结果未知，输入仍保留。请重新打开核对后重试：'+errorText(error),'error');
    }finally{
      inFlight.current=false;patch({busy:false});
    }
  }
  async function deleteConfirmed(id){
    const state=live.current;
    const note=state.notes.find(row=>row.id===state.selectedId);
    if(!state.ready||!note||note.id!==id||state.busy||inFlight.current)return;
    const next=proposedDelete(state.notes,id);
    inFlight.current=true;patch({busy:true,deleting:true});
    try{
      const result=await request('storage.set',{key:STORAGE_KEY,value:next,ifMatch:state.etag});
      if(!mounted.current)return;
      if(typeof result?.etag!=='string'||!/^[0-9a-f]{64}$/.test(result.etag))
        throw Error('删除回执异常，请重新打开核对');
      const selected=next[0]||null;
      patch({notes:next,etag:result.etag,selectedId:selected?.id||null,dirty:false,
        text:selected?.text||'',attach:Boolean(selected?.pageUrl)});
      const cleaned=await clearLegacy();
      show(cleaned?'笔记已删除。':'笔记已删除，但旧版备份清理失败，下次保存会重试。',
        cleaned?'success':'error');
    }catch(error){
      show(/其他窗口修改/.test(errorText(error))?
        '其他窗口已更改笔记，删除被阻止，请重开核对。':
        '删除失败或结果未知，请重新打开核对：'+errorText(error),'error');
    }finally{
      inFlight.current=false;patch({busy:false,deleting:false});
    }
  }
  async function openTask(){
    const state=live.current;
    if(!state.ready||state.busy||state.confirmation)return;
    const taskId=state.taskId.trim();
    if(!taskId){show('请先填写任务 ID。','error');return;}
    try{await request('tasks.open',{taskId});}
    catch(error){show('打开任务失败：'+errorText(error),'error');}
  }
  function onKeyDown(event){
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){
      event.preventDefault();
      if(!live.current.confirmation)void saveNote();
      return;
    }
    if(!live.current.confirmation)return;
    if(event.key==='Escape'){
      event.preventDefault();closeConfirmation(false);
    }else if(event.key==='Tab'){
      event.preventDefault();
      (hostRoot.ownerDocument.activeElement===cancelButton.current?
        acceptButton.current:cancelButton.current)?.focus();
    }
  }
  const selected=view.notes.find(note=>note.id===view.selectedId);
  const locked=!view.ready||view.busy||Boolean(view.confirmation);
  const attached=selected?.pageTitle||'';
  return <main className="notes-app od-page" onKeyDown={onKeyDown}>
    <div className="page-context">
      <img className="notes-mark" src={markUrl} width="24" height="24" alt=""/>
      <div className="page-meta">
        <p className="page-summary od-title">{view.pageSummary}</p>
        {view.pageUrl?<p className="page-url od-technical">{view.pageUrl}</p>:null}
      </div>
      <IconButton label="更新网页信息" className="icon-button" onClick={()=>void refreshPage()}
        disabled={view.pageBusy}><Glyph kind="refresh"/></IconButton>
    </div>
    <Card className="notes-editor">
      <CardContent>
        <section className="editor" aria-label="离线笔记编辑器">
          <div className="notes-heading od-page-head">
            <label className="od-field-label" htmlFor="note-text">我的笔记</label>
            <span className="note-count od-technical">{view.notes.length} 条</span>
            <IconButton label="新建笔记" className="icon-button"
              disabled={locked} onClick={()=>guardedAction({type:'new'})}>
              <Glyph kind="plus"/>
            </IconButton>
          </div>
          <div className="note-list" aria-label="已保存的笔记">
            {view.notes.map(note=><Button key={note.id} className="note-chip"
              disabled={locked} data-selected={String(note.id===view.selectedId)}
              title={noteLabel(note)} aria-label={'编辑笔记：'+noteLabel(note)}
              aria-pressed={note.id===view.selectedId} onClick={()=>selectNote(note.id)}>
              {noteLabel(note)}
            </Button>)}
          </div>
          <textarea id="note-text" ref={editor} className="od-field"
            rows={5} maxLength={8192} placeholder="输入笔记内容，点击保存…"
            aria-label="笔记内容" value={view.text}
            disabled={!view.ready||view.deleting||Boolean(view.confirmation)}
            onChange={event=>patch({text:event.target.value,dirty:true,
              status:{text:'当前修改尚未保存。',type:'info'}})}/>
          <div className="editor-actions">
            <label className="page-attach" htmlFor="attach-page">
              <input id="attach-page" type="checkbox" checked={view.attach}
                disabled={locked} onChange={event=>patch({
                  attach:event.target.checked,dirty:true,
                  status:{text:'当前修改尚未保存。',type:'info'}})}/>
              关联当前网页
            </label>
            <span className="action-spacer"/>
            <IconButton label="删除当前笔记" className="icon-button od-icon-button--danger"
              disabled={locked||!selected}
              onClick={()=>ask('删除这条笔记？删除后无法恢复。',{type:'delete',id:selected.id})}>
              <Glyph kind="trash"/>
            </IconButton>
            <IconButton label="保存笔记" className="icon-button od-icon-button--primary"
              disabled={locked} onClick={()=>void saveNote()}><Glyph kind="save"/></IconButton>
          </div>
          {attached?<p className="note-attachment od-note">已关联：{attached}</p>:null}
          {view.status?<p className="od-note note-status" data-state={view.status.type}
            role="status" aria-live="polite">{view.status.text}</p>:null}
        </section>
      </CardContent>
    </Card>
    {view.confirmation?<section className="note-confirm od-alert" role="alertdialog"
      aria-modal="true" aria-labelledby="note-confirm-message">
      <p id="note-confirm-message">{view.confirmation.message}</p>
      <div className="confirm-actions">
        <Button ref={cancelButton} onClick={()=>closeConfirmation(false)}>取消</Button>
        <Button ref={acceptButton} className="od-button--danger"
          onClick={()=>closeConfirmation(true)}>确定</Button>
      </div>
    </section>:null}
    <details className="task-shortcut od-disclosure od-disclosure--flat">
      <summary>打开已安装的自动化任务</summary>
      <div className="task-row">
        <label className="visually-hidden" htmlFor="task-name">任务 ID</label>
        <input id="task-name" className="od-field" type="text" maxLength={60}
          placeholder="已安装的任务 ID" aria-label="已安装的任务 ID"
          value={view.taskId} disabled={Boolean(view.confirmation)}
          onChange={event=>patch({taskId:event.target.value})}/>
        <IconButton label="打开任务（不会自动运行）" className="icon-button"
          disabled={locked} onClick={()=>void openTask()}>
          <Glyph kind="task"/>
        </IconButton>
      </div>
    </details>
  </main>;
}
