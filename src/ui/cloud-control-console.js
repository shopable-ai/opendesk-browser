// Trusted Cloud extension console: read-only observations without an execution host.
// This UI can only send cloudObserve to the sender-validated readonly route.
import {PROTOCOL} from '../environment.js';

const STATES=Object.freeze({waiting:'等待领取',prepared:'等待许可',permitted:'已取得许可',
  finished:'已完成',cancelled:'已取消','cancellation-pending':'取消处理中',
  OUTCOME_UNKNOWN:'结果待核对',other:'状态未识别'});
const RUNS=Object.freeze({preparing:'准备中',running:'运行中',stopping:'停止中',
  settling:'结算中',completed:'已完成',failed:'失败',stopped:'已停止',
  interrupted:'已中断',paused_unknown:'结果待核对'});

export function initCloudControlConsole({api=globalThis.chrome,doc=globalThis.document,
  refreshIntervalMs=30000}={}){
  const get=id=>doc.getElementById(id);
  let disposed=false,sequence=0,offset=0,nextOffset=null,total=0,inflight=false;
  const listeners=[];
  const put=(id,value)=>{const el=get(id);if(el)el.textContent=String(value);};
  const on=(id,type,listener)=>{const el=get(id);el.addEventListener(type,listener);listeners.push([el,type,listener]);};
  const status=get('cc-status'),list=get('cc-request-list');
  function safeError(error){
    const code=/^E_[A-Z0-9_]{1,60}$/.test(String(error?.code))?error.code:'E_CLOUD_OBSERVE';
    return code+'：云控只读快照不可用。请核对扩展和 Side Panel 的连接状态。';
  }
  function showControls(){
    get('cc-prev').disabled=inflight||offset===0;
    get('cc-next').disabled=inflight||nextOffset===null;
    get('cc-refresh').disabled=inflight;
  }
  function render(data){
    put('cc-paired',data.paired?'已配对':'未配对');
    put('cc-connection',data.online?'已连接':data.connection==='backoff'?'重连中':'未连接');
    put('cc-reconciled',data.reconciled?'已对账':'未对账');
    put('cc-host','请在 Side Panel 核对');
    put('cc-slot',data.slotAvailable?'空闲':'占用或未就绪');
    put('cc-enabled',data.enabled?'托管已启用':'托管未启用');
    put('cc-tasks',Number.isSafeInteger(data.approvedTasks)?data.approvedTasks:0);
    total=Number.isSafeInteger(data.requestTotal)?data.requestTotal:0;
    put('cc-count',total);
    const rows=Array.isArray(data.rows)?data.rows.slice(0,20):[];
    list.replaceChildren();
    for(const row of rows){
      const li=doc.createElement('li'),head=doc.createElement('strong'),subtitle=doc.createElement('span'),tail=doc.createElement('small');
      head.textContent=STATES[row?.state]||STATES.other;
      subtitle.textContent=RUNS[row?.runState]||'尚无原 Run';
      tail.textContent=(row?.retirementReleased===true?'原资源已释放':'原资源待核对')+' · '+
        (row?.receiptConfirmed===true?'已确认回执':'回执未确认');
      li.append(head,subtitle,tail);list.append(li);
    }
    if(!rows.length){const empty=doc.createElement('li');empty.textContent='此页暂无请求记录';list.append(empty);}
    offset=Number.isSafeInteger(data.page?.offset)?data.page.offset:0;
    nextOffset=Number.isSafeInteger(data.page?.nextOffset)?data.page.nextOffset:null;
    put('cc-page',total?'第 '+(offset+1)+'–'+(offset+rows.length)+' 条，共 '+total+' 条':'暂无历史记录');
    const active=Object.entries(data.states||{}).filter(([key])=>key!=='other')
      .map(([key,value])=>(STATES[key]||STATES.other)+' '+(Number.isSafeInteger(value)?value:0)).join(' · ');
    put('cc-stage-counts',active);
    status.textContent='状态来自扩展内部只读服务。可观察事实不等于已取得执行许可。';
  }
  async function refresh(next=offset){
    if(disposed||inflight)return;
    inflight=true;const token=++sequence;showControls();
    status.textContent='正在读取扩展内的脱敏状态…';
    try{
      const response=await api.runtime.sendMessage({protocol:PROTOCOL,type:'cloudObserve',
        payload:{offset:next,limit:20}});
      if(disposed||token!==sequence)return;
      if(!response?.ok)throw {code:response?.error?.code||'E_CLOUD_OBSERVE'};
      if(response.data?.schema!=='opendesk.cloud-control.observer.v1')
        throw {code:'E_SCHEMA'};
      render(response.data);
    }catch(error){
      if(!disposed&&token===sequence)status.textContent=safeError(error);
    }finally{if(!disposed&&token===sequence){inflight=false;showControls();}}
  }
  on('cc-refresh','click',()=>{void refresh();});
  on('cc-prev','click',()=>{void refresh(Math.max(0,offset-20));});
  on('cc-next','click',()=>{if(nextOffset!==null)void refresh(nextOffset);});
  const visibility=()=>{if(doc.visibilityState==='visible'&&!inflight)void refresh();};
  doc.addEventListener?.('visibilitychange',visibility);
  const timer=refreshIntervalMs>0?setInterval(()=>{
    if(doc.visibilityState==='visible'&&!inflight)void refresh();
  },Math.max(refreshIntervalMs,10000)):null;
  showControls();void refresh(0);
  return {refresh,dispose(){disposed=true;sequence++;clearInterval(timer);
    for(const [el,type,listener] of listeners)el.removeEventListener(type,listener);
    doc.removeEventListener?.('visibilitychange',visibility);}};
}
