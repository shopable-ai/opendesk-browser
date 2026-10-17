/* Reading TOC offline preview adapter.
   Only the SDK boundary is simulated. The UI executes the compiled real tool JS. */
(()=>{
  'use strict';
  const root=document.getElementById('tool-root');
  if(!root)throw Error('E_TOC_PREVIEW_ROOT');
  const validScenarios=new Set(['success','empty','error','loading','permission-denied','untrusted','chatgpt-multi']);
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
    // R1.4 native regression: two H1 with same-labelled H2 in ONE answer.
    // Distinct IDs deliberately prove that display code cannot dedupe labels.
    {id:'h-10',sourceId:'s-2',label:'回答一 H1',depth:0,topId:'h-10'},
    {id:'h-11',sourceId:'s-2',label:'重复标题',depth:1,topId:'h-10',parentId:'h-10'},
    {id:'h-12',sourceId:'s-2',label:'同一回答第二个 H1',depth:0,topId:'h-12'},
    {id:'h-13',sourceId:'s-2',label:'重复标题',depth:1,topId:'h-12',parentId:'h-12'}
  ];
  // Preview data only: three assistant turns, two H1s within the first turn,
  // and duplicate H2 labels across different turns.
  const chatItems=[
    {id:'h-20',sourceId:'s-1',label:'周末城市公园活动计划',depth:0,topId:'h-20'},
    {id:'h-21',sourceId:'s-1',label:'出行路线',depth:1,parentId:'h-20',topId:'h-20'},
    {id:'h-22',sourceId:'s-1',label:'行程时间安排',depth:0,topId:'h-22'},
    {id:'h-23',sourceId:'s-1',label:'注意事项',depth:1,parentId:'h-22',topId:'h-22'},
    {id:'h-24',sourceId:'s-2',label:'交通与预算',depth:0,topId:'h-24'},
    {id:'h-25',sourceId:'s-2',label:'出行路线',depth:1,parentId:'h-24',topId:'h-24'},
    {id:'h-26',sourceId:'s-3',label:'雨天备选',depth:0,topId:'h-26'},
    {id:'h-27',sourceId:'s-3',label:'注意事项',depth:1,parentId:'h-26',topId:'h-26'}
  ];
  const sample=()=>{
    if(scenario==='chatgpt-multi')return {
      adapter:'chatgpt',items:chatItems.map(item=>({...item})),activeId:'h-25',
      sources:['s-1','s-2','s-3'].map((id,index)=>({id,label:'回答 '+(index+1),kind:'answer'})),
      overview:Object.fromEntries(['s-1','s-2','s-3'].map(id=>[id,{
        ids:chatItems.filter(item=>item.sourceId===id).map(item=>item.id),
        hiddenCount:0,representedId:chatItems.find(item=>item.sourceId===id)?.id||''
      }]))
    };
    const data={adapter:'article',items:rows.map(item=>({...item})),activeId:'h-2',
      sources:[{id:'s-1',label:'当前文章'},{id:'s-2',label:'AI 回复'}],
      overview:{
       's-1':{ids:['h-1','h-4','h-8'],hiddenCount:6,representedId:'h-1'},
       's-2':{ids:['h-10','h-11','h-12','h-13'],hiddenCount:0,representedId:'h-10'}
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
