// Trusted Side Panel UI only. History results never pass through installed
// tool sandboxes, user drafts, logs or storage.
import {BROWSER_HOST_PROTOCOL} from '../framework/sdk/browser-contract.js';

const DAY_MS=24*60*60*1000;
const MAX_RANGE_DAYS=31;
const error=(code,message)=>Object.assign(new Error(message||code),{code});

// This UI is part of the extension's compiled, audited source. Installed
// packages never supply this DOM or execute in this trusted document. The
// list-owned container hides it when the host opens any tool or preview.
export function mountTrustedHistoryWorkbench(doc=globalThis.document){
  if(doc?.getElementById?.('trusted-history-panel'))return;
  const parent=doc?.getElementById?.('sidebar-host-browser-tools');
  if(!parent)return;
  const element=(tag,id,classes,text)=>{
    const node=doc.createElement(tag);if(id)node.id=id;
    node.className=classes;if(text)node.textContent=text;return node;
  };
  const panel=element('details','trusted-history-panel','od-disclosure od-disclosure--flat');
  panel.append(element('summary','','','历史记录查询'));
  const body=element('div','','od-stack');
  for(const [id,label,type] of [['text','搜索文本','search'],['start','开始日期','date'],
    ['end','结束日期','date'],['limit','结果数量','number']]){
    const field=element('label','','od-form-field');
    const input=element('input','trusted-history-'+id,'od-field');input.type=type;
    if(id==='limit'){input.min='1';input.max='100';input.value='25';}
    field.append(element('span','','od-field-label',label),input);body.append(field);
  }
  const search=element('button','trusted-history-search','od-button','查询历史');search.type='button';
  const status=element('p','trusted-history-status','od-note','选择最多 31 天的日期范围后查询。');
  status.setAttribute('role','status');
  const results=element('div','trusted-history-results','od-stack');results.setAttribute('aria-live','polite');
  body.append(search,status,results);panel.append(body);parent.append(panel);parent.hidden=false;
}

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

export function createTrustedHistoryWorkbench({
  api=globalThis.chrome,doc=globalThis.document,hostInstanceId
}={}){
  const root=doc?.getElementById?.('trusted-history-panel');
  const textNode=doc?.getElementById?.('trusted-history-text');
  const startNode=doc?.getElementById?.('trusted-history-start');
  const endNode=doc?.getElementById?.('trusted-history-end');
  const limitNode=doc?.getElementById?.('trusted-history-limit');
  const searchButton=doc?.getElementById?.('trusted-history-search');
  const statusNode=doc?.getElementById?.('trusted-history-status');
  const resultsNode=doc?.getElementById?.('trusted-history-results');
  if(!root||!textNode||!startNode||!endNode||!limitNode||!searchButton||!statusNode||!resultsNode)
    return Object.freeze({dispose(){}});

  let disposed=false,busy=false,permissionKnown=null,seq=0;
  const listeners=[];
  const listen=(node,name,fn)=>{node.addEventListener(name,fn);listeners.push(()=>node.removeEventListener?.(name,fn));};
  const setStatus=value=>{statusNode.textContent=value;};
  const setBusy=value=>{busy=value;searchButton.disabled=value;};
  const clearResults=()=>resultsNode.replaceChildren();

  async function refreshPermission(){
    try{
      permissionKnown=await api?.permissions?.contains?.({permissions:['history']})===true;
    }catch{permissionKnown=false}
    if(!disposed)root.dataset.historyPermission=permissionKnown?'granted':'missing';
  }

  async function ensurePermission(){
    if(permissionKnown===true)return true;
    if(typeof api?.permissions?.request!=='function')
      throw error('E_CHROME_PERMISSION_REQUIRED','Chrome history 权限不可用。');
    const request=api.permissions.request({permissions:['history']});
    if(!request||typeof request.then!=='function')
      throw error('E_CHROME_PERMISSION_REQUIRED','Chrome history 权限请求失败。');
    const granted=await request;
    permissionKnown=granted===true;
    root.dataset.historyPermission=permissionKnown?'granted':'missing';
    if(!permissionKnown)throw error('E_CHROME_PERMISSION_REQUIRED','未授予 Chrome history 权限。');
    return true;
  }

  function render(visits=[]){
    clearResults();
    if(!visits.length){
      const empty=doc.createElement('p');
      empty.className='hint';
      empty.textContent='没有匹配的历史记录。';
      resultsNode.append(empty);
      return;
    }
    const list=doc.createElement('div');
    list.className='od-stack trusted-history-results-list';
    for(const visit of visits){
      const item=doc.createElement('article');
      item.className='od-surface od-surface--padded trusted-history-result';
      const title=doc.createElement('strong');
      title.textContent=visit.title||visit.url;
      const url=doc.createElement('code');
      url.className='od-technical';
      url.textContent=visit.url;
      const time=doc.createElement('small');
      time.className='od-note';
      time.textContent=Number.isFinite(visit.lastVisitTime)
        ?new Date(visit.lastVisitTime).toLocaleString():'未知时间';
      item.append(title,url,time);
      list.append(item);
    }
    resultsNode.append(list);
  }

  async function search(event){
    if(disposed||busy||!event?.isTrusted)return;
    let args;
    try{
      args=normalizeTrustedHistoryForm({
        text:textNode.value,startDate:startNode.value,endDate:endNode.value,limit:limitNode.value
      });
    }catch(cause){
      setStatus(cause.message||'输入无效。');clearResults();return;
    }
    const current=++seq;
    setBusy(true);setStatus('正在查询当前可信 Side Panel 的浏览历史…');clearResults();
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
      render(response.data.visits);
      setStatus('已返回 '+response.data.visits.length+' 条结果。');
    }catch(cause){
      if(disposed||current!==seq)return;
      const code=String(cause?.code||'E_BROWSER');
      setStatus(({
        E_CHROME_PERMISSION_REQUIRED:'需要 Chrome history 可选权限；请重新点击查询并在浏览器权限框中允许。',
        E_DOCUMENT_CHANGED:'Side Panel 文档已变化；请重新打开后查询。',
        E_OWNER:'当前页面不是可信 OpenDesk Side Panel。',
        E_SCHEMA:'查询条件无效。',
        E_BROWSER:'浏览器未能完成历史查询。'
      })[code]||('历史查询未完成（'+code.slice(0,65)+'）。'));
      clearResults();
    }finally{
      if(!disposed)setBusy(false);
    }
  }

  root.dataset.trustedHistoryWorkbench='mounted';
  listen(searchButton,'click',event=>{void search(event);});
  listen(textNode,'input',()=>{seq++;setStatus('输入查询条件后点击查询。');clearResults();});
  listen(startNode,'input',()=>{seq++;setStatus('输入查询条件后点击查询。');clearResults();});
  listen(endNode,'input',()=>{seq++;setStatus('输入查询条件后点击查询。');clearResults();});
  listen(limitNode,'input',()=>{seq++;setStatus('输入查询条件后点击查询。');clearResults();});
  void refreshPermission();
  return Object.freeze({dispose(){
    disposed=true;seq++;
    for(const off of listeners.splice(0))off();
  }});
}
