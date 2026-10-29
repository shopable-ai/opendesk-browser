import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bookmarkEditorNavigation} from '../../projects/bookmark-manager/src/react/navigation.js';

const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('real bookmark editor sheet is a child while preview/drawer remains root',()=>{
  const root={page:'home',title:'书签管理',canBack:false};
  assert.deepEqual(bookmarkEditorNavigation(null),root);
  assert.deepEqual(bookmarkEditorNavigation({mode:'preview',kind:'bookmark'}),root);
  assert.deepEqual(bookmarkEditorNavigation({mode:'create',kind:'bookmark'}),
    {page:'create',title:'新建书签',canBack:true});
  assert.deepEqual(bookmarkEditorNavigation({mode:'create',kind:'folder'}),
    {page:'create',title:'新建文件夹',canBack:true});
  assert.deepEqual(bookmarkEditorNavigation({mode:'edit',kind:'bookmark'}),
    {page:'edit',title:'编辑书签',canBack:true});
  assert.deepEqual(bookmarkEditorNavigation({mode:'edit',kind:'folder'}),
    {page:'edit',title:'编辑文件夹',canBack:true});
  assert.deepEqual(bookmarkEditorNavigation({mode:'edit',kind:'invalid'}),root);
});

test('trusted Bookmark App reports editor state and routes shared Back to existing dirty guard',async()=>{
  const [app,host,entry]=await Promise.all([
    read('projects/bookmark-manager/src/react/App.jsx'),
    read('src/ui/sidebar-tools.js'),read('src/ui/react/main.tsx')
  ]);
  assert.match(app,/navigation:bookmarkEditorNavigation\(draft\)/);
  assert.match(app,/aria-label=\{draft\?bookmarkEditorNavigation\(draft\)\.title:'书签详情'\}/);
  assert.match(app,/back:draft\?\(\)=>requestCloseSheet\(\):null/);
  assert.match(app,/function requestCloseSheet\(\)\{/);
  assert.match(app,/if\(busyRef\.current\)return;/);
  assert.match(app,/if\(dirtyDraft\(draftRef\.current\)\|\|uncertainRef\.current\)/);
  assert.match(app,/function setDraft\(value\)\{fillEpoch\.current\+\+;draftRef\.current=value;/);
  assert.match(host,/nativeUI\?\.kind==='bookmark'&&bookmarkNavigation\?\.canBack&&bookmarkNavigationBack/);
  assert.match(host,/if\(toolSaving\)\{notice\('书签正在保存/);
  assert.match(host,/bookmarkNavigationBack\(\);return;/);
  assert.match(host,/bookmarkNavigation=null;bookmarkNavigationBack=null/);
  assert.match(host,/typeof state\?\.back==='function'/);
  assert.match(entry,/onStateChange=\{bookmarkPilot\.onStateChange\}/);
  assert.doesNotMatch(app,/history\.back\(/);
});

test('signed fixed React source pin and old sandbox separation remain enforced',async()=>{
  const [provenance,host,react]=await Promise.all([
    read('scripts/bundle-provenance.mjs'),read('src/ui/sidebar-tools.js'),
    read('src/ui/react/main.tsx')
  ]);
  assert.match(provenance,/compiledBookmarkReactInputs=Object\.freeze/);
  assert.match(provenance,/bookmark-manager\/src\/react\/navigation\.js/);
  assert.match(provenance,/reviewedCompiledBookmarkReact\(chunk\.fileName,path,root\)/);
  assert.match(host,/admittedNativeBookmark\(tool,frameRevocationEpoch\)\.then\(admitted=>/);
  assert.match(host,/if\(!admitted\)\{\s*mountTool\(tool,\{forceSandbox:true\}\)/);
  assert.match(react,/import BookmarkReactApp from/);
});
