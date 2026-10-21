import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const bookmark='examples/sidebar-tools/bookmark-manager/';
const appPath=bookmark+'src/react/App.jsx';

test('R1.4 one trusted Root and one reusable bottom Dock, no new sandbox escalation',async()=>{
 const [host,shell,admission,component]=await Promise.all([
  read('src/ui/react/main.tsx'),read('src/ui/sidebar-tools.js'),
  read('src/ui/trusted-bookmark-admission.js'),
  read('src/ui/react/components/conversation.tsx')]);
 assert.equal((host.match(/createRoot\(/g)||[]).length,1,'one official React Root');
 assert.match(host,/createPortal\(<[\s\S]*?TrustedConversationWorkspace/);
 assert.match(host,/controller=\{bookmarkPilot\.runtime\.conversation\}/);
 assert.match(host,/import conversationDockCSS from '\.\/components\/conversation-dock\.css\?raw'/);
 assert.match(shell,/admittedNativeBookmark\(tool,frameRevocationEpoch\)\.then\(admitted=>/);
 assert.match(shell,/if\(!admitted\)\{\s*mountTool\(tool,\{forceSandbox:true\}\)/);
 assert.match(shell,/frame=doc\.createElement\('iframe'\)/,'sandbox fallback remains');
 assert.match(admission,/matchesOfficialRelease\(release,tool\)/);
 assert.match(admission,/expectedEpoch!==actualEpoch/);
 assert.match(component,/export function TrustedConversationWorkspace/);
 assert.match(host,/const scopedConversation=conversation\?Object\.freeze\(/);
 assert.match(host,/refs:\{folderId:null,bookmarkId:null,matches:\[\]\}/,
  'new mount discards previous executable bookmark references');
 assert.doesNotMatch(component,/BookmarkR2Service|executeBookmarkPlan|\.bookmarks\.|generateStructured\(/,
  'shared dock has no bookmark business/SDK/Provider implementation');
 assert.doesNotMatch(component,/\beval\(|new Function\(|createRoot\(/,'no execution engine/root in dock');
});

test('R1.4 original bookmark workspace and search never disappear with chat',async()=>{
 const [app,css]=await Promise.all([read(appPath),read('src/ui/react/components/conversation-dock.css')]);
 assert.match(app,/<div className="bm-tools">/);
 assert.match(app,/<div className="bm-workspace">/);
 assert.doesNotMatch(app,/hidden=\{chatOpen\}|className="bm-conversation"|id="bm-conversation"/);
 assert.doesNotMatch(app,/label="对话"[\s\S]*aria-controls="opendesk-conversation-dock"/);
 assert.match(await read('src/ui/react/tabs/tool-host.tsx'),/TrustedConversationHeaderSlot/);
 assert.match(await read('src/ui/react/components/conversation.tsx'),/createPortal\(/);
 assert.match(css,/\.od-conversation-business\{min-height:0;min-width:0;flex:1/);
 assert.match(css,/\.od-conversation-dock\{flex:none/);
 assert.match(css,/\.od-conversation-log\{min-height:0;flex:1 1 auto;overflow:auto/);
 assert.match(css,/\.od-conversation-composer\{display:grid/);
 assert.match(css,/--od-brand/);
 assert.match(css,/\.od-conversation-action\{position:absolute/,'Send or Stop stays inside the composer');
 assert.doesNotMatch(css,/\.od-conversation-controls/,'no second action row');
});

test('R1.4 shared separator and edit draft coexistence retain keyboard access and input',async()=>{
 const [app,component,css]=await Promise.all([read(appPath),
  read('src/ui/react/components/conversation.tsx'),read(bookmark+'src/react/style.css')]);
 assert.match(component,/role="separator" tabIndex=\{0\}/);
 assert.match(component,/aria-valuemin=\{limits\.min\} aria-valuemax=\{limits\.max\}/);
 assert.match(component,/e\.key==='ArrowUp'/);
 assert.match(component,/e\.key==='ArrowDown'/);
 assert.match(component,/e\.key==='Home'/);
 assert.match(component,/e\.key==='End'/);
 assert.match(component,/onPointerDown=\{separatorDown\}/);
 assert.match(component,/e\.nativeEvent\.isComposing/);
 assert.match(component,/e\.key==='Enter'&&!e\.shiftKey&&!e\.nativeEvent\.isComposing/);
 assert.match(component,/aria-label="收起对话"/);
 assert.match(component,/showSpeaker=\{false\}/,'shared transcript removes redundant visible speaker labels');
 assert.doesNotMatch(component,/od-conversation-samples|od-conversation-source/);
 assert.match(component,/controller\?\.saveSession/);
 assert.match(app,/hasDock=\{Boolean\(dock\)\}/);
 assert.match(app,/aria-modal=\{!hasDock\}/);
 assert.match(css,/\.bm-sheet-backdrop\[data-sharing="true"\]\{position:absolute;inset:0\}/);
 assert.doesNotMatch(app,/if\(draft\)\{setError\('请先完成或取消当前书签编辑/);
});

test('R1.4 Send pins bookmark IDs; writing blocks conflicting draft and follows verified steps',async()=>{
 const [app,actions,component]=await Promise.all([
  read(appPath),read('src/ui/conversation/bookmark-actions.js'),
  read('src/ui/react/components/conversation.tsx')]);
 assert.match(app,/const pinned=\{selectedId,currentFolderId:pinnedFolder,refs:/);
 assert.match(app,/bookmarkConversationContext\(tree,pinned\)/);
 assert.match(app,/conversation\.request\(\{request,context:publicContext,signal,event\}\)/);
 assert.match(app,/if\(willWrite&&\(draftRef\.current\|\|uncertainRef\.current\|\|busyRef\.current\)\)/);
 assert.match(app,/executeBookmarkPlan\(\{plan:proposal,service,/);
 assert.match(app,/signal:authorization\?\.signal\|\|signal,beforeWrite:authorization\?\.assertWrite/);
 assert.match(app,/if\(step\.tree\)setTree\(step\.tree\)/);
 assert.match(app,/onStep\?\.\(\{message:step\.message,refs:step\.refs\}\)/);
 assert.match(actions,/nextRefs\.folderId=found\.id/);
 assert.match(actions,/tree=await service\.load\(\)/);
 assert.match(actions,/if\(!found\|\|nodeFolder\(found\)/);
 assert.match(component,/onPhase:phase=>\{phaseRef\.current=phase;\}/);
 assert.match(component,/if\(unknown\)setNeedsReview\(true\)/);
 assert.match(component,/if\(!unknown&&!ex\?\.partial\?\.length/);
 assert.match(component,/controller\?\.cancel\?\.\(\)/);
});

test('R1.4 preview reuses production App and shared Dock and labels Mock honestly',async()=>{
 const [preview,builder,main]=await Promise.all([
  read(bookmark+'preview/react/src/main.jsx'),
  read(bookmark+'preview/react/build-preview.mjs'),
  read('src/ui/react/main.tsx')]);
 assert.match(preview,/from '\.\.\/\.\.\/\.\.\/src\/react\/App\.jsx'/);
 assert.match(preview,/TrustedConversationWorkspace controller=\{conversation\} headerTarget=\{headerTarget\}/);
 assert.match(preview,/<App runtime=\{\{conversation\}\} mode="preview" dock=\{dock\}\/>/);
 assert.match(preview,/offline/);
 assert.match(preview,/离线演示（非真实 AI）/);
 assert.match(builder,/join\(root,'src\/ui\/react\/components\/conversation-dock\.css'\)/);
 assert.match(main,/mode="trusted" runtime=\{bookmarkPilot\.runtime\}/);
});
