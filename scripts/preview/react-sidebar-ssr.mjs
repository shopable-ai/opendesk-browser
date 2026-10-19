// Render the real trusted React tree in memory. No Vite listener, product build,
// Chrome permissions, controller actions or sandbox code is started by a fixture.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
let compilation;
export function loadSidebarReact(){
  return compilation??=(async()=>{
    const result=await build({stdin:{resolveDir:root,contents:`
      export {SidebarAppShell} from './src/ui/react/app-shell.tsx';
      export {SidebarNavigation} from './src/ui/react/tabs/navigation.tsx';
      export {ToolHost} from './src/ui/react/tabs/tool-host.tsx';
      export {DeveloperPage,DeveloperDock} from './src/ui/react/tabs/develop.tsx';
      export {createDeveloperPreviewView} from './src/ui/react/preview/developer-preview.js';
      export {CloudConnectionPage,CloudOverviewText} from './src/ui/react/tabs/cloud.tsx';
      export {MyTaskCount,MyTaskDetail,MyTaskRows} from './src/ui/react/tabs/tasks.tsx';
      export {MyControl} from './src/ui/react/tabs/my-controls.tsx';
      export {MyTasksPage,MyTasksDock} from './src/ui/react/tabs/my-page.tsx';
      export {TaskCatalogPage} from './src/ui/react/tabs/task-catalog.tsx';
      export {createWorkflowUIState} from './src/ui/workflow/workflow-ui-state.js';
 export {createDeveloperView} from './src/ui/develop-view.js';
      export {createMyWorkbenchView} from './src/ui/my-workbench-view.js';
      export {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
    `},bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
      banner:{js:'import {createRequire as fixtureRequire} from "node:module"; const require=fixtureRequire('+JSON.stringify(import.meta.url)+');'},
      plugins:[{name:'shared-react-instance',setup(builder){
        builder.onResolve({filter:/^react(?:$|\/)/},({path,kind})=>({
          path:kind==='require-call'?require.resolve(path):pathToFileURL(require.resolve(path)).href,external:true}));
      }}]});
    return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  })();
}

export async function renderSidebarReact(options={}){
  const {SidebarAppShell,createDeveloperView,createMyWorkbenchView,createSidebarToolsView,createWorkflowUIState}=await loadSidebarReact();
  const owned=[];
  const view=(provided,create)=>{
    if(provided!==undefined)return provided;
    const next=create();owned.push(next);return next;
  };
  const developerView=view(options.developerView,createDeveloperView);
  const myView=view(options.myView,createMyWorkbenchView);
  const toolView=view(options.toolView,createSidebarToolsView);
  const workflowController=view(options.workflowController,()=>({...createWorkflowUIState(),actions:{}}));
  try{
    return renderToStaticMarkup(React.createElement(SidebarAppShell,{
      activeTab:'tasks',debugEnabled:true,onNavigate:()=>false,
      ...options,developerView,myView,toolView,workflowController}));
  }finally{
    for(const current of owned)current.dispose?.();
  }
}
