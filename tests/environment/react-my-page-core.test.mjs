import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {parseHTML} from 'linkedom';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

test('My page, owning dock and standalone task catalog consume the same presentation state',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),appType:'custom',server:{middlewareMode:true},logLevel:'error'});
  t.after(()=>vite.close());
  const {MyControl}=await vite.ssrLoadModule('/src/ui/react/tabs/my-controls.tsx');
  const {TaskCatalogPage}=await vite.ssrLoadModule('/src/ui/react/tabs/task-catalog.tsx');
  const view=createMyWorkbenchView();
  view.field('task-result-panel').hidden=false;
  view.field('task-result').text='a real task result';
  view.field('task-stop').attributes['aria-label']='停止「任务 A」';
  view.field('task-stop').hidden=false;
  const result=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-result-panel'}))).document;
  assert.equal(result.getElementById('task-result-panel').hasAttribute('hidden'),false);
  view.field('task-dock').hidden=false;
  const dock=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-dock'}))).document;
  assert.equal(dock.getElementById('task-dock').hasAttribute('hidden'),false);
  const hidden=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-dock',hidden:true}))).document;
  assert.equal(hidden.getElementById('task-dock').hasAttribute('hidden'),true);
  view.data.catalogRows={rows:[{key:'task@1',title:'<unsafe>',description:'description',state:'待验证'}],selectedKey:'task@1'};
  const markup=renderToStaticMarkup(React.createElement(TaskCatalogPage,{view}));
  assert.match(markup,/&lt;unsafe&gt;/);
  assert.doesNotMatch(markup,/<unsafe>/);
  const catalog=parseHTML(markup).document;
  for(const id of ['task-catalog-list','task-package-file','task-verify-run','task-verify','task-publish','task-install','task-catalog-status'])
    assert.ok(catalog.getElementById(id),id+' must have a real React consumer');
});
