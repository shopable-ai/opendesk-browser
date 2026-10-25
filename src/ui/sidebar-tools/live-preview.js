// Trusted-page subscription only. Dynamic tool code stays in the existing
// opaque-origin iframe and never receives the session record or disk authority.
import {validatePreviewSession} from './preview-session.js';
import {previewStorageKey} from '../../native-agent/tool-snapshot.js';

export const previewStatusKey=id=>previewStorageKey(id)+':status';
export function subscribePreviewSession({api,previewId,mount,isActive=()=>true,isDirty=()=>false,onStatus=()=>{},onInvalidate=()=>{},onSnapshot=()=>{},now=Date.now,intervalMs=1000}){
  const key=previewStorageKey(previewId),statusKey=previewStatusKey(previewId);
  let closed=false,current=null,queued=Promise.resolve(),lastSignal=now(),pending=null,updateError=null,invalidated=true;
  const dirtyMessage='新快照已就绪；当前预览有未保存内容，保留当前界面。结束编辑后自动更新。';
  function status(text,error=false){if(!closed)onStatus(text,error);}
  function invalidate(){invalidated=true;onInvalidate();}
  function accept(value){
    if(closed)return;
    const next=validatePreviewSession(value,previewId,now());
    if(current&&(next.workspaceId!==current.workspaceId||next.sourceId!==current.sourceId||next.tool.id!==current.tool.id)){
      invalidate();throw new Error('预览来源已变化，请重新明确打开');
    }
    if(current&&!isActive())throw new Error('当前预览实例已关闭，请重新打开');
    lastSignal=now();
    if(current&&current.sha256===next.sha256&&current.buildId===next.buildId){
      current=next;pending=null;
      if(invalidated){invalidated=false;onSnapshot(next);}
      return;
    }
    invalidate();
    if(current&&isDirty()){
      pending=next;status(dirtyMessage,true);return;
    }
    if(mount(next.tool,next)===false)throw new Error('当前界面尚不能安全刷新');
    current=next;pending=null;updateError=null;
    invalidated=false;onSnapshot(next);
    status('实时开发预览 · '+next.sha256.slice(0,12)+' · 未安装');
  }
  function enqueue(action){
    queued=queued.then(()=>{if(!closed)return action();}).catch(error=>{
      invalidate();
      updateError='更新失败 · 保留上次成功预览：'+String(error.message||error).slice(0,180);
      status(updateError,true);
    });
    return queued;
  }
  function signal(value){
    if(!value){pending=null;invalidate();status('开发连接已停止 · 保留上次成功预览',true);return;}
    if(typeof value.text==='string'&&value.text.length<=700){
      if(value.error===true||value.available===false)invalidate();
      else if(value.available===true&&invalidated&&current&&!pending&&isActive()){
        invalidated=false;onSnapshot(current);
      }
      lastSignal=now();
      if(pending&&isDirty())status(dirtyMessage+(value.error===true?' '+value.text:''),true);
      else if(updateError)status(updateError,true);
      else status(value.text,value.error===true);
    }
  }
  const changed=(changes,area)=>{
    if(area!=='session')return;
    enqueue(()=>{
      if(changes[key]){if(changes[key].newValue)accept(changes[key].newValue);else signal(null);}
      if(changes[statusKey])signal(changes[statusKey].newValue);
    });
  };
  api.storage.onChanged.addListener(changed);
  const ready=enqueue(async()=>{
    const values=await api.storage.session.get([key,statusKey]);
    if(closed)return;
    accept(values[key]);if(values[statusKey])signal(values[statusKey]);
  });
  const timer=setInterval(()=>{
    if(closed||!current||!isActive())return;
    if(now()-lastSignal>15000){invalidate();status((pending&&isDirty()?dirtyMessage+' ':'')+'开发连接中断 · 保留上次成功预览',true);}
    else if(pending&&!isDirty()){
      const next=pending;
      enqueue(()=>{if(pending===next&&!isDirty())accept(next);});
    }
  },intervalMs);
  return Object.freeze({ready,dispose(){if(closed)return;closed=true;clearInterval(timer);api.storage.onChanged.removeListener(changed);}});
}
