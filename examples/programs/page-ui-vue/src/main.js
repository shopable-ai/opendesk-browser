import {createPageUI} from '@opendesk/ui';
import {mountVue} from './compiled/framework.js';
import {createDemoEnhancer} from './enhancement.js';
const pageRules={matches:['http://127.0.0.1/*'],excludeMatches:['http://127.0.0.1/private/*'],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
export default async function main(){
  const ui=createPageUI({id:'sample.page-ui-vue',pageRules,
    mount:{selector:'#page-ui-demo-target',position:'after',mode:'auto'}});
  try{
    ui.addStyle('.r241-card{padding:10px 12px;background:#fff;color:#152c4a;border:1px solid #a1b2c7;border-radius:10px;max-width:320px;font:13px/1.5 system-ui,sans-serif}' +
      '.r241-card button{cursor:pointer;padding:7px 10px;border-radius:7px;border:1px solid #6480ac;background:#eef4ff;color:#1c3f7a}' +
      '.r241-card [role="status"]{display:block;margin-top:5px;overflow-wrap:anywhere}' +
      '@media(prefers-color-scheme:dark){.r241-card{background:#202b39;color:#f1f5fa}.r241-card button{background:#2c4367;color:#fff}}');
    const enhancer=createDemoEnhancer(ui);
    const app=mountVue(ui.content,{onToggle:enhancer.toggle});
    ui.onDispose(()=>app.unmount());
    return {framework:'vue',mode:'manual-page-preview',mount:ui.getMountDiagnostics()};
  }catch(error){ui.destroy();throw error;}
}
