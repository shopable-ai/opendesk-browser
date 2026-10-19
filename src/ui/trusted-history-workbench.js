// Trusted Side Panel UI only. History results never pass through installed
// tool sandboxes, user drafts, logs or storage.
import {BROWSER_HOST_PROTOCOL} from '../framework/sdk/browser-contract.js';

const DAY_MS=24*60*60*1000;
const MAX_RANGE_DAYS=31;
const error=(code,message)=>Object.assign(new Error(message||code),{code});

export const TRUSTED_HISTORY_INITIAL_STATE=Object.freeze({
  text:'',startDate:'',endDate:'',limit:'25',busy:false,
  status:'选择最多 31 天的日期范围后查询。',permission:'unknown',visits:null
});

function readDate(value,endOfDay=false){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw error('E_SCHEMA','请输入完整日期范围。');
  const time=Date.parse(value+'T00:00:00');
  if(!Number.isSafeInteger(time))throw error('E_SCHEMA','日期无效。');
  return time+(endOfDay?DAY_MS-1:0);
}

export function normalizeTrustedHistoryForm({text,startDate,endDate,limit}={}){
  const query=String(text??'').trim();
  if(!query||new TextEncoder().encode(query).length>256)
    throw error('E_SCHEMA','请输入 1-256 字节的搜索文本。');
  const startTime=readDate(startDate,false);
  const endTime=readDate(endDate,true);
  if(endTime<startTime)throw error('E_SCHEMA','结束日期不能早于开始日期。');
  if(endTime-startTime>MAX_RANGE_DAYS*DAY_MS-1)
    throw error('E_SCHEMA','历史搜索日期范围最多 31 天。');
  const max=Number(limit);
  if(!Number.isSafeInteger(max)||max<1||max>100)
    throw error('E_SCHEMA','limit 必须是 1-100。');
  return {text:query,startTime,endTime,limit:max};
}

// The single trusted React root owns the UI. This controller retains query,
// permission and Host authority; installed tool renderers never receive it.
export function createTrustedHistoryWorkbench({
  api=globalThis.chrome,hostInstanceId,reactUI
}={}){
  if(typeof reactUI?.renderBrowserHistory!=='function'||
    typeof reactUI?.connectBrowserHistoryActions!=='function')return Object.freeze({dispose(){}});

  let disposed=false,permissionKnown=null,permissionRevision=0,seq=0;
  let state=TRUSTED_HISTORY_INITIAL_STATE;
  const publish=patch=>{
    if(disposed)return;
    state=Object.freeze({...state,...patch});
    reactUI.renderBrowserHistory(state);
  };

  async function refreshPermission(){
    const revision=permissionRevision;
    let granted=false;
    try{granted=await api?.permissions?.contains?.({permissions:['history']})===true;}catch{}
    if(disposed||revision!==permissionRevision)return;
    permissionKnown=granted;
    publish({permission:granted?'granted':'missing'});
  }

  async function ensurePermission(){
    if(permissionKnown===true)return true;
    if(typeof api?.permissions?.request!=='function')
      throw error('E_CHROME_PERMISSION_REQUIRED','Chrome history 权限不可用。');
    permissionRevision++;
    // Start the request synchronously within the original trusted click stack.
    const request=api.permissions.request({permissions:['history']});
    if(!request||typeof request.then!=='function')
      throw error('E_CHROME_PERMISSION_REQUIRED','Chrome history 权限请求失败。');
    const granted=await request;
    if(disposed)return false;
    permissionKnown=granted===true;
    publish({permission:permissionKnown?'granted':'missing'});
    if(!permissionKnown)throw error('E_CHROME_PERMISSION_REQUIRED','未授予 Chrome history 权限。');
    return true;
  }

  async function search(event){
    if(disposed||state.busy||!event?.isTrusted)return;
    let args;
    try{args=normalizeTrustedHistoryForm(state);}
    catch(cause){publish({status:cause.message||'输入无效。',visits:null});return;}
    const current=++seq;
    publish({busy:true,status:'正在查询当前可信 Side Panel 的浏览历史…',visits:null});
    try{
      await ensurePermission();
      if(disposed||current!==seq)return;
      const response=await api.runtime.sendMessage({
        protocol:BROWSER_HOST_PROTOCOL,kind:'host',operation:'browser.history.searchTrusted',
        args,hostInstanceId
      });
      if(!response?.ok)throw error(String(response?.error?.code||'E_BROWSER'),
        String(response?.error?.message||'浏览器拒绝历史查询。'));
      if(!Array.isArray(response.data?.visits))throw error('E_BROWSER','历史查询返回格式无效。');
      if(disposed||current!==seq)return;
      const visits=Object.freeze(response.data.visits.map(({url,title,lastVisitTime})=>
        Object.freeze({url,title,lastVisitTime})));
      publish({visits,status:'已返回 '+visits.length+' 条结果。'});
    }catch(cause){
      if(disposed||current!==seq)return;
      const code=String(cause?.code||'E_BROWSER');
      publish({visits:null,status:({
        E_CHROME_PERMISSION_REQUIRED:'需要 Chrome history 可选权限；请重新点击查询并在浏览器权限框中允许。',
        E_DOCUMENT_CHANGED:'Side Panel 文档已变化；请重新打开后查询。',
        E_OWNER:'当前页面不是可信 OpenDesk Side Panel。',
        E_SCHEMA:'查询条件无效。',
        E_BROWSER:'浏览器未能完成历史查询。'
      })[code]||('历史查询未完成（'+code.slice(0,65)+'）。')});
    }finally{
      if(!disposed)publish({busy:false});
    }
  }

  const actions=Object.freeze({
    change(field,value){
      if(disposed||!['text','startDate','endDate','limit'].includes(field))return;
      seq++;
      publish({[field]:String(value??''),status:'输入查询条件后点击查询。',visits:null});
    },
    search
  });
  reactUI.renderBrowserHistory(state);
  reactUI.connectBrowserHistoryActions(actions);
  void refreshPermission();
  return Object.freeze({dispose(){
    if(disposed)return;
    disposed=true;seq++;state=null;
    reactUI.renderBrowserHistory(null);
    reactUI.connectBrowserHistoryActions(null);
  }});
}
