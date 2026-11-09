// Test-only consumer of the public API. No Host/Bridge or confirmation UI copy.
import {createApp,h,ref} from 'vue';
const tool=globalThis.OpenDeskTool;
createApp({setup(){
  const result=ref('尚未请求'),pending=ref(false);let controller=null;
  function confirm(long=false){
    if(pending.value)return;
    controller=new AbortController();pending.value=true;result.value='等待选择';
    const current=controller;
    try{
      const deciding=tool.ui.confirm({title:'Vue 普通确认',message:long?
        '<b>仅作为文字</b>\n'+('这是完整的操作后果说明，不截断、不写入、不授权。\n'.repeat(30)):
        '仅选择，不写入、不授权。',
        confirmLabel:'确认选择',cancelLabel:'保留',tone:'danger'},{signal:current.signal});
      Promise.resolve(deciding).then(answer=>{result.value=JSON.stringify(answer);},error=>{
        result.value=JSON.stringify({error:error?.code||String(error)});
      }).finally(()=>{if(controller===current){controller=null;pending.value=false;}})
        .catch(error=>{result.value=String(error);});
    }catch(error){result.value=JSON.stringify({error:error?.code||String(error)});controller=null;pending.value=false;}
  }
  return ()=>h('main',{class:'od-page'},[
    h('h1','Vue ui.confirm fixture'),
    h('p','共享确认仅返回选择；本夹具没有业务写入。'),
    h('button',{id:'vue-confirm',type:'button',class:'od-button',disabled:pending.value,onClick:()=>confirm()},'请求确认'),
    h('button',{id:'vue-confirm-long',type:'button',class:'od-button',disabled:pending.value,onClick:()=>confirm(true)},'长文确认'),
    h('button',{id:'vue-abort',type:'button',class:'od-button',disabled:!pending.value,onClick:()=>controller?.abort()},'中止等待'),
    h('p',{id:'vue-result',role:'status','aria-live':'polite'},result.value)
  ]);
}}).mount(tool.root.querySelector('#tool-app'));
