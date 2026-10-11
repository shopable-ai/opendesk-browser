import {createPageUI} from '@opendesk/ui';
import {createDemoEnhancer} from './enhancement.js';

// Pure JavaScript Vue 3: no .vue SFC/compiler, npm or manual Vite step.
// Vue is a fixed audited resource in the extension, not in the target website.
const pageRules={matches:['http://127.0.0.1:43111/*'],
  excludeMatches:['http://127.0.0.1:43111/private/*'],runAt:'document_idle',
  allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  const Vue=globalThis.OpenDeskPageVue;
  if(Vue?.version!=='3.5.22')throw Error('E_PAGE_FRAMEWORK_NOT_READY');
  const ui=createPageUI({id:'sample.page-ui-vue-direct',pageRules,
    mount:{selector:'#page-ui-demo-target',position:'after'}});
  try{
    ui.addStyle('.no-build-card{font:13px/1.5 system-ui,sans-serif;color:#183351;background:#fff;border:1px solid #b4c3d7;border-radius:10px;padding:12px;max-width:310px;display:grid;gap:8px}' +
      '.no-build-card button{font:inherit;padding:7px;border:1px solid #7299d8;border-radius:7px;background:#edf4ff;color:#21477b;cursor:pointer}' +
      '@media(prefers-color-scheme:dark){.no-build-card{color:#fff;background:#1d2b3c}.no-build-card button{background:#284669;color:#fff}}');
    const enhancer=createDemoEnhancer(ui);
    const app=Vue.createApp({
      setup(){
        const active=Vue.ref(false),message=Vue.ref('正在加载…');
        Vue.onMounted(()=>{message.value='已就绪（不需要手动编译）';});
        function toggle(){
          try{const result=enhancer.toggle();active.value=result.active;message.value=result.message;}
          catch(error){message.value='操作失败：'+String(error?.message||error);}
        }
        return ()=>Vue.h('section',{class:'no-build-card','aria-label':'OpenDesk Vue 网页增强'},[
          Vue.h('strong',null,'Vue 3 · 直接写 JS'),
          Vue.h('span',null,'仅修改网页中的指定测试段落'),
          Vue.h('button',{type:'button',onClick:toggle},active.value?'撤销高亮':'高亮段落'),
          Vue.h('span',{role:'status','aria-live':'polite'},message.value)
        ]);
      }
    });
    ui.onDispose(()=>app.unmount());
    app.mount(ui.content);
    return {framework:'vue',mode:'explicit-page-run',noUserBuild:true};
  }catch(error){ui.destroy();throw error;}
}
