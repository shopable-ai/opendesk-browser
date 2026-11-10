import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {createSidebarTabMemory,isRestorableSidebarTab,SIDEBAR_LAST_TAB_KEY as KEY}
  from '../../src/ui/sidebar-tab-memory.js';

const idle=()=>new Promise(resolve=>setImmediate(resolve));
function storage(initial={}){
  const state={...initial},writes=[];
  return {
    state,writes,
    async get(key){return {[key]:state[key]};},
    async set(update){writes.push(update);Object.assign(state,update);}
  };
}
function fixture({store=storage(),debugEnabled=false}={}){
  let selected='tasks';
  const activations=[],errors=[];
  const memory=createSidebarTabMemory({
    storage:store,debugEnabled,
    getActiveTab:()=>selected,
    selectTab:view=>{activations.push(view);selected=view;memory.record(view);},
    onError:error=>errors.push(error)
  });
  memory.record('tasks',{initial:true});
  return {store,memory,activations,errors,get selected(){return selected;},
    select(view){selected=view;memory.record(view);}};
}

test('Side Panel restores each previously selected product tab after reopening',async()=>{
  for(const view of ['tasks','tools','workflow','develop','cloud']){
    const f=fixture({store:storage({[KEY]:view})});
    await f.memory.restore();
    assert.equal(f.selected,view);
    f.memory.dispose();
  }
});

test('a user selection is persisted across new Side Panel documents and extension restarts',async()=>{
  const shared=storage();
  const first=fixture({store:shared});
  await first.memory.restore();
  first.select('develop');
  await idle();
  assert.equal(shared.state[KEY],'develop');
  first.memory.dispose();
  const second=fixture({store:shared});
  await second.memory.restore();
  assert.equal(second.selected,'develop');
  second.memory.dispose();
});

test('rapid switches are serialized; a slow earlier save cannot overwrite a later tab',async()=>{
  const shared=storage(),originalSet=shared.set.bind(shared);
  let release;
  shared.set=async update=>{
    if(update[KEY]==='workflow')await new Promise(resolve=>{release=resolve;});
    await originalSet(update);
  };
  const f=fixture({store:shared});
  await f.memory.restore();
  f.select('workflow');
  f.select('tools');
  await idle();
  assert.equal(typeof release,'function');
  release();
  await idle();
  assert.equal(shared.state[KEY],'tools');
  assert.deepEqual(shared.writes.map(row=>row[KEY]),['workflow','tools']);
  f.memory.dispose();
});

test('clicking while storage is loading wins over the old persisted selection',async()=>{
  const shared=storage({[KEY]:'develop'});
  let finishRead;
  shared.get=()=>new Promise(resolve=>{finishRead=resolve;});
  const f=fixture({store:shared});
  const pending=f.memory.restore();
  f.select('tools');
  finishRead({[KEY]:'develop'});
  await pending;
  await idle();
  assert.equal(f.selected,'tools');
  assert.equal(shared.state[KEY],'tools');
  assert.deepEqual(f.activations,[]);
  f.memory.dispose();
});

test('navigation before Side Panel surface detection is remembered, not overwritten',async()=>{
  const shared=storage({[KEY]:'workflow'});
  const f=fixture({store:shared});
  f.select('tools');
  await f.memory.restore();
  await idle();
  assert.equal(f.selected,'tools');
  assert.equal(shared.state[KEY],'tools');
  f.memory.dispose();
});

test('full-size catalog and standalone tool pages never write Side Panel preference',async()=>{
  const shared=storage({[KEY]:'tools'});
  const fullTab=fixture({store:shared});
  fullTab.select('develop');
  fullTab.select('catalog');
  await idle();
  assert.equal(shared.state[KEY],'tools');
  assert.equal(shared.writes.length,0);
  fullTab.memory.dispose();
});

test('untrusted and unsupported stored values cannot become navigable pages',async()=>{
  for(const bad of ['catalog','app-debug','missing','__proto__','<script>','debug',null,42,{view:'tools'}]){
    const f=fixture({store:storage({[KEY]:bad})});
    await f.memory.restore();
    assert.equal(f.selected,'tasks');
    assert.deepEqual(f.activations,[]);
    f.memory.dispose();
  }
  assert.equal(isRestorableSidebarTab('debug'),false);
  assert.equal(isRestorableSidebarTab('debug',{debugEnabled:true}),true);
});

test('development can remember Debug, while production cannot reopen a hidden Debug page',async()=>{
  const shared=storage({[KEY]:'debug'});
  const development=fixture({store:shared,debugEnabled:true});
  await development.memory.restore();
  assert.equal(development.selected,'debug');
  development.memory.dispose();
  const production=fixture({store:shared});
  await production.memory.restore();
  assert.equal(production.selected,'tasks');
  production.memory.dispose();
});

test('a disposed panel does not apply a late storage result or persist a late click',async()=>{
  let finishRead;
  const shared=storage({[KEY]:'tools'});
  shared.get=()=>new Promise(resolve=>{finishRead=resolve;});
  const f=fixture({store:shared});
  const pending=f.memory.restore();
  f.memory.dispose();
  finishRead({[KEY]:'tools'});
  await pending;
  f.select('discover');
  await idle();
  assert.equal(f.selected,'discover');
  assert.deepEqual(f.activations,[]);
  assert.equal(shared.writes.length,0);
});

