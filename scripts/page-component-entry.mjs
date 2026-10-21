// System-generated, opt-in component wrapper for the existing Page USER_SCRIPT pipeline.
// This module constructs source; it never evaluates user code during preparation.
export const COMPONENT_ENTRY_FILE='.opendesk-page-component.mjs';
export function createPageComponentEntry(project,{componentStyles=[]}={}){
  if(project.runtimeKind!=='page-userscript'||project.entryMode!=='component')return null;
  if(!['react','vue'].includes(project.framework))throw Error('E_PROJECT_ENTRY_MODE');
  const source=JSON.stringify('./'+project.entry);
  const options=JSON.stringify({id:project.id,pageRules:project.pageRules});
  const css=componentStyles.map(row=>row.css).join('\n');
  const body=project.framework==='react'?[
    "import {createElement,useLayoutEffect} from 'react';",
    "import {createRoot} from 'react-dom/client';",
    '    await new Promise((resolve,reject)=>{',
    '      const root=createRoot(ui.content,{onUncaughtError:error=>{',
    '        if(typeof reportError==="function")reportError(error);else console.error(error);',
    '        reject(error);',
    '      }});',
    '      ui.onDispose(()=>root.unmount());',
    '      function Committed(){',
    '        useLayoutEffect(()=>{Promise.resolve().then(resolve);},[]);',
    '        return createElement(Component,{assets});',
    '      }',
    '      root.render(createElement(Committed));',
    '    });'
  ]:[
    "import {createApp,nextTick} from 'vue';",
    '    const app=createApp(Component,{assets});',
    '    ui.onDispose(()=>app.unmount());',
    '    let mountError,hasMountError=false;',
    '    const previousErrorHandler=app.config.errorHandler;',
    '    const captureError=error=>{if(!hasMountError){hasMountError=true;mountError=error;}};',
    '    app.config.errorHandler=captureError;',
    '    try{',
    '      app.mount(ui.content);',
    '      await nextTick();',
    '      if(hasMountError)throw mountError;',
    '    }finally{',
    '      if(app.config.errorHandler===captureError)app.config.errorHandler=previousErrorHandler;',
    '    }'
  ];
  const imports=body.splice(0,project.framework==='react'?2:1);
  return [
    `import Component from ${source};`,
    "import {createPageUI} from '@opendesk/ui';",
    ...imports,
    'export default async function main({assets}={}){',
    `  const ui=createPageUI(${options});`,
    '  try{',
    ...(css?['    ui.addStyle('+JSON.stringify(css)+');']:[]),
    ...body,
    `    return {framework:${JSON.stringify(project.framework)},mode:'component',mount:ui.getMountDiagnostics()};`,
    '  }catch(error){ui.destroy();throw error;}',
    '}',
    ''
  ].join('\n');
}
