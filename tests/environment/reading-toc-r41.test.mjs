import {officialToolFixture} from '../helpers/official-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createReadingTocIndex} from '../../src/reading-toc/model.js';
import {websiteOrigin,changeTocGrant,tocGrantAllowed,changeTocSiteAllowed,tocSiteAllowed,blockedTocOrigins,READING_TOC_SITE_STORE,
  READING_TOC_PAGE_RULES_STORE,changeTocPageAllowed,readingTocPageAllowed,disabledTocPages} from '../../src/reading-toc/policy.js';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {changeClipGrant,clipGrantAllowed} from '../../src/page-clip/policy.js';

const pack={format:'opendesk.sidebar-tool.v1',id:'reading-toc',version:'1.0.0',
  title:'阅读目录',description:'Trusted host only',capabilities:['page.toc'],
  html:'<main>目录</main>',css:'',js:'void 0;'};
const other={...pack,id:'other-tool',capabilities:['storage.local']};

test('imported TOC tools still require explicit origin grants',()=>{
  const custom={...pack,id:'custom-toc'};
  const legacy=validateSidebarToolPackage(other);
  const admitted=validateSidebarToolPackage(pack);
  assert.deepEqual(legacy.capabilities,['storage.local']);
  assert.deepEqual(admitted.capabilities,['page.toc']);
  assert.equal(websiteOrigin('javascript:alert(1)'),null);
  assert.equal(websiteOrigin('https://a:pass@example.com/'),null);
  assert.equal(websiteOrigin('https://example.com/articles?q=2'),'https://example.com');
  assert.equal(tocGrantAllowed([custom],{},custom.id,'https://example.com/a'),false);
  const granted=changeTocGrant({},custom.id,'https://example.com/a',true);
  assert.deepEqual(granted,{'custom-toc':['https://example.com']});
  assert.equal(tocGrantAllowed([custom],granted,custom.id,'https://example.com/a'),true);
  assert.equal(tocGrantAllowed([custom],granted,custom.id,'https://evil.example/a'),false);
  assert.equal(tocGrantAllowed([other],granted,custom.id,'https://example.com/a'),false);
  assert.equal(tocGrantAllowed([custom],granted,'other-tool','https://example.com/a'),false);
  assert.deepEqual(changeTocGrant(granted,custom.id,'https://example.com/b',false),{});
  assert.ok(READING_TOC_SITE_STORE.includes('toc-sites'));
  assert.throws(()=>validateSidebarToolPackage({...pack,capabilities:['page.toc','chrome.tabs']}),/能力/);
});

test('built-in reader defaults to HTTP(S) pages and preserves explicit site stops',()=>{
  const id=pack.id,url='https://example.com/a?private=1#chapter';
  for(const settings of [undefined,{}, {[id]:['https://previous.example'] }]){
    assert.equal(tocGrantAllowed([pack],settings,id,url),true);
    assert.equal(tocGrantAllowed([pack],settings,id,'http://another.example:43111/a'),true);
  }
  assert.equal(tocGrantAllowed([],{},id,url),false);
  assert.equal(tocGrantAllowed([pack],{},id,url,{[id]:false}),false);
  const prior={'custom-toc':['https://example.com']};
  const denied=changeTocSiteAllowed(prior,id,url,false);
  assert.deepEqual(denied,{...prior,[id]:{mode:'all-except',blockedOrigins:['https://example.com']}});
  assert.deepEqual(blockedTocOrigins(denied),['https://example.com']);
  assert.equal(tocSiteAllowed(denied,id,'https://example.com/another'),false);
  assert.equal(tocSiteAllowed(denied,id,'https://elsewhere.example'),true);
  assert.equal(tocSiteAllowed(denied,id,'http://example.com'),true);
  assert.deepEqual(changeTocSiteAllowed(denied,id,url,true),prior);
  assert.deepEqual(changeTocSiteAllowed(denied,id,url,false),denied);
  for(const invalid of ['chrome://settings','file:///tmp/a','https://user:pass@example.com'])
    assert.equal(tocSiteAllowed({},id,invalid),false);
});

test('damaged default-site records cannot silently widen authority',()=>{
  const id=pack.id,url='https://example.com';
  for(const settings of [[],false,{[id]:null},{[id]:['*']},
    {[id]:{mode:'all-except',blockedOrigins:'https://example.com'}},
    {[id]:{mode:'all-except',blockedOrigins:['https://example.com/path']}},
    {[id]:{mode:'all-except',blockedOrigins:[],unknown:true}},
    {[id]:{mode:'unknown',blockedOrigins:[]}}]){
    assert.equal(tocSiteAllowed(settings,id,url),false);
    assert.throws(()=>changeTocSiteAllowed(settings,id,url,true),/设置无效/);
  }
  const blocked=Array.from({length:64},(_,i)=>'https://s'+i+'.example');
  const settings={[id]:{mode:'all-except',blockedOrigins:blocked}};
  assert.throws(()=>changeTocSiteAllowed(settings,id,'https://extra.example',false),/64/);
});

