import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
class Node {
  constructor(id=''){this.id=id;this.tagName=String(id).toUpperCase();this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.dataset={};this.events={};this.children=[];}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  async fire(name){await Promise.all((this.events[name]||[]).map(fn=>fn()));}
  setAttribute(key,value){this[key]=value;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  focus(){this.focused=true;}
  select(){this.selected=true;}
}
function mounted({request=async()=>({}),clipboard=async()=>({copied:true}),download=async()=>({started:true}),
  launch=async()=>{throw Error('E_LAUNCH_EXPIRED');},notesFactory=null}={}){
  const ids=['clip-source','clip-preview','clip-status','clip-site','clip-title','clip-meta','clip-fetch',
    'clip-show-source','clip-show-preview','clip-copy','clip-download','clip-home','clip-selection-hint'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  nodes['clip-meta'].value='none';
  const modes=['article','selection','quote','link'].map(name=>{const n=new Node(name);n.dataset.clipMode=name;return n;});
  const root={querySelector:key=>nodes[key.slice(1)],querySelectorAll:()=>modes,events:{},
    addEventListener(name,fn){this.events[name]=fn;}};
  const document={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment')};
  const context={OpenDeskTool:{root,request},OpenDeskSDK:{browser:{
    clipboard:{writeText:clipboard},downloads:{text:download},launch:{consume:launch}}}};
  if(notesFactory)context.OpenDeskClipNotes={create:notesFactory};
  runInNewContext(source,{globalThis:context,document,URL,Date});
  return {nodes,modes,root};
}
test('switching modes invalidates stale extraction without unlocking a newer request',async()=>{
  const first=deferred(),second=deferred();let count=0;
  const {nodes,modes}=mounted({request:()=>++count===1?first.promise:second.promise});
  const original=nodes['clip-fetch'].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,true);
  await modes[1].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,false,'new mode should allow a new request');
  const next=nodes['clip-fetch'].fire('click');
  assert.equal(nodes['clip-fetch'].disabled,true);
  first.resolve({markdown:'OLD',source:'https://example.com',title:'Old',site:'A'});
  await original;
  assert.equal(nodes['clip-fetch'].disabled,true,'old completion must not unlock current fetch');
  assert.equal(nodes['clip-source'].value,'');
  second.resolve({markdown:'NEW',source:'https://example.com',title:'New',site:'A'});
  await next;
  assert.equal(nodes['clip-fetch'].disabled,false);
  assert.equal(nodes['clip-source'].value,'NEW');
});
test('same mode is a no-op; switching to empty selection does not leak article',async()=>{
 let calls=0;
 const {nodes,modes}=mounted({request:async()=>{calls++;return {
  markdown:'# 全文\n',source:'https://example.com/a',title:'文章',site:'example.com'
 };}});
 await nodes['clip-fetch'].fire('click');
 const original=nodes['clip-source'].value;
 await modes[0].fire('click');await modes[0].fire('click');
 assert.equal(nodes['clip-source'].value,original);assert.equal(calls,1);
 await modes[1].fire('click');
 assert.equal(nodes['clip-source'].value,'');
 assert.equal(nodes['clip-copy'].disabled,true);
 assert.equal(nodes['clip-download'].disabled,true);
 assert.equal(nodes['clip-home'].dataset.clipState,'empty');
 assert.match(nodes['clip-preview'].children[0].textContent,/选中文字/);
 await modes[0].fire('click');
 assert.equal(nodes['clip-source'].value,original);assert.equal(calls,1);
});
test('selection and quote reuse one Host extract; article and safe link restore without reads',async()=>{
 const operations=[];
 const {nodes,modes}=mounted({request:async op=>{
  operations.push(op);
  return {markdown:op==='clip.article'?'FULL ARTICLE\n':'SELECTION ONLY\n',
   source:'https://example.com/a',title:'来源标题',site:'example.com',mode:op};
 }});
 await nodes['clip-fetch'].fire('click');await modes[1].fire('click');
 assert.equal(nodes['clip-source'].value,'');
 await nodes['clip-fetch'].fire('click');
 await modes[2].fire('click');
 assert.equal(nodes['clip-source'].value,'> SELECTION ONLY\n');
 await modes[1].fire('click');
 assert.equal(nodes['clip-source'].value,'SELECTION ONLY\n');
 await modes[0].fire('click');
 assert.equal(nodes['clip-source'].value,'FULL ARTICLE\n');
 await modes[3].fire('click');
 assert.equal(nodes['clip-source'].value,'[来源标题](https://example.com/a)\n');
 assert.equal(operations.join(','),'clip.article,clip.selection');
});
test('raw text, footer, YAML and no metadata share exact save/copy/download snapshot',async()=>{
 let saved=null,copied='',downloaded='';
 const {nodes}=mounted({
  notesFactory:()=>({setClip:v=>{saved=v;}}),
  request:async op=>op==='currentPage.info'?{status:'unavailable'}:{
   markdown:'## 正文\n\n含中文和 Unicode。\n',source:'https://example.com/a',
   title:'文章',site:'example.com',capturedAt:'2026-10-21T00:00:00Z'},
  clipboard:async value=>{copied=value;return {copied:true};},
  download:async data=>{downloaded=data.text;return {started:true};}
 });
 await nodes['clip-fetch'].fire('click');
 for(const style of ['footer','yaml','none','footer','yaml']){
  nodes['clip-meta'].value=style;await nodes['clip-meta'].fire('change');
  const body=nodes['clip-source'].value;
  await nodes['clip-show-preview'].fire('click');
  await nodes['clip-copy'].fire('click');await nodes['clip-download'].fire('click');
  assert.equal(saved.body,body);assert.equal(copied,body);assert.equal(downloaded,body);
  assert.equal((body.match(/来源：/g)||[]).length,style==='footer'?1:0);
  assert.equal((body.match(/^---$/gm)||[]).length,style==='yaml'?2:0);
 }
});
test('150 KB Unicode with code fence survives source and preview without truncation',async()=>{
 const fence=String.fromCharCode(96).repeat(3);
 const raw='中'.repeat(49000)+'\n'+fence+'js\nconsole.log("中文");\n'+fence+'\n';
 const {nodes}=mounted({request:async()=>({
  markdown:raw,source:'https://example.com/code',title:'代码',site:'example.com'
 })});
 nodes['clip-meta'].value='yaml';
 await nodes['clip-fetch'].fire('click');
 const expected=nodes['clip-source'].value;
 assert.ok(expected.length>49000);
 assert.ok(expected.startsWith('---\ntitle:'));
 assert.ok(expected.includes('console.log("中文");'));
 await nodes['clip-show-source'].fire('click');
 assert.equal(nodes['clip-source'].value,expected);
 await nodes['clip-show-preview'].fire('click');
 assert.equal(nodes['clip-source'].value,expected);
});


test('overlapping same-mode Host requests accept only the newest reply',async()=>{
 const first=deferred(),second=deferred();let n=0;
 const {nodes}=mounted({request:()=>++n===1?first.promise:second.promise});
 const older=nodes['clip-fetch'].fire('click');
 const newer=nodes['clip-fetch'].fire('click');
 second.resolve({markdown:'NEW',source:'https://example.com/a',title:'新',site:'example.com'});
 await newer;
 first.resolve({markdown:'OLD',source:'https://example.com/a',title:'旧',site:'example.com'});
 await older;
 assert.equal(nodes['clip-source'].value,'NEW');
 assert.equal(nodes['clip-fetch'].disabled,false);
});
test('save operation freezes mode and actions until Host confirms it',async()=>{
 let setBusy,clip;
 const {nodes,modes}=mounted({
  notesFactory:args=>{setBusy=args.onSaveBusy;return {setClip:v=>{clip=v;}};},
  request:async op=>op==='currentPage.info'?{status:'unavailable'}:
   {markdown:'要保存的内容',source:'https://example.com/a',title:'文章',site:'example.com'}
 });
 await nodes['clip-fetch'].fire('click');
 const before=clip.body;
 setBusy(true);await modes[1].fire('click');
 assert.equal(clip.body,before);
 assert.equal(nodes['clip-meta'].disabled,true);
 assert.ok(modes.every(item=>item.disabled));
 assert.equal(nodes['clip-copy'].disabled,true);
 assert.equal(nodes['clip-download'].disabled,true);
 setBusy(false);
 assert.ok(modes.every(item=>!item.disabled));
});
test('navigation clears all four mode results and rejects a late article reply',async()=>{
 const slow=deferred();let reads=0;
 const {nodes,modes,root}=mounted({request:op=>op==='clip.article'?
  ++reads===1?Promise.resolve({markdown:'文章旧内容',source:'https://old.example/a',title:'旧',site:'old.example'}):slow.promise:
  Promise.resolve({markdown:'选区旧内容',source:'https://old.example/a',title:'旧',site:'old.example'})});
 await nodes['clip-fetch'].fire('click');
 await modes[1].fire('click');await nodes['clip-fetch'].fire('click');
 await modes[0].fire('click');
 assert.equal(nodes['clip-source'].value,'文章旧内容');
 const reading=nodes['clip-fetch'].fire('click');
 root.events['opendesk-page-changed']();
 slow.resolve({markdown:'迟到正文',source:'https://old.example/a',title:'旧',site:'old.example'});
 await reading;
 for(const button of modes){
  await button.fire('click');
  assert.equal(nodes['clip-source'].value,'');
  assert.equal(nodes['clip-copy'].disabled,true);
 }
});
test('right-click launch cannot attach old selection to a different page context',async()=>{
 let draft=null;
 mounted({
  notesFactory:()=>({setClip:v=>{draft=v;}}),
  request:async op=>op==='currentPage.info'?
   {status:'available',url:'https://new.example/a',title:'新网页'}:{},
  launch:async()=>({toolId:'web-markdown-clipper',actionId:'save-selection',
   selection:'旧页面私密选区',source:{url:'https://old.example/a'},
   expiresAt:Date.now()+60000})
 });
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(draft,null);
});
test('returned Host result from another page is rejected instead of cached',async()=>{
 let current=null;
 const {nodes}=mounted({
  notesFactory:()=>({setClip:v=>{current=v;}}),
  request:async op=>op==='currentPage.info'?
   {status:'available',url:'https://expected.example/a',title:'预期网页'}:
   {markdown:'恶意串页内容',source:'https://different.example/a',title:'其他网页',site:'different.example'}
 });
 await Promise.resolve();await Promise.resolve();
 await nodes['clip-fetch'].fire('click');
 assert.equal(nodes['clip-source'].value,'');
 assert.equal(current,null);
 assert.match(nodes['clip-status'].textContent,/网页已变化/);
});

test('copy/download use accepted Markdown and strip unsafe leading-dot filename',async()=>{
  let copied='',downloaded;
  const {nodes}=mounted({
    request:async()=>({markdown:'# text\n',source:'https://example.com',title:'... unsafe/name',site:'A'}),
    clipboard:async text=>{copied=text;return {copied:true};},
    download:async data=>{downloaded=data;return {started:true};}
  });
  await nodes['clip-fetch'].fire('click');
  await nodes['clip-copy'].fire('click');
  assert.equal(copied,'# text\n');
  await nodes['clip-download'].fire('click');
  assert.equal(downloaded.text,copied);
  assert.equal(downloaded.filename.startsWith('.'),false);
  assert.match(downloaded.filename,/\.md$/);
});
test('changing pages clears cached Markdown before subsequent copy',async()=>{
  let copied=false;
  const {nodes,root}=mounted({
    request:async()=>({markdown:'SENSITIVE',source:'https://example.com',title:'A',site:'A'}),
    clipboard:async()=>{copied=true;return {copied:true};}
  });
  await nodes['clip-fetch'].fire('click');
  root.events['opendesk-page-changed']();
  await nodes['clip-copy'].fire('click');
  assert.equal(copied,false);
  assert.equal(nodes['clip-source'].value,'');
  assert.equal(nodes['clip-status'].dataset.error,'true');
});

test('quote mode folds unsafe multiline titles into one escaped source link',async()=>{
 const {nodes,modes}=mounted({request:async()=>({
  markdown:'正文内容\n',source:'https://example.com/article',title:'复杂 [标题]\n另一行  ',site:'A'
 })});
 nodes['clip-meta'].value='footer';
 await modes[2].fire('click');
 await nodes['clip-fetch'].fire('click');
 assert.equal(nodes['clip-source'].value,
  '> 正文内容\n\n来源：[复杂 \\[标题\\] 另一行](https://example.com/article)\n');
});
test('late clipboard and download replies cannot override navigation or mode changes',async()=>{
 const copy=deferred(),download=deferred();
 let copyPayload='',downloadPayload='';
 const {nodes,modes,root}=mounted({
  request:async()=>({markdown:'# 正文\n',source:'https://example.com/a',title:'现在',site:'A'}),
  clipboard:text=>{copyPayload=text;return copy.promise;},
  download:data=>{downloadPayload=data.text;return download.promise;}
 });
 await nodes['clip-fetch'].fire('click');
 const copying=nodes['clip-copy'].fire('click');
 root.events['opendesk-page-changed']();
 copy.resolve({copied:true});
 await copying;
 assert.equal(copyPayload,'# 正文\n');
 assert.equal(nodes['clip-status'].textContent,'网页已变化，请重新剪藏');
 assert.equal(nodes['clip-source'].value,'');
 await nodes['clip-fetch'].fire('click');
 const downloading=nodes['clip-download'].fire('click');
 await modes[3].fire('click');
 download.resolve({started:true});
 await downloading;
 assert.equal(downloadPayload,'# 正文\n');
 assert.match(nodes['clip-status'].textContent,/已恢复本页链接/);
 assert.equal(nodes['clip-source'].value,'[现在](https://example.com/a)\n');
});

test('starting another extraction immediately clears stale Markdown and source site',async()=>{
 const next=deferred();let calls=0,copies=0;
 const {nodes}=mounted({
  request:()=>++calls===1?Promise.resolve({markdown:'旧内容',source:'https://old.example/a',title:'旧',site:'old.example'}):next.promise,
  clipboard:async()=>{copies++;return {copied:true};}
 });
 await nodes['clip-fetch'].fire('click');
 assert.equal(nodes['clip-site'].textContent,'old.example');
 const fetching=nodes['clip-fetch'].fire('click');
 assert.equal(nodes['clip-source'].value,'','old content must disappear before new read finishes');
 assert.equal(nodes['clip-site'].textContent,'当前网页','old origin must disappear');
 await nodes['clip-copy'].fire('click');
 assert.equal(copies,0,'stale content must not be exportable');
 next.resolve({markdown:'新内容',source:'https://old.example/a',title:'新',site:'old.example'});
 await fetching;
 assert.equal(nodes['clip-source'].value,'新内容');
 assert.equal(nodes['clip-site'].textContent,'old.example');
});
test('trusted export remains single-flight even if users repeat copy or download clicks',async()=>{
 const copy=deferred(),download=deferred();let copyCalls=0,downloadCalls=0;
 const {nodes}=mounted({
  request:async()=>({markdown:'# 内容',source:'https://example.com',title:'文章',site:'example.com'}),
  clipboard:()=>{copyCalls++;return copy.promise;},
  download:()=>{downloadCalls++;return download.promise;}
 });
 await nodes['clip-fetch'].fire('click');
 const copying=nodes['clip-copy'].fire('click');
 assert.equal(nodes['clip-copy'].disabled,true);
 assert.equal(nodes['clip-download'].disabled,true);
 await nodes['clip-copy'].fire('click');
 await nodes['clip-download'].fire('click');
 assert.equal(copyCalls,1);
 assert.equal(downloadCalls,0);
 copy.resolve({copied:true});await copying;
 assert.equal(nodes['clip-copy'].disabled,false);
 assert.equal(nodes['clip-download'].disabled,false);
 const downloading=nodes['clip-download'].fire('click');
 await nodes['clip-download'].fire('click');
 await nodes['clip-copy'].fire('click');
 assert.equal(downloadCalls,1);
 assert.equal(copyCalls,1);
 download.resolve({started:true});await downloading;
 assert.equal(nodes['clip-download'].disabled,false);
 assert.equal(nodes['clip-status'].textContent,'已请求下载，请在 Chrome 确认保存');
});
test('cancelled and uncertain exports never pretend to have succeeded or failed definitively',async()=>{
 let copyCode='E_CANCELLED',downloadCode='E_CANCELLED';
 const typedError=code=>Object.assign(new Error(code),{code});
 const {nodes}=mounted({
  request:async()=>({markdown:'中文内容',source:'https://example.com',title:'安全',site:'example.com'}),
  clipboard:async()=>{throw typedError(copyCode);},
  download:async()=>{throw typedError(downloadCode);}
 });
 await nodes['clip-fetch'].fire('click');
 await nodes['clip-copy'].fire('click');
 assert.equal(nodes['clip-status'].textContent,'已取消复制');
 assert.equal(nodes['clip-status'].dataset.error,'false');
 assert.equal(nodes['clip-source'].selected,undefined,'cancel must not automatically offer a manual copy');
 copyCode='E_OUTCOME_UNKNOWN';await nodes['clip-copy'].fire('click');
 assert.match(nodes['clip-status'].textContent,/复制结果未知/);
 assert.equal(nodes['clip-source'].selected,undefined,'unknown result must not falsely claim a copy failure');
 await nodes['clip-download'].fire('click');
 assert.equal(nodes['clip-status'].textContent,'已取消下载');
 assert.equal(nodes['clip-status'].dataset.error,'false');
 downloadCode='E_OUTCOME_UNKNOWN';await nodes['clip-download'].fire('click');
 assert.match(nodes['clip-status'].textContent,/下载结果未知/);
 copyCode='E_DENIED';await nodes['clip-copy'].fire('click');
 assert.equal(nodes['clip-source'].selected,true,'known copy failure retains manual fallback');
});

function previewTags(node,found=[]){
 if(node?.tagName)found.push(node);
 for(const child of node?.children||[])previewTags(child,found);
 return found;
}
test('right-click Markdown reaches source, nested semantic preview and save draft',async()=>{
 let draft=null;
 const markdown='## Selected heading\n\n3. Ordered\n   - Nested\n4. Next\n';
 const {nodes}=mounted({notesFactory:()=>({setClip:value=>{draft=value;}}),
  launch:async()=>({toolId:'web-markdown-clipper',actionId:'save-selection',
   selection:'Selected heading Ordered Nested Next',selectionMarkdown:markdown,
   source:{url:'https://example.com/post'},expiresAt:Date.now()+60000})});
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(nodes['clip-source'].value,markdown);
 assert.equal(draft.body,markdown);
 const tags=previewTags(nodes['clip-preview']);
 assert.equal(tags.find(n=>n.tagName==='H2').children[0].textContent,'Selected heading');
 const ol=tags.find(n=>n.tagName==='OL');
 assert.equal(ol.start,'3');assert.equal(ol.children.length,2);
 const nested=ol.children[0].children.find(n=>n.tagName==='UL');
 assert.ok(nested,'nested list belongs to the parent list item');
 assert.equal(nested.children[0].children[0].textContent,'Nested');
 assert.match(nodes['clip-status'].textContent,/选区及格式/);
});
test('formal read-only preview renders Markdown structure without injecting webpage HTML',async()=>{
 const fence=String.fromCharCode(96).repeat(3);
 const sample=[
  '# 中文标题','','含 **粗体** 与 [安全链接](https://example.com/a)',
  '', '- 第一项','- 第二项','',fence+'js',
  'const value = 42;',fence,
  '', '| 名称 | 值 |','| --- | --- |','| 甲 | 乙 |',
  '', '> 引用文本','','<script>window.pwned = true</script>',
  '', '[不安全链接](javascript:alert)'
 ].join('\n');
 const {nodes}=mounted({request:async()=>({markdown:sample,source:'https://example.com/a',title:'中文标题',site:'example.com'})});
 await nodes['clip-fetch'].fire('click');
 await nodes['clip-show-preview'].fire('click');
 assert.equal(nodes['clip-preview'].hidden,false);
 const all=previewTags(nodes['clip-preview']);
 const tag=name=>all.filter(node=>node.tagName===name);
 for(const name of ['H1','STRONG','A','UL','LI','PRE','CODE','TABLE','THEAD','TBODY','BLOCKQUOTE']){
  assert.ok(tag(name).length,name+' should render as its semantic element');
 }
 assert.equal(tag('A').length,1,'javascript: links must not be actionable');
 assert.equal(tag('SCRIPT').length,0,'untrusted text must not become executable HTML');
 assert.equal(tag('IMG').length,0,'preview must not fetch external images');
 assert.equal(tag('A')[0].href,'https://example.com/a');
 assert.equal(tag('A')[0].rel,'noopener noreferrer');
});
test('YAML source metadata stays text and cannot become DOM injection',async()=>{
 const {nodes}=mounted({request:async()=>({
  markdown:'# 正文\n',source:'https://example.com/a',
  title:'"<script>alert(1)</script>"',site:'example.com',capturedAt:'2026-10-20T00:00:00Z'
 })});
 nodes['clip-meta'].value='yaml';
 await nodes['clip-fetch'].fire('click');
 const elements=previewTags(nodes['clip-preview']);
 assert.ok(elements.some(e=>e.tagName==='PRE'));
 assert.equal(elements.filter(e=>e.tagName==='SCRIPT').length,0);
 assert.match(nodes['clip-source'].value,/^---\ntitle:/);
});

test('offline preview must embed the exact formal HTML and reuse official JS and CSS',async()=>{
 const [html,stage,wrapper]=await Promise.all([
  readFile(new URL('../src/index.html',import.meta.url),'utf8'),
  readFile(new URL('../preview/stage.html',import.meta.url),'utf8'),
  readFile(new URL('../preview/index.html',import.meta.url),'utf8')
 ]);
 assert.ok(stage.includes('\n'+html+'\n'),'stage must embed the exact official UI, not a redesigned copy');
 const scripts=[...stage.matchAll(/src="data:text\/javascript;base64,([^"]+)"/g)].map(m=>Buffer.from(m[1],'base64').toString());
 assert.equal(scripts[1],await readFile(new URL('../src/notes.js',import.meta.url),'utf8'));
 assert.equal(scripts[2],source);
 const {compileSharedToolCss}=await import('../../../../scripts/preview/shared-tool-design.mjs');
 const css=await compileSharedToolCss(await readFile(new URL('../src/style.css',import.meta.url),'utf8'));
 assert.ok(stage.includes('<style>'+css+'</style>'));
 assert.match(wrapper,/prototypes\/sidebar\/react-preview\/index.html/);
 assert.match(wrapper,/非真实设备结果/);
 assert.match(scripts[0],/模拟复制（未写入系统剪贴板）/);
 assert.match(scripts[0],/模拟下载（未创建磁盘文件）/);
 for(const action of ['quota','failure','unknown'])assert.ok(scripts[0].includes(action),'preview needs '+action);
});

test('one-use right-click selection strips sensitive URL fields and fragments before local save',async()=>{
 let current=null;
 const {nodes}=mounted({
  notesFactory:()=>({setClip:value=>{current=value;}}),
  launch:async()=>({
   toolId:'web-markdown-clipper',actionId:'save-selection',
   selection:'选中一段内容',
   source:{url:'https://example.com/article?access_token=SECRET&mode=read&session_id=ABC#jwt=FRAGMENT'},
   expiresAt:Date.now()+60000
  })
 });
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(current?.body,'选中一段内容');
 assert.equal(current?.source,'https://example.com/article?mode=read');
 assert.equal(nodes['clip-site'].textContent,'example.com');
 assert.match(nodes['clip-status'].textContent,/点击「保存摘录」/);
});
test('expired right-click tickets do not insert stale content into notes',async()=>{
 let current=null;
 mounted({
  notesFactory:()=>({setClip:value=>{current=value;}}),
  launch:async()=>({toolId:'web-markdown-clipper',actionId:'save-selection',
   selection:'expired',source:{url:'https://example.com/'},expiresAt:Date.now()-1000})
 });
 await Promise.resolve();await Promise.resolve();
 assert.equal(current,null);
});

test('navigation while the one-shot right-click ticket is in flight cannot restore stale selection',async()=>{
 const pending=deferred();let saved=null;
 const {nodes,root}=mounted({
  notesFactory:()=>({setClip:value=>{saved=value;}}),
  launch:()=>pending.promise
 });
 root.events['opendesk-page-changed']();
 pending.resolve({toolId:'web-markdown-clipper',actionId:'save-selection',
  selection:'旧页面敏感内容',source:{url:'https://old.example/a'},expiresAt:Date.now()+60000});
 await Promise.resolve();await Promise.resolve();
 assert.equal(saved,null,'stale selection must not reach the Save button');
 assert.equal(nodes['clip-source'].value,'');
 assert.equal(nodes['clip-status'].textContent,'网页已变化，请重新剪藏');
});
test('switching modes before the right-click ticket is consumed keeps the newly selected mode',async()=>{
 const pending=deferred();let saved=null;
 const {nodes,modes}=mounted({
  notesFactory:()=>({setClip:value=>{saved=value;}}),
  launch:()=>pending.promise
 });
 await modes[3].fire('click');
 pending.resolve({toolId:'web-markdown-clipper',actionId:'save-selection',
  selection:'旧选区',source:{url:'https://old.example/a'},expiresAt:Date.now()+60000});
 await Promise.resolve();await Promise.resolve();
 assert.equal(saved,null);
 assert.equal(nodes['clip-fetch'].textContent,'生成链接');
 assert.equal(nodes['clip-source'].value,'');
});
