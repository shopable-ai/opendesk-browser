/* Reading TOC offline preview adapter.
   Only the SDK boundary is simulated. The UI executes the compiled real tool JS. */
(()=>{
  'use strict';
  const root=document.getElementById('tool-root');
  if(!root)throw Error('E_TOC_PREVIEW_ROOT');
  const validScenarios=new Set(['success','empty','error','loading','permission-denied','untrusted']);
  let scenario=globalThis.__opendeskPreviewScenario||'success',locale='zh-CN';
  if(!validScenarios.has(scenario))throw Error('E_TOC_PREVIEW_SCENARIO');
  const localeCallbacks=new Set(),waiting=new Set();
  const rows=[
    {id:'h-1',sourceId:'s-1',label:'OpenDesk Browser 阅读指南',depth:0,topId:'h-1'},
    {id:'h-2',sourceId:'s-1',label:'产品目标',depth:1,topId:'h-1'},
    {id:'h-3',sourceId:'s-1',label:'安装与开始使用',depth:1,topId:'h-1'},
    {id:'h-4',sourceId:'s-1',label:'常用操作',depth:0,topId:'h-4'},
    {id:'h-5',sourceId:'s-1',label:'快速打开工具',depth:1,topId:'h-4'},
    {id:'h-6',sourceId:'s-1',label:'按需刷新目录',depth:1,topId:'h-4'},
    {id:'h-7',sourceId:'s-1',label:'多语言界面',depth:1,topId:'h-4'},
    {id:'h-8',sourceId:'s-1',label:'数据安全',depth:0,topId:'h-8'},
    {id:'h-9',sourceId:'s-1',label:'扩展权限说明',depth:1,topId:'h-8'},
    {id:'h-10',sourceId:'s-2',label:'模拟 AI 回复 · 操作建议',depth:0,topId:'h-10'},
    {id:'h-11',sourceId:'s-2',label:'步骤一：查看页面',depth:1,topId:'h-10'}
  ];
  const sample=()=>{
    const data={items:rows.map(item=>({...item})),activeId:'h-2',
      sources:[{id:'s-1',label:'当前文章'},{id:'s-2',label:'AI 回复'}],
      overview:{
       's-1':{ids:['h-1','h-4','h-8'],hiddenCount:6,representedId:'h-1'},
       's-2':{ids:['h-10','h-11'],hiddenCount:0,representedId:'h-10'}
      }};
    return scenario==='empty'?{items:[],sources:[],activeId:'',overview:{}}:data;
  };
  const rejected=message=>Promise.reject(Error('[离线模拟] '+message));
  async function request(operation,payload={}){
    if(!['toc.snapshot','toc.navigate'].includes(operation))return rejected('未授权的模拟操作');
    if(scenario==='loading')return new Promise((resolve,reject)=>waiting.add(reject));
    if(scenario==='permission-denied'||scenario==='untrusted')return rejected('无网站访问权限');
    if(scenario==='error')return rejected('模拟网页暂时无法读取');
    if(operation==='toc.snapshot')return sample();
    const item=sample().items.find(row=>row.id===payload?.id&&row.sourceId===payload?.sourceId);
    if(!item)return rejected('目标章节不存在');
    parent.postMessage({kind:'opendesk-toc-preview-navigation',label:item.label},'*');
    return {ok:true,simulated:true,id:item.id,sourceId:item.sourceId};
  }
  Object.defineProperty(globalThis,'OpenDeskTool',{
    configurable:false,enumerable:false,writable:false,
    value:Object.freeze({
      root,request,setState:()=>{},
      get locale(){return locale;},
      onLocaleChange(callback){
        if(typeof callback!=='function')throw Error('E_TOC_PREVIEW_CALLBACK');
        localeCallbacks.add(callback);
        return ()=>localeCallbacks.delete(callback);
      }
    })
  });
  window.addEventListener('message',event=>{
    if(event.source!==parent||!event.data||typeof event.data!=='object')return;
    if(event.data.kind==='opendesk-toc-preview-locale'){
      if(!['zh-CN','en'].includes(event.data.locale))return;
      if(event.data.locale===locale)return;
      locale=event.data.locale;document.documentElement.lang=locale;
      for(const callback of localeCallbacks)callback(locale);
    }
    if(event.data.kind==='opendesk-toc-preview-scenario'){
      if(!validScenarios.has(event.data.scenario))return;
      scenario=event.data.scenario;
      // Abort only the simulated hanging response; normal R4.8 recovery is retained.
      for(const reject of waiting)reject(Error('[离线模拟] 读取状态已变化'));
      waiting.clear();
      window.dispatchEvent(new Event('focus'));
    }
  });
})();
