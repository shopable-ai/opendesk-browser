import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {CLIP_CAPABILITY,CLIP_SITE_STORE,clipGrantAllowed,changeClipGrant} from '../../src/page-clip/policy.js';
import {domToMarkdown,chooseArticle,safeMarkdownUrl,safeClipSource,CLIP_MAX_BYTES} from '../../src/page-clip/convert.js';

const tools=['web-markdown-clipper','markdown-workbench'];
const readPkg=async id=>JSON.parse(await readFile('examples/sidebar-tools/'+id+'/'+id+'.opendesk-tool.json','utf8'));
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
 const official=JSON.parse(await readFile('src/sidebar-tools/web-markdown-clipper.opendesk-tool.json','utf8'));
 assert.deepEqual(official,clip);
});
test('R22 packer is reproducible and outputs exactly the committed reviewed package',async()=>{
 const out=await mkdtemp(join(tmpdir(),'opendesk-r22-md-'));
 try{
  for(const id of tools){
   const target=join(out,id+'.json');
   const report=await buildSidebarTool('examples/sidebar-tools/'+id,{out:target});
   assert.equal(report.validated,true);
   const expected=await readFile('examples/sidebar-tools/'+id+'/'+id+'.opendesk-tool.json','utf8');
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
 assert.match(publicScript,/web-markdown-clipper\.opendesk-tool\.json/);
 assert.match(verify,/web-markdown-clipper\.opendesk-tool\.json/);
 assert.match(entry,/initPageClip/);
 assert.match(host,/CLIP_SITE_STORE/);
 assert.match(host,/currentPageTarget\.revalidate\(target\)/);
 assert.match(host,/documentId:target\.documentId/);
 assert.match(html,/sidebar-tool-official-clip-install/);
 assert.match(sandbox,/connect-src 'none'/);
});
