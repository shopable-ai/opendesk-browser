import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

test('App Shell preserves a Page preview Stop across tabs and restores the idle dock',async t=>{
  await mkdir('artifacts',{recursive:true});
  const dir=await mkdtemp(path.resolve('artifacts/react-shell-state-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const outfile=path.join(dir,'app-shell.mjs');
  await build({entryPoints:['src/ui/react/app-shell.tsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external'});
  const {SidebarAppShell}=await import(pathToFileURL(outfile).href);
  const developerView=createDeveloperView(),myView=createMyWorkbenchView();
  myView.project('runDock',{taskHidden:true,developHidden:true,hidden:true,stopOnly:false});
  const render=()=>parseHTML(renderToStaticMarkup(React.createElement(SidebarAppShell,{
    scaffold:{beforeTools:[],afterTools:[],beforeList:[],afterList:[],listRemainder:[]},
    activeTab:'cloud',developerView,myView
  }))).document;
  developerView.patch('script-stop',{disabled:false,hidden:false,textContent:'停止受管 UI'});
  let doc=render();
  assert.equal(doc.getElementById('workspace-dock').hidden,false);
  assert.equal(doc.getElementById('workspace-dock').dataset.stopOnly,'true');
  assert.equal(doc.getElementById('develop-dock').hidden,false);
  assert.equal(doc.getElementById('task-dock').hidden,true);
  assert.equal(doc.getElementById('script-stop').disabled,false);
  developerView.patch('script-stop',{disabled:true});
  doc=render();
  assert.equal(doc.getElementById('workspace-dock').hidden,true);
  developerView.patch('site-access-status',{data:{websites:false}});
  doc=render();
  assert.equal(doc.getElementById('site-access-recovery').hidden,false);
});
