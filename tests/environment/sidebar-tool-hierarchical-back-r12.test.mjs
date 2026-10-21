import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src=async path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
test('React header exposes one back/context icon and places external-tab inside trusted settings',async()=>{
 const host=await src('src/ui/react/tabs/tool-host.tsx');
 const toolbar=host.split('<div className="sidebar-tool-view-head')[1]?.split('</div>')[0]||'';
 assert.equal((toolbar.match(/id="sidebar-tool-back"/g)||[]).length,1);
 assert.equal((toolbar.match(/id="sidebar-tool-open-tab"/g)||[]).length,0);
 assert.equal((toolbar.match(/id="sidebar-tool-primary-action"/g)||[]).length,1);
 assert.equal((host.match(/id="sidebar-tool-open-tab"/g)||[]).length,1);
});
test('sandbox navigation uses existing instance-gated channel, not DOM or history back',async()=>{
 const host=await src('src/ui/sidebar-tools.js'),bridge=await src('src/sidebar-tools/bridge.js');
 assert.match(host,/message.kind==='navigation-state'/);
 assert.match(host,/sameInstance\(event.source,event.data\?\.instance\)/);
 assert.match(host,/requestClipNavigation\('back'\)/);
 assert.match(host,/clipPage=null/);
 assert.match(bridge,/message.instance===instance&&message.toolId===toolId/);
 assert.match(bridge,/kind:'navigation-state',instance,toolId,page/);
 assert.match(bridge,/opendesk-tool-navigation/);
 assert.doesNotMatch(bridge,/history\.back\(/);
});
test('clipper keeps data store intact and prioritizes saved content/touch actions',async()=>{
 const notes=await src('examples/sidebar-tools/web-markdown-clipper/src/notes.js');
 const css=await src('examples/sidebar-tools/web-markdown-clipper/src/style.css');
 assert.match(notes,/cardCopy\(x\)/);
 assert.match(notes,/open.append\(title,excerpt,meta\)/);
 assert.match(notes,/publishNavigation\(\)/);
 assert.match(notes,/if\(editing\)cancelEditor\(\)/);
 assert.match(notes,/showHome\(\{allowBusy:true\}\)/);
 assert.match(css,/\.clip\.clip-hosted \.clip-notes-head/);
 assert.match(css,/@media\(pointer:coarse\)\{\.clip-note-buttons\{opacity:1;pointer-events:auto\}/);
 const source=await src('examples/sidebar-tools/web-markdown-clipper/trusted/notes-store.js');
 assert.match(source,/sidebarToolStorageKey\(toolId\)/);
});
