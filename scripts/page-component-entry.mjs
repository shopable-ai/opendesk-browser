// System-generated, opt-in component wrapper for the existing Page USER_SCRIPT pipeline.
// This module constructs source; it never evaluates user code during preparation.
export const COMPONENT_ENTRY_FILE='.opendesk-page-component.mjs';
export function createPageComponentEntry(project){
  if(project.runtimeKind!=='page-userscript'||project.entryMode!=='component')return null;
  if(!['react','vue'].includes(project.framework))throw Error('E_PROJECT_ENTRY_MODE');
  const source=JSON.stringify('./'+project.entry);
  const options=JSON.stringify({id:project.id,pageRules:project.pageRules});
  const body=project.framework==='react'?[
    "import {createElement} from 'react';",
    "import {createRoot} from 'react-dom/client';",
    '    const root=createRoot(ui.content);',
    '    ui.onDispose(()=>root.unmount());',
    '    root.render(createElement(Component,{assets}));'
  ]:[
    "import {createApp} from 'vue';",
    '    const app=createApp(Component,{assets});',
    '    ui.onDispose(()=>app.unmount());',
    '    app.mount(ui.content);'
  ];
  const imports=body.splice(0,project.framework==='react'?2:1);
  return [
    `import Component from ${source};`,
    "import {createPageUI} from '@opendesk/ui';",
    ...imports,
    'export default async function main({assets}={}){',
    `  const ui=createPageUI(${options});`,
    '  try{',
    ...body,
    `    return {framework:${JSON.stringify(project.framework)},mode:'component',mount:ui.getMountDiagnostics()};`,
    '  }catch(error){ui.destroy();throw error;}',
    '}',
    ''
  ].join('\n');
}
