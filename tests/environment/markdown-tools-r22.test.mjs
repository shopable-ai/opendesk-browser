import {officialToolFixture,officialFixtures} from '../helpers/official-tools.mjs';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {tmpdir} from 'node:os';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {CLIP_CAPABILITY,CLIP_SITE_STORE,clipGrantAllowed,changeClipGrant} from '../../src/page-clip/policy.js';
import {domToMarkdown,chooseArticle,safeMarkdownUrl,safeClipSource,CLIP_MAX_BYTES} from '../../src/page-clip/convert.js';

const tools=['web-markdown-clipper','markdown-workbench'];
const readPkg=officialToolFixture;
test('R22 both tools are distinct, bounded v1 installable packages with no remote script',async()=>{
 const [clip,work]=await Promise.all(tools.map(readPkg));
 assert.equal(validateSidebarToolPackage(clip).id,'web-markdown-clipper');
 assert.equal(validateSidebarToolPackage(work).id,'markdown-workbench');
 assert.deepEqual(clip.capabilities,['page.clip','user.export']);
 assert.deepEqual(work.capabilities,['user.export']);
 for(const pkg of [clip,work]){
  assert.doesNotMatch(pkg.html,/<script|<iframe|<style|onload\s*=/i);
  assert.doesNotMatch(pkg.css,/@import|url\(\s*['"]?https?:/i);
  assert.doesNotMatch(pkg.js,/\bchrome\.(tabs|scripting|storage|runtime)\b/);
  assert.ok(Buffer.byteLength(JSON.stringify(pkg))<320000);
  assert.throws(()=>validateSidebarToolPackage({...pkg,capabilities:['page.unknown']}),/能力/);
 }
 const official=await officialToolFixture('web-markdown-clipper');
 assert.deepEqual(official,clip);
});
test('R22 packer is reproducible and matches the official build output',async()=>{
 const out=await mkdtemp(join(tmpdir(),'opendesk-r22-md-'));
 try{
  for(const id of tools){
   const target=join(out,id+'.json');
   const report=await buildSidebarTool('examples/sidebar-tools/'+id,{out:target});
   assert.equal(report.validated,true);
   const expected=(await officialFixtures()).resources.get(officialPackagePath(id)).toString('utf8');
   const actual=await readFile(target,'utf8');
   assert.equal(actual,expected,'same validated source/version must have byte-identical JSON');
  }
 }finally{await rm(out,{recursive:true,force:true});}
});
test('R22 body authority is distinct from TOC and revoked without fallback',async()=>{
 const pkg=await readPkg('web-markdown-clipper');
 const url='https://news.example/article?id=1';
 const allow=changeClipGrant({},pkg.id,url,true);
 assert.equal(CLIP_CAPABILITY,'page.clip');
 assert.match(CLIP_SITE_STORE,/clip-sites/);
 assert.deepEqual(allow[pkg.id],['https://news.example']);
 assert.equal(clipGrantAllowed([pkg],allow,pkg.id,url),true);
 assert.equal(clipGrantAllowed([pkg],{},pkg.id,url),false);
 assert.equal(clipGrantAllowed([pkg],allow,pkg.id,'https://other.example'),false);
 assert.equal(clipGrantAllowed([],allow,pkg.id,url),false);
 assert.equal(clipGrantAllowed([{...pkg,capabilities:['page.toc']}],allow,pkg.id,url),false);
 assert.equal(clipGrantAllowed([pkg],changeClipGrant(allow,pkg.id,url,false),pkg.id,url),false);
 assert.equal(clipGrantAllowed([pkg],allow,pkg.id,'javascript:alert(1)'),false);
});
test('R22 URLs normalize relative assets but refuse dangerous or credentialed links',()=>{
 assert.equal(safeMarkdownUrl('../img.png','https://a.example/post/2'), 'https://a.example/img.png');
 assert.equal(safeMarkdownUrl('/next','https://a.example/post'),'https://a.example/next');
 assert.equal(safeMarkdownUrl('javascript:alert(1)','https://a.example/'),null);
 assert.equal(safeMarkdownUrl('data:text/html,hi','https://a.example/'),null);
 assert.equal(safeMarkdownUrl('https://user:pass@a.example/','https://a.example/'),null);
 assert.equal(safeMarkdownUrl('mailto:test@example.com','https://a.example/'),'mailto:test@example.com');
 assert.equal(safeMarkdownUrl('mailto:test@example.com','https://a.example/',{image:true}),null);
 assert.equal(safeClipSource('https://a.example/post?id=123&access_token=SECRET#jwt=XYZ'), 'https://a.example/post?id=123');
});
const T=value=>({nodeType:3,nodeValue:value,textContent:value});
function E(tag,children=[],attrs={}){
 const name=tag.toUpperCase(),node={nodeType:1,tagName:name,childNodes:children,
  children:children.filter(x=>x.nodeType===1),className:attrs.class||'',hidden:Boolean(attrs.hidden),
  isConnected:false,ownerDocument:{defaultView:null},
  getAttribute(key){return Object.hasOwn(attrs,key)?String(attrs[key]):null;},
  matches(selector){return selector.split(',').map(x=>x.trim().toUpperCase()).includes(name);},
  querySelectorAll(selector){
   const matches=selector.split(',').map(x=>x.trim().toUpperCase());
   const result=[];
   function walk(n){for(const c of n.children||[]){if(matches.includes(c.tagName))result.push(c);walk(c);}}
   walk(this);return result;
  },
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 };
 for(const child of children)if(child.nodeType===1)child.parentElement=node;
 Object.defineProperty(node,'textContent',{get(){return children.map(x=>x.textContent||'').join('');}});
 return node;
}
test('R22 trustworthy offline conversion preserves Chinese, repeated headings, GFM structures',()=>{
 const document=E('ARTICLE',[
  E('H2',[T('重复标题')]),E('H2',[T('重复标题')]),
  E('P',[T('中文 '),E('STRONG',[T('粗体')]),T(' '),E('A',[T('相对链接')],{href:'../next'})]),
  E('UL',[E('LI',[T('列表项')])]),
  E('PRE',[E('CODE',[T('const a = 1;\n')],{class:'language-js'})]),
  E('TABLE',[E('TR',[E('TH',[T('甲')]),E('TH',[T('乙')])]),
    E('TR',[E('TD',[T('值 1')]),E('TD',[T('值 2')])])]),
  E('IMG',[],{src:'/picture.png',alt:'封面'}),
  E('NAV',[T('导航不得出现')]),
  E('DIV',[T('广告不得出现')],{class:'ads'})
 ]);
 const result=domToMarkdown(document,'https://example.com/posts/one');
 assert.equal((result.match(/## 重复标题/g)||[]).length,2);
 assert.match(result,/中文 \*\*粗体\*\*/);
 assert.match(result,/\[相对链接\]\(https:\/\/example.com\/next\)/);
 assert.match(result,/- 列表项/);
 assert.match(result,/const a = 1;/);
 assert.match(result,/\| 甲 \| 乙 \|/);
 assert.match(result,/!\[封面\]\(https:\/\/example.com\/picture.png\)/);
 assert.doesNotMatch(result,/导航不得出现|广告不得出现/);
});
test('R22 selected DocumentFragment is supported and oversized content fails closed',()=>{
 const fragment={nodeType:11,childNodes:[E('P',[T('选中的中文正文')])]};
 assert.match(domToMarkdown(fragment,'https://example.com'),/选中的中文正文/);
 assert.throws(()=>domToMarkdown(E('P',[T('x'.repeat(CLIP_MAX_BYTES+1))]),'https://example.com'),/过大/);
 assert.throws(()=>chooseArticle({querySelectorAll:()=>[]}),/无法可靠识别/);
});
test('R22 fixed release inclusion and trusted-site wiring are explicit',async()=>{
 const [publicScript,verify,entry,host,html,sandbox]=await Promise.all([
  readFile('scripts/prepare-public.mjs','utf8'),readFile('scripts/verify-package.mjs','utf8'),
  readFile('src/entrypoints/page-relay.js','utf8'),readFile('src/ui/sidebar-tools.js','utf8'),
  readFile('src/ui/tool.html','utf8'),readFile('src/sidebar-tools/sandbox.html','utf8')]);
 assert.match(publicScript,/buildOfficialTools/);
 assert.match(verify,/createOfficialToolResources/);
 assert.match(entry,/initPageClip/);
 assert.match(host,/CLIP_SITE_STORE/);
 assert.match(host,/currentPageTarget\.revalidate\(target\)/);
 assert.match(host,/documentId:target\.documentId/);
 assert.match(html,/sidebar-tool-official-catalog/);
 assert.match(sandbox,/connect-src 'none'/);
});

test('R5.2 Markdown Workbench built package has no confirm/alert/prompt or exit modal',async()=>{
 const [source,html,style,config]=await Promise.all([
  readFile('examples/sidebar-tools/markdown-workbench/src/main.js','utf8'),
  readFile('examples/sidebar-tools/markdown-workbench/src/index.html','utf8'),
  readFile('examples/sidebar-tools/markdown-workbench/src/style.css','utf8'),
  readFile('examples/sidebar-tools/markdown-workbench/tool.config.json','utf8').then(JSON.parse)]);
 assert.equal(config.version,'1.0.1');
 assert.doesNotMatch(source,/\b(?:confirm|alert|prompt)\s*\(|beforeunload/);
 assert.match(source,/serial!==importSerial/,'late file loads must not overwrite later edits');
 for(const id of ['mdw-inline-review','mdw-review-text','mdw-review-confirm','mdw-review-cancel'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(style,/\.mdw-inline-review\[hidden\]/);
 const packaged=await officialToolFixture('markdown-workbench');
 assert.equal(packaged.version,'1.0.1');
 assert.doesNotMatch(packaged.js,/\bconfirm\s*\(|beforeunload/);
});

test('R5.2 Markdown Workbench import and clear are explicit in-page operations',async()=>{
 const source=await readFile('examples/sidebar-tools/markdown-workbench/src/main.js','utf8');
 class TestNode {
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.dataset={};this.listeners={};this.hidden=id==='mdw-inline-review';this.children=[];this.files=[];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  emit(type){for(const fn of this.listeners[type]||[])fn();}
  setAttribute(name,value){this[name]=value;}
  focus(){this.focused=true;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
 }
 const ids=['mdw-source','mdw-preview','mdw-panes','mdw-status','mdw-state','mdw-file','mdw-import','mdw-copy','mdw-download','mdw-clear','mdw-inline-review','mdw-review-text','mdw-review-confirm','mdw-review-cancel'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new TestNode(id)]));
 const root={querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>[]};
 const document={createElement:tag=>new TestNode(tag),createDocumentFragment:()=>new TestNode('fragment')};
 const window={addEventListener(type){if(type==='beforeunload')throw new Error('modal exit handler must never register');}};
 runInNewContext(source,{globalThis:{OpenDeskTool:{root,request:async()=>({})}},document,window,
  TextEncoder,URL,clearTimeout:()=>{},setTimeout:()=>1,
  confirm(){throw new Error('unexpected confirm')},alert(){throw new Error('unexpected alert')},prompt(){throw new Error('unexpected prompt')}});
 const sourceEditor=nodes['mdw-source'],review=nodes['mdw-inline-review'],file=nodes['mdw-file'];
 sourceEditor.value='Original draft';sourceEditor.emit('input');
 file.files=[{name:'new.md',size:10,text:async()=>'# Replacement'}];file.emit('change');
 assert.equal(review.hidden,false,'importing over dirty text shows in-page approval');
 assert.equal(sourceEditor.value,'Original draft');
 nodes['mdw-review-cancel'].emit('click');
 assert.equal(review.hidden,true);assert.equal(sourceEditor.value,'Original draft');
 file.files=[{name:'new.md',size:10,text:async()=>'# Replacement'}];file.emit('change');
 nodes['mdw-review-confirm'].emit('click');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sourceEditor.value,'# Replacement');
 nodes['mdw-clear'].emit('click');
 assert.equal(review.hidden,false);
 nodes['mdw-review-cancel'].emit('click');
 assert.equal(sourceEditor.value,'# Replacement');
 nodes['mdw-clear'].emit('click');
 nodes['mdw-review-confirm'].emit('click');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sourceEditor.value,'','clear occurs only after inline Continue');
});
