import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createReadingTocIndex} from '../../src/reading-toc/model.js';
import {websiteOrigin,changeTocGrant,tocGrantAllowed,READING_TOC_SITE_STORE} from '../../src/reading-toc/policy.js';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';

const pack={format:'opendesk.sidebar-tool.v1',id:'reading-toc',version:'1.0.0',
  title:'阅读目录',description:'Trusted host only',capabilities:['page.toc'],
  html:'<main>目录</main>',css:'',js:'void 0;'};
const other={...pack,id:'other-tool',capabilities:['storage.local']};

test('R4.1 per-site TOC authority is explicit and v1 legacy packages remain compatible',()=>{
  const legacy=validateSidebarToolPackage(other);
  const admitted=validateSidebarToolPackage(pack);
  assert.deepEqual(legacy.capabilities,['storage.local']);
  assert.deepEqual(admitted.capabilities,['page.toc']);
  assert.equal(websiteOrigin('javascript:alert(1)'),null);
  assert.equal(websiteOrigin('https://a:pass@example.com/'),null);
  assert.equal(websiteOrigin('https://example.com/articles?q=2'),'https://example.com');
  assert.equal(tocGrantAllowed([pack],{},pack.id,'https://example.com/a'),false);
  const granted=changeTocGrant({},pack.id,'https://example.com/a',true);
  assert.deepEqual(granted,{'reading-toc':['https://example.com']});
  assert.equal(tocGrantAllowed([pack],granted,pack.id,'https://example.com/a'),true);
  assert.equal(tocGrantAllowed([pack],granted,pack.id,'https://evil.example/a'),false);
  assert.equal(tocGrantAllowed([other],granted,pack.id,'https://example.com/a'),false);
  assert.equal(tocGrantAllowed([pack],granted,'other-tool','https://example.com/a'),false);
  assert.deepEqual(changeTocGrant(granted,pack.id,'https://example.com/b',false),{});
  assert.ok(READING_TOC_SITE_STORE.includes('toc-sites'));
  assert.throws(()=>validateSidebarToolPackage({...pack,capabilities:['page.toc','chrome.tabs']}),/能力/);
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
    const bundled=JSON.parse(await readFile('src/sidebar-tools/reading-toc.opendesk-tool.json','utf8'));
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
  assert.match(html,/id="sidebar-tool-official-install"/);
  assert.match(resources,/reading-toc\.opendesk-tool\.json/);
  assert.match(verify,/reading-toc\.opendesk-tool\.json/);
});
