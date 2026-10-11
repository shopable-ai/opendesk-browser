import {createPageUI} from '@opendesk/ui';
import {createDemoEnhancer} from './enhancement.js';

// Pure JavaScript React 19: no JSX, no npm install, no user Vite command.
// The extension loads the pinned React/ReactDOM once from its own package.
const pageRules={matches:['http://127.0.0.1:43111/*'],
  excludeMatches:['http://127.0.0.1:43111/private/*'],runAt:'document_idle',
  allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  const React=globalThis.OpenDeskPageReact;
  if(React?.version!=='19.2.0')throw Error('E_PAGE_FRAMEWORK_NOT_READY');
  const ui=createPageUI({id:'sample.page-ui-react-direct',pageRules,
    mount:{selector:'#page-ui-demo-target',position:'after'}});
  try{
    ui.addStyle('.no-build-card{font:13px/1.5 system-ui,sans-serif;color:#183351;background:#fff;border:1px solid #b4c3d7;border-radius:10px;padding:12px;max-width:310px;display:grid;gap:8px}' +
      '.no-build-card button{font:inherit;padding:7px;border:1px solid #7299d8;border-radius:7px;background:#edf4ff;color:#21477b;cursor:pointer}' +
      '@media(prefers-color-scheme:dark){.no-build-card{color:#fff;background:#1d2b3c}.no-build-card button{background:#284669;color:#fff}}');
    const enhancer=createDemoEnhancer(ui);
    const h=React.createElement;
    function Widget(){
      const [active,setActive]=React.useState(false);
      const [message,setMessage]=React.useState('正在加载…');
      React.useEffect(()=>setMessage('已就绪（不需要手动编译）'),[]);
      function toggle(){
        try{const result=enhancer.toggle();setActive(result.active);setMessage(result.message);}
        catch(error){setMessage('操作失败：'+String(error?.message||error));}
      }
      return h('section',{className:'no-build-card','aria-label':'OpenDesk React 网页增强'},
        h('strong',null,'React · 直接写 JS'),
        h('span',null,'仅修改网页中的指定测试段落'),
        h('button',{type:'button',onClick:toggle},active?'撤销高亮':'高亮段落'),
        h('span',{role:'status','aria-live':'polite'},message));
    }
    const root=React.createRoot(ui.content);
    ui.onDispose(()=>root.unmount());
    root.render(h(Widget));
    return {framework:'react',mode:'explicit-page-run',noUserBuild:true};
  }catch(error){ui.destroy();throw error;}
}
