import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bookmarkEditorNavigation} from '../../examples/sidebar-tools/bookmark-manager/src/react/navigation.js';
import {formatSidebarToolTitle} from '../../src/ui/sidebar-tools/title-path.js';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('real Bookmark editor pages publish a unique child title; previews remain local',()=>{
  const cases=[
    [null,{page:'home',title:'书签管理',canBack:false}],
    [{mode:'create',kind:'bookmark'},{page:'create',title:'新建书签',canBack:true}],
    [{mode:'create',kind:'folder'},{page:'create',title:'新建文件夹',canBack:true}],
    [{mode:'edit',kind:'bookmark'},{page:'edit',title:'编辑书签',canBack:true}],
    [{mode:'edit',kind:'folder'},{page:'edit',title:'编辑文件夹',canBack:true}],
    [{mode:'delete',kind:'bookmark'},{page:'home',title:'书签管理',canBack:false}],
    [{mode:'edit',kind:'unknown'},{page:'home',title:'书签管理',canBack:false}]
  ];
  for(const [draft,expected] of cases){
    const nav=bookmarkEditorNavigation(draft);
    assert.deepEqual(nav,expected);
    assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:nav.title,
      isHome:nav.page==='home'}),nav.canBack?'书签管理 / '+nav.title:'书签管理');
  }
});

test('Host Back delegates to existing guarded editor close, not a second navigation stack',async()=>{
  const [host,app,react,nav]=await Promise.all([
    read('src/ui/sidebar-tools.js'),
    read('examples/sidebar-tools/bookmark-manager/src/react/App.jsx'),
    read('src/ui/react/main.tsx'),
    read('examples/sidebar-tools/bookmark-manager/src/react/navigation.js')
  ]);
  assert.match(react,/onStateChange=\{bookmarkPilot\.onStateChange\}/);
  assert.match(app,/navigation:bookmarkEditorNavigation\(draft\)/);
  assert.match(app,/back:draft\?\(\)=>requestCloseSheet\(\):null/);
  assert.match(nav,/if\(!draft\|\|!/);
  assert.match(host,/nativeUI\?\.kind==='bookmark'&&bookmarkNavigation\?\.canBack&&bookmarkNavigationBack/);
  assert.match(host,/bookmarkNavigationBack\(\);return;/);
  assert.match(host,/typeof state\?\.back==='function'/);
  assert.match(host,/\['新建书签','新建文件夹','编辑书签','编辑文件夹'\]\.includes\(next\.title\)/);
  assert.match(host,/bookmarkNavigation=null;bookmarkNavigationBack=null/);
  assert.match(host,/admittedNativeBookmark\(tool,frameRevocationEpoch\)/);
  assert.match(app,/if\(dirtyDraft\(draftRef\.current\)\|\|uncertainRef\.current\)/);
  assert.match(app,/function setDraft\(value\)\{fillEpoch\.current\+\+;draftRef\.current=value;/);
  assert.match(app,/if\(busyRef\.current\)return;/);
});

test('trusted settings retains precedence and original package remains unchanged',async()=>{
  const [host,meta,pkg]=await Promise.all([
    read('src/ui/sidebar-tools.js'),
    read('examples/sidebar-tools/bookmark-manager/tool.config.json'),
    read('examples/sidebar-tools/bookmark-manager/bookmark-manager.opendesk-tool.json')
  ]);
  assert.match(host,/isSettings:tocSettingsOpen/);
  assert.match(host,/if\(tocSettingsOpen\)\{closePromptSettings\(\)/);
  assert.match(host,/if\(active\.id===TRUSTED_BOOKMARK_ID&&nativeUI\?\.kind==='bookmark'\)/);
  assert.equal(JSON.parse(meta).version,'0.3.11');
  assert.equal(JSON.parse(pkg).version,'0.3.11');
});
