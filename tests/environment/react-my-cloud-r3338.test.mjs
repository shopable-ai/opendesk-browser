import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
const read=path=>readFile(path,'utf8');
test('R33.3.8 My and Cloud real React TSX renders trusted escaped strings',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true},logLevel:'error'});
  t.after(()=>vite.close());
  const {MyTaskCount,MyTaskDetail,MyTaskRows}=
    await vite.ssrLoadModule('/src/ui/react/tabs/tasks.tsx');
  const {CloudOverviewText}=
    await vite.ssrLoadModule('/src/ui/react/tabs/cloud.tsx');
  const poison='<img src=x onerror=alert(1)>';
  const html=renderToStaticMarkup(React.createElement(MyTaskRows,{
    rows:[{taskId:'safe',title:poison,description:poison,enabled:false}],
    selectedId:'safe',workspace:null,emptyText:'',onSelect:()=>{}
  }));
  assert.match(html,/data-task-id="safe"/);
  assert.match(html,/aria-controls="task-selected-workspace"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/已停用/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img\b/);
  for(const component of [MyTaskCount,MyTaskDetail,CloudOverviewText])
    assert.match(renderToStaticMarkup(React.createElement(component,{value:poison})),
      /&lt;img src=x onerror=alert\(1\)&gt;/);
});
test('R33.3.8 single React root and legacy authoritative action owners',async()=>{
  const [root,tasks,cloud,shell,preview,builder]=await Promise.all([
    read('src/ui/react/main.tsx'),read('src/ui/task-workbench.js'),
    read('src/ui/cloud-hosting.js'),read('src/ui/tool-shell.js'),
    read('src/ui/react/preview/sidebar-six-preview.tsx'),
    read('scripts/preview/build-sidebar-six-react-preview.mjs')
  ]);
  assert.equal((root.match(/createRoot\(/g)||[]).length,1);
  assert.match(root,/myRows\.after\(myWorkspace\)/);
  assert.match(root,/renderMyTaskRows\(next\)/);
  assert.match(root,/renderCloudOverview\(next\)/);
  assert.match(tasks,/connectReactMyTasks\(view\)/);
  assert.match(tasks,/reactMyTasks\.renderMyTaskRows\(/);
  assert.match(tasks,/return; \/\/ React alone owns card children/);
  assert.match(cloud,/reactUI\.renderCloudPage\(/);
  assert.match(shell,/connectReactMyTasks\(extensionList\)/);
  assert.match(shell,/reactUI:extensionList/);
  for(const name of ['tabs/tasks.tsx','tabs/cloud.tsx'])
    assert.ok(builder.includes('src/ui/react/'+name));
  for(const name of ['MyTaskRows','CloudOverviewText'])
    assert.match(preview,new RegExp('createPortal\\(<'+name+'\\b'));
  assert.doesNotMatch(await read('src/ui/react/tabs/tasks.tsx'),
    /\bchrome\.|cloudNext|eval\(|innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(await read('src/ui/react/tabs/cloud.tsx'),
    /\bchrome\.|cloudNext|cloudPair|cloudApprove|eval\(|innerHTML/);
});