test('shared clip grants stay explicit even when the package uses the reading-toc ID',()=>{
  const clip={...pack,capabilities:['page.clip']},url='https://example.com/a';
  assert.equal(clipGrantAllowed([clip],{},clip.id,url),false);
  const grants=changeClipGrant({},clip.id,url,true);
  assert.deepEqual(grants,{[clip.id]:['https://example.com']});
  assert.equal(clipGrantAllowed([clip],grants,clip.id,url),true);
  assert.equal(clipGrantAllowed([clip],grants,clip.id,'https://other.example'),false);
});

test('R4.7 current-page exclusions do not grant origin authority or capture URL queries',()=>{
  const id='reading-toc',url='https://example.com/guide?private=token#answer';
  assert.equal(readingTocPageAllowed({},id,url),true);
  const denied=changeTocPageAllowed({},id,url,false);
  assert.deepEqual(denied,{[id]:['https://example.com/guide']});
  assert.equal(readingTocPageAllowed(denied,id,url),false);
  assert.equal(readingTocPageAllowed(denied,id,'https://example.com/another'),true);
  assert.equal(readingTocPageAllowed(denied,'other-tool',url),true);
  assert.equal(readingTocPageAllowed(denied,id,'javascript:alert(1)'),false);
  assert.deepEqual(disabledTocPages(denied,id),['https://example.com/guide']);
  assert.deepEqual(changeTocPageAllowed(denied,id,url,true),{});
  assert.match(READING_TOC_PAGE_RULES_STORE,/disabled-pages/);
  assert.throws(()=>changeTocPageAllowed({},id,'chrome://extensions',false),/页面/);
});

class Element {
  constructor(kind,tagName='DIV',parent=null,label=''){
    this.kind=kind;this.tagName=tagName;this.parentElement=parent;
    this.textContent=label;this.isConnected=true;this.id='duplicate-original-id';
  }
  getClientRects(){return [1];}
  closest(selector){
    let node=this;
    while(node){
      if(selector==='[data-message-author-role="assistant"]' && node.kind==='assistant')return node;
      if(selector==='.AnswerItem' && node.kind==='zhihu')return node;
      if(selector==='article' && node.kind==='article')return node;
      if(selector==='header' && node.kind==='header')return node;
      if(selector==='main,[role="main"]' && node.kind==='main')return node;
      if(selector.includes('pre,code,nav,aside') && node.kind==='pre')return node;
      node=node.parentElement;
    }
    return null;
  }
}
function docFor(headings,{chat=false,zhihu=false}={}){
  const body=new Element('body','BODY');
  return {body,defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
    querySelector(selector){
      if(selector.includes('assistant')&&chat)return new Element('assistant');
      if(selector==='.AnswerItem'&&zhihu)return new Element('zhihu');
      return null;
    },
    querySelectorAll(selector){assert.equal(selector,'h1,h2,h3,h4,h5,h6');return headings;}
  };
}
test('R4.1 ordinary articles preserve multiple H1 and H2-only documents',()=>{
  const article=new Element('article');
  const doc=docFor([
    new Element('heading','H1',article,'文章页标题'),
    new Element('heading','H1',article,'正文中的第二个 H1'),
    new Element('heading','H2',article,'相同标题')
  ]);
  const index=createReadingTocIndex(doc);
  const result=index.rebuild();
  assert.deepEqual(result.items.map(row=>row.rank),[1,1,2]);
  assert.deepEqual(result.items.map(row=>row.depth),[0,0,1]);
  assert.equal(new Set(result.items.map(row=>row.id)).size,3,'duplicate original DOM id must not collide');
  const second=index.rebuild();
  assert.deepEqual(second.items.map(row=>row.id),result.items.map(row=>row.id),'stable element identities');
  assert.equal(index.resolve(result.items[2].id,result.items[2].sourceId)?.label,'相同标题');
  const h2=new Element('heading','H2',article,'Only H2');
  const isolated=createReadingTocIndex(docFor([h2]));
  assert.equal(isolated.rebuild().items[0].depth,0);
});
test('R4.7 ordinary pages expose one core source even with multiple article cards',()=>{
  const page=new Element('body','BODY'),main=new Element('main','MAIN',page);
  const teaser=new Element('article','ARTICLE',main),chapter=new Element('article','ARTICLE',main);
  const outside=new Element('heading','H2',page,'页外模块标题');
  const headings=[
    new Element('heading','H2',teaser,'前言'),
    new Element('heading','H2',chapter,'第一章'),
    new Element('heading','H3',chapter,'详细步骤')
  ];
  const doc=docFor([outside,...headings]);doc.body=page;
  const index=createReadingTocIndex(doc),result=index.rebuild();
  assert.deepEqual(result.items.map(x=>x.label),['前言','第一章','详细步骤']);
  assert.equal(result.sources.length,1,'articles inside one main are not independent sources');
  assert.equal(result.sources[0].label,'当前网页');
  assert.equal(new Set(result.items.map(x=>x.sourceId)).size,1);
  assert.deepEqual(index.rebuild().items.map(x=>x.id),result.items.map(x=>x.id));
});

