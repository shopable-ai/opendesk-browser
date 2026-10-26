import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

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
test('shared header is admitted by exact official release, including Clipper legacy pages',async()=>{
 const host=await src('src/ui/sidebar-tools.js'),bridge=await src('src/sidebar-tools/bridge.js');
 assert.ok(host.includes('approvedNavigation=Boolean(release&&await matchesOfficialRelease(release,tool))'));
 assert.match(host,/const hasCurrentNavigation=\(\)=>navigationAllowed&&!readOnlyPreview&&active&&\s*frameRevocationEpoch===\(revocationEpochs\[active.id\]\?\?null\)&&\s*samePackage\(active,toolById\(active.id\)\)/);
 assert.ok(host.includes("const clipNavigation=hasCurrentNavigation()&&active?.id==='web-markdown-clipper'"));
 assert.match(host,/if\(message.kind==='navigation-state'\)\{\s*if\(!hasCurrentNavigation\(\)\)return;/);
 assert.ok(host.includes("if(!hasCurrentNavigation()||!frame?.contentWindow||!instance||active?.id!=='web-markdown-clipper'"));
 assert.ok(host.includes('if(!hasCurrentNavigation()||!toolNavigation||!frame?.contentWindow||!instance)return false;'));
 assert.ok(bridge.includes('navigationAllowed=message.navigationAllowed===true'));
 assert.match(bridge,/navigationAllowed&&\(\['back','primary'\]\.includes\(message.action\)\|\|\s*\(message.action==='secondary'&&currentNavigation\?\.secondary\)\)/);
 assert.ok(bridge.includes('if(disposed||!navigationAllowed)return false;'));
 assert.ok(bridge.includes('...(navigationAllowed?{setNavigation}:{})'));
 assert.ok(!bridge.includes("toolId==='web-markdown-clipper'||navigationAllowed"),'a same-ID manual install never earns shared navigation');
});
test('framework settings title and back label apply to tools with no business router',async()=>{
 const host=await src('src/ui/sidebar-tools.js');
 assert.ok(host.includes("formatSidebarToolHeading(labelOptions)"));
 assert.ok(host.includes("attributes:{\'aria-label\':fullTitle}"));
 assert.ok(host.includes("attributes:{'aria-label':fullTitle}"));
 assert.ok(host.includes("isSettings:tocSettingsOpen"));
 assert.ok(host.includes("const backLabel=tocSettingsOpen?'返回上一页'"));
 assert.ok(host.includes("?'返回上一级':'返回扩展列表'"));
 assert.ok(host.includes("{new:'新建',edit:'编辑',save:'保存'}"));
 assert.ok(host.includes('if(tocSettingsOpen){closePromptSettings();'));
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

test('official installable package exactly embeds current clipper sources and canonical tokens',async()=>{
 const dir='examples/sidebar-tools/web-markdown-clipper/';
 const meta=JSON.parse(await src(dir+'tool.config.json'));
 const pkg=JSON.parse(await src(dir+'web-markdown-clipper.opendesk-tool.json'));
 assert.equal(pkg.version,meta.version);
 assert.equal(pkg.id,meta.id);
 assert.equal(pkg.html,await src(dir+meta.files.html));
 const {compileSharedToolCss}=await import('../../scripts/preview/shared-tool-design.mjs');
 assert.equal(pkg.css,await compileSharedToolCss(await src(dir+meta.files.css)));
 assert.equal(pkg.js,await src(dir+meta.files.js));
 assert.equal(pkg.scripts.length,1);
 assert.equal(pkg.scripts[0].code,await src(dir+meta.files.dependencies[0]));
});
test('preview forwards to the only official React root and embeds source-owned navigation actions',async()=>{
 const outer=await src('examples/sidebar-tools/web-markdown-clipper/preview/index.html');
 const stage=await src('examples/sidebar-tools/web-markdown-clipper/preview/stage.html');
 assert.match(outer,/prototypes\/sidebar\/react-preview\/index.html/);
 assert.doesNotMatch(outer,/demo-tool-head|<iframe/);
 const scripts=[...stage.matchAll(/src="data:text\/javascript;base64,([^"]+)"/g)].map(m=>Buffer.from(m[1],'base64').toString());
 assert.match(scripts[0],/setNavigation\(\{page\}/);
 assert.match(scripts[0],/opendesk-tool-navigation/);
 assert.equal(scripts[1],await src('examples/sidebar-tools/web-markdown-clipper/src/notes.js'));
 assert.equal(scripts[2],await src('examples/sidebar-tools/web-markdown-clipper/src/main.js'));
});

test('navigation business controller exercises real note transitions and guarded draft',async()=>{
 const script=await src('examples/sidebar-tools/web-markdown-clipper/src/notes.js');
 const nodes=Object.create(null),pages=[];
 class FakeNode{
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.hidden=false;
   this.disabled=false;this.dataset={};this.children=[];this.listeners={};this.scrollTop=0;
   this.classList={names:new Set(),add:name=>this.classList.names.add(name)};}
  querySelector(selector){return selector==='.clip'?shell:nodes[selector.slice(1)]??null;}
  matches(selector){return selector==='.clip'&&this===shell;}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
  fire(type,fields={}){for(const fn of this.listeners[type]??[])fn({
   preventDefault(){},stopPropagation(){},...fields});}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  focus(){this.focused=true;}
  remove(){this.removed=true;}
 }
 const shell=new FakeNode('shell'),root=new FakeNode('tool-root');
 const document={scrollingElement:new FakeNode('scroll'),documentElement:new FakeNode('html'),
  createElement:()=>new FakeNode(),createElementNS:()=>new FakeNode(),addEventListener(){}};
 root.ownerDocument=document;
 for(const match of script.matchAll(/q\('([a-z0-9-]+)'\)/g))nodes[match[1]]??=new FakeNode(match[1]);
 nodes['clip-notes'].hidden=true;nodes['clip-home'].hidden=false;
 nodes['clip-kind-filter'].value='all';
 const at='2026-10-21T10:00:00.000Z';
 let items=[{id:'clip-00000001',kind:'note',title:'OpenDesk Browser · Browser Test Lab',
  source:'',body:'# 真正保存的正文\n\n第二段内容',updatedAt:at,createdAt:at}];
 const summary=row=>({id:row.id,title:row.title,kind:row.kind,source:row.source,
  excerpt:row.body.slice(0,180),updatedAt:row.updatedAt,createdAt:row.createdAt});
 const request=async(operation,payload={})=>{
  if(operation==='clipNotes.list')
   return {items:items.map(summary),total:items.length,matched:items.length,
    usedBytes:1024,nextOffset:null,etag:'a'.repeat(64)};
  if(operation==='clipNotes.get'){
   const item=items.find(row=>row.id===payload.id);
   if(!item)throw Object.assign(Error('missing'),{code:'E_NOT_FOUND'});
   return {item:{...item},etag:'a'.repeat(64)};
  }
  if(operation==='clipNotes.save'){
   const item={id:'clip-00000002',kind:'note',body:payload.body,source:'',
    title:payload.body.trim(),updatedAt:at,createdAt:at};
   items=[item,...items];return {id:item.id,duplicate:false};
  }
  throw Error('Unexpected operation: '+operation);
 };
 const context={OpenDeskTool:{root,setState(){},setNavigation:({page})=>pages.push(page)}};
 runInNewContext(script,{globalThis:context,TextEncoder,URL,Date,document});
 context.OpenDeskClipNotes.create({root,request,
  sdk:{clipboard:{writeText:async()=>({copied:true})},downloads:{text:async()=>({started:true})}},
  renderMarkdown:(body,node)=>{node.textContent=body;}});
 const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
 await flush();
 const recent=nodes['clip-recent-list'].children[0];
 assert.ok(recent,'Saved recent card must render');
 assert.equal(recent.children[0].children[0].textContent,'真正保存的正文',
  'Stored test-page title must not replace the actual saved heading');
 assert.ok(shell.classList.names.has('clip-hosted'));
 recent.children[0].fire('click');await flush();
 assert.equal(pages.at(-1),'reader');
 root.fire('opendesk-tool-navigation',{detail:{action:'back'}});await flush();
 assert.equal(pages.at(-1),'home','Reader from recent must return directly home');
 nodes['clip-view-all'].fire('click');await flush();
 assert.equal(pages.at(-1),'library');
 root.fire('opendesk-tool-navigation',{detail:{action:'primary'}});await flush();
 assert.equal(pages.at(-1),'new');
 nodes['clip-note-body'].value='未保存的草稿';nodes['clip-note-body'].fire('input');
 root.fire('opendesk-tool-navigation',{detail:{action:'back'}});await flush();
 assert.equal(nodes['clip-note-unsaved'].hidden,false,'Dirty editor must ask before leaving');
 nodes['clip-note-discard'].fire('click');await flush();
 assert.equal(pages.at(-1),'library');
 root.fire('opendesk-tool-navigation',{detail:{action:'primary'}});
 nodes['clip-note-body'].value='新增便签正文';nodes['clip-note-body'].fire('input');
 root.fire('opendesk-tool-navigation',{detail:{action:'primary'}});
 await flush();
 assert.equal(items.length,2,'New note should be saved and read back');
 assert.equal(pages.at(-1),'library','Save should return to its real entry page');
});