test('storage failure leaves navigation usable and emits diagnostic warning',async()=>{
  const errors=[];
  let selected='tasks';
  const memory=createSidebarTabMemory({
    storage:{async get(){throw new Error('read denied');},async set(){throw new Error('write denied');}},
    getActiveTab:()=>selected,selectTab:view=>{selected=view;},
    onError:error=>errors.push(error.message)
  });
  await memory.restore();
  selected='workflow';
  memory.record('workflow');
  await idle();
  assert.equal(selected,'workflow');
  assert.deepEqual(errors,['read denied','write denied']);
  memory.dispose();
});

test('the real shell only restores the Side Panel and ignores navigation rejected by the tool guard',async()=>{
  const [shell,work]=await Promise.all([
    readFile('src/ui/tool-shell.js','utf8'),readFile('src/ui/task-workbench.js','utf8')
  ]);
  assert.match(shell,/const actualSidePanel=await isActualSidePanelContext\(\{api:chrome,href:hostUrl\.href\}\)/);
  assert.match(shell,/if\(actualSidePanel\|\|!tab\?\.id\)\{[\s\S]*?tabMemory\.restore\(\)/);
  assert.match(shell,/onTabSelected:\(view,options\)=>tabMemory\.record\(view,options\)/);
  const navigateStart=work.indexOf('function navigate(name,{initial=false}={})');
  const veto=work.indexOf("if(toolsViewListener?.((name==='tools'||name==='app-debug')&&!catalogSurface,name)===false)return false;",navigateStart);
  const recorded=work.indexOf('onTabSelected?.(name,{initial});',navigateStart);
  assert.ok(navigateStart>=0 && veto>navigateStart && recorded>veto);
  assert.match(work,/navigate\('tasks',\{initial:true\}\);update\(\)/);
  assert.match(work,/name==='app-debug'&&!isAppDebugAllowed\(\)/);
  assert.match(shell,/onStopAppDebug:\(\)=>void stopPanelDevelopment\(\)/);
});

test('R32 Cloud selection persists and restores through normal Side Panel navigation',async()=>{
  const shared=storage();
  const first=fixture({store:shared});await first.memory.restore();
  first.select('cloud');await idle();
  assert.equal(shared.state[KEY],'cloud');first.memory.dispose();
  const reopened=fixture({store:shared});await reopened.memory.restore();
  assert.equal(reopened.selected,'cloud');
  assert.deepEqual(reopened.activations,['cloud']);reopened.memory.dispose();
});

test('R1.2 Side Panel conceals one tool host for preview and locale management without losing its mount',async()=>{
  const [shell,tools]=await Promise.all([
    readFile('src/ui/tool-shell.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8')
  ]);
  assert.match(shell,/const keepDeveloperPreview=verifiedSidePanel&&Boolean\(panelPreviewId\)&&\s+sidebarTools\.isPreviewActive\(\)/);
  assert.doesNotMatch(shell,/destination==='develop'&&sidebarTools\.isPreviewActive\(\)/);
  const {createSidebarToolsView}=await loadSidebarReact();
  const view=createSidebarToolsView();
  view.patch('sidebar-tool-display',{hidden:false});
  try{
    for(const [activeTab,preview,localeOpen,concealed,listHidden] of [
      ['tools',false,false,false,true],
      ['tools',true,false,true,false],
      ['tools',false,true,true,false],
      ['tools',true,true,true,false],
      ['app-debug',true,false,false,true],
      ['tools',false,false,false,true]
    ]){
      view.patch('sidebar-tool-readonly-banner',{hidden:!preview});
      const $=load(await renderSidebarFixture({activeTab,appDebugEnabled:true,toolView:view,
        extensionProps:{toolbarModel:{localeManager:localeOpen?{session:'test-locale'}:null}}}));
      const context=JSON.stringify({activeTab,preview,localeOpen});
      assert.equal($('.sidebar-tool-host').length,1,'one ToolHost: '+context);
      assert.equal($('.sidebar-tool-host').is('[hidden]'),false,'host remains mounted: '+context);
      assert.equal($('#sidebar-tool-display').is('[hidden]'),concealed,'display visibility: '+context);
      assert.equal($('#sidebar-tool-back').is('[hidden]'),activeTab==='app-debug'&&preview,'debug back action: '+context);
      assert.equal($('#sidebar-tool-list-view').is('[hidden]'),listHidden,'list visibility: '+context);
      assert.equal($('#sidebar-tool-display #sidebar-tool-frame').length,1,'sandbox mount remains: '+context);
      if(activeTab==='tools'&&preview)
        assert.match($('#sidebar-tool-list-view [role=status]').text(),/应用调试正在运行；打开已安装应用前/);
    }
    assert.equal(view.getSnapshot().fields['sidebar-tool-display'].hidden,false,'concealment preserves display state');
  }finally{view.dispose();}
  assert.match(tools,/if\(readOnlyPreview\)\{notice\('本地应用正在调试/);
});