test('R4.7 without main use the strongest article, or one body fallback',()=>{
  const page=new Element('body','BODY');
  const teaser=new Element('article','ARTICLE',page),article=new Element('article','ARTICLE',page);
  const headings=[
    new Element('heading','H2',teaser,'相关文章推荐'),
    new Element('heading','H1',article,'文章正文'),
    new Element('heading','H2',article,'方案'),
    new Element('heading','H3',article,'细节')
  ];
  const doc=docFor(headings);doc.body=page;
  const result=createReadingTocIndex(doc).rebuild();
  assert.deepEqual(result.items.map(x=>x.label),['文章正文','方案','细节']);
  assert.equal(result.sources.length,1,'multiple articles never create a source chooser');
  const simple=createReadingTocIndex(docFor([new Element('heading','H2',page,'摘要'),
    new Element('heading','H2',page,'结论')])).rebuild();
  assert.equal(simple.sources.length,1,'pages without landmarks still have one source');
  assert.equal(simple.items.length,2);
});

test('R4.1 assistant answer fragment grouping is wrapper-based, never adjacent-text guessing',()=>{
  const assistantA=new Element('assistant'),assistantB=new Element('assistant');
  const fragmentsA=[new Element('fragment','DIV',assistantA),new Element('fragment','DIV',assistantA),new Element('fragment','DIV',assistantA)];
  const answerA=[
    new Element('heading','H1',fragmentsA[0],'第一部分'),
    new Element('heading','H2',fragmentsA[0],'概览'),
    new Element('heading','H1',fragmentsA[1],'第二个 H1'),
    new Element('heading','H2',fragmentsA[2],'总结')
  ];
  const answerB=[new Element('heading','H1',assistantB,'独立回答'),new Element('heading','H2',assistantB,'总结')];
  const index=createReadingTocIndex(docFor([...answerA,...answerB],{chat:true}));
  const result=index.rebuild();
  assert.equal(result.adapter,'chatgpt');
  assert.equal(result.sources.length,2);
  assert.deepEqual(result.items.map(x=>x.depth),[0,1,0,1,0,1]);
  assert.equal(result.items[0].sourceId,result.items[3].sourceId,'A spans three verified fragments');
  assert.notEqual(result.items[3].sourceId,result.items[4].sourceId,'B must not inherit A hierarchy');
  assert.notEqual(result.items[3].id,result.items[5].id,'same-name headings remain separate');
  assert.equal(index.resolve(result.items[3].id,result.items[4].sourceId),null,'cannot navigate using a forged source');
  answerA[3].isConnected=false;
  assert.equal(index.resolve(result.items[3].id,result.items[3].sourceId),null,'unmounted heading is stale');
});
test('R4.1 official JSON is reproducible through existing packer and exact v1 validation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'reading-toc-package-'));
  try{
    const path=join(dir,'reading-toc.opendesk-tool.json');
    await buildSidebarTool('examples/sidebar-tools/reading-toc',{out:path});
    const actual=JSON.parse(await readFile(path,'utf8'));
    const bundled=await officialToolFixture('reading-toc');
    assert.deepEqual(actual,bundled);
    assert.equal(validateSidebarToolPackage(actual).id,'reading-toc');
    assert.equal(actual.capabilities.includes('page.toc'),true);
    assert.doesNotMatch(actual.js,/chrome\.tabs|document\.querySelectorAll\('h1/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('R4.1 installer entry, constrained content script, and distributable resource are wired',async()=>{
  const [entry,host,html,resources,verify]=await Promise.all([
    readFile('src/entrypoints/page-relay.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/tool.html','utf8'),
    readFile('scripts/prepare-public.mjs','utf8'),
    readFile('scripts/verify-package.mjs','utf8')
  ]);
  assert.match(entry,/initReadingToc/);
  assert.match(host,/READING_TOC_PROTOCOL/);
  assert.match(host,/currentPageTarget\.revalidate\(target\)/);
  assert.match(host,/documentId:target\.documentId/);
  assert.match(host,/READING_TOC_SITE_STORE/);
  assert.match(html,/id="sidebar-tool-official-catalog"/);
  assert.match(resources,/buildOfficialTools/);
  assert.match(verify,/createOfficialToolResources/);
});

test('R4.1 selectively excludes a semantic article title but preserves section header H2',()=>{
  const article=new Element('article','ARTICLE');
  const documentHeader=new Element('header','HEADER',article);
  const pageTitle=new Element('heading','H1',documentHeader,'文档标题');
  documentHeader.querySelector=selector=>selector==='h1'?pageTitle:null;
  const section=new Element('section','SECTION',article);
  const sectionHeader=new Element('header','HEADER',section);
  const sectionHeading=new Element('heading','H2',sectionHeader,'章节头部的合法 H2');
  const internalHeading=new Element('heading','H1',article,'正文附录 H1');
  const result=createReadingTocIndex(docFor([pageTitle,sectionHeading,internalHeading])).rebuild();
  assert.deepEqual(result.items.map(item=>item.label),['章节头部的合法 H2','正文附录 H1']);
  assert.deepEqual(result.items.map(item=>item.depth),[0,0]);
});
