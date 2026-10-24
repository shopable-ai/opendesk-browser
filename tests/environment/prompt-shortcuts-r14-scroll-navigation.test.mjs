// Source/adapter regression only. Browser-installed and live-site checks remain separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {findConversationNavigation,jumpConversationEdge,jumpRegionEnd} from
  '../../examples/programs/chatgpt-jump-top/src/conversation.js';

const ROOT='examples/sidebar-tools/prompt-shortcuts';
const flags=['regionTop','regionBottom','conversationTop','conversationBottom','floatingTop'];
async function readModel(){
  const code=await readFile(ROOT+'/trusted/model.js','utf8');
  const context={URL,Intl,TextEncoder,crypto:webcrypto};
  runInNewContext(code,context);
  return context.OpenDeskPromptShortcutsModel;
}
test('R1.16 older library gets five enabled navigation switches without losing prompts',async()=>{
  const model=await readModel();
  const item=model.draft({body:'旧版提示词'},null,()=>'old_item_12345');
  const old={schema:1,items:[item],settings:{webButtons:true,imageSize:'compact'}};
  const next=model.load(old);
  assert.equal(next.items[0].body,item.body);
  assert.equal(next.settings.webButtons,true);
  assert.equal(next.settings.imageSize,'compact');
  for(const key of flags)assert.equal(next.settings.scrollNavigation[key],true,key);
});
test('R1.16 switches are independent, persisted and reject malformed input',async()=>{
  const model=await readModel();
  const old=model.defaults();
  const next=model.load({...old,settings:{...old.settings,scrollNavigation:{
    regionBottom:false,conversationTop:false
  }}});
  assert.equal(next.settings.scrollNavigation.regionBottom,false);
  assert.equal(next.settings.scrollNavigation.conversationTop,false);
  for(const key of flags.filter(key=>!['regionBottom','conversationTop'].includes(key)))
    assert.equal(next.settings.scrollNavigation[key],true,key);
  for(const value of [{regionTop:'false'},{unknown:true},[],null]){
    assert.throws(()=>model.load({...old,settings:{...old.settings,scrollNavigation:value}}),
      {code:'E_PROMPT_DATA'});
  }
});
function fixture(){
  const contains=function(node){
    for(let current=node;current;current=current.parentElement)if(current===this)return true;
    return false;
  };
  const root={isConnected:true,scrollTop:0,scrollHeight:5000,clientHeight:900};
  const body={parentElement:root,isConnected:true};
  const transcript={parentElement:body,isConnected:true,scrollTop:215,scrollLeft:19,
    scrollHeight:3200,clientHeight:500,clientTop:0,contains,
    getBoundingClientRect(){return {top:80,bottom:580,left:110,right:940,width:830,height:500};},
    closest(){return null;},
    scrollTo({top,left}){this.scrollTop=top;this.scrollLeft=left;}
  };
  const element=(top,height,parentElement=transcript)=>({
    parentElement,isConnected:true,scrollHeight:height,clientHeight:height,contains,
    getBoundingClientRect(){return {top,bottom:top+height,left:140,right:850,width:710,height};},
    closest(){return null;},querySelectorAll(){return []}
  });
  const main=element(90,2600),first=element(100,120,main),last=element(1800,800,main);
  main.querySelectorAll=selector=>selector==='[data-turn]'?[first,last]:[];
  const doc={body,scrollingElement:root,documentElement:root};
  const win={innerWidth:1200,innerHeight:850,
    getComputedStyle(node){return {overflowY:(node===transcript||node.isNestedScroller)?'auto':'visible',
      display:'block',visibility:'visible',position:'static'};}
  };
  return {main,first,last,transcript,root,doc,win,element};
}
test('R1.16 whole-conversation top/bottom scroll transcript, never page or code',()=>{
  const {main,transcript,root,doc,win}=fixture();
  assert.equal(findConversationNavigation(main,'[data-turn]',doc,win)?.scroller,transcript);
  assert.equal(jumpConversationEdge(main,'[data-turn]','top',doc,win),true);
  assert.equal(transcript.scrollTop,0);
  assert.equal(jumpConversationEdge(main,'[data-turn]','bottom',doc,win),true);
  assert.equal(transcript.scrollTop,2700);
  assert.equal(transcript.scrollLeft,19);
  assert.equal(root.scrollTop,0);
  assert.equal(jumpConversationEdge(main,'[data-turn]','sideways',doc,win),false);
});
test('R1.16 region bottom targets only its own scrollport and rejects unrelated editors',()=>{
  const {main,first,last,transcript,root,doc,win,element}=fixture();
  assert.equal(jumpRegionEnd({target:last,main,kind:'region'},doc,win),true);
  assert.equal(transcript.scrollTop,2247);
  assert.equal(root.scrollTop,0);
  const inner={parentElement:first,isConnected:true,scrollHeight:1000,clientHeight:100};
  const editor=element(180,320,inner);
  assert.equal(jumpRegionEnd({target:editor,main,kind:'editor'},doc,win),false);
  assert.equal(transcript.scrollTop,2247);
});
test('R1.16 ambiguous or short conversation has no global controls',()=>{
  const {main,first,last,transcript,doc,win}=fixture();
  assert.equal(findConversationNavigation(main,'[missing]',doc,win),null);
  transcript.scrollHeight=transcript.clientHeight+200;
  assert.equal(findConversationNavigation(main,'[data-turn]',doc,win),null);
  transcript.scrollHeight=3200;
  const foreign={...transcript,isNestedScroller:true,scrollHeight:2000,parentElement:main};
  last.parentElement=foreign;
  assert.equal(findConversationNavigation(main,'[data-turn]',doc,win),null);
});
test('R1.16 formal management, preview, authority and uninstall cleanup are source-bound',async()=>{
  const [html,js,page,preview]=await Promise.all([
    readFile(ROOT+'/src/index.html','utf8'),readFile(ROOT+'/src/main.js','utf8'),
    readFile(ROOT+'/trusted/page.js','utf8'),readFile(ROOT+'/preview/index.html','utf8')
  ]);
  for(const key of flags){
    assert.match(html,new RegExp('data-scroll-nav="'+key+'"'));
    assert.match(preview,new RegExp('data-scroll-nav-preview="'+key+'"'));
  }
  assert.match(js,/changeScrollSetting/);
  assert.match(js,/await commit\(next\)/);
  assert.match(page,/await allowedPromptSite\(/);
  assert.match(page,/navigationSettings\.floatingTop/);
  assert.match(page,/floatingHost\?\.remove\(\)/);
  assert.doesNotMatch(page,/brand\.title='打开提示词快捷按钮'/);
  assert.doesNotMatch(preview,/title='打开模拟侧边栏管理提示词'/);
});

test('R1.16.3 formal nav uses one lower-right dock while preserving switches and region toolbar',async()=>{
  const [page,preview,html]=await Promise.all([
    readFile(ROOT+'/trusted/page.js','utf8'),readFile(ROOT+'/preview/index.html','utf8'),
    readFile(ROOT+'/src/index.html','utf8')
  ]);
  const render=page.slice(page.indexOf('  function render(){'),page.indexOf('  async function refresh(){'));
  assert.doesNotMatch(render,/data-scroll-conversation|nav-item|conversationTop|conversationBottom/,
    'the injected prompt rail must contain saved prompt entries only');
  assert.match(page,/floatingHost=doc.createElement\('nav'\)/);
  assert.match(page,/floatingHost.setAttribute\('aria-label','对话滚动导航'\)/);
  assert.match(page,/const showTop=\(navigationSettings.conversationTop\|\|floatingReady\)&&!nativeTopVisible\(\)/);
  assert.match(page,/const showBottom=navigationSettings.conversationBottom/);
  assert.match(page,/const topKey=navigationSettings.conversationTop\?'conversationTop':'floatingTop'/);
  assert.match(page,/floatingButtons.stack.replaceChildren\(\.\.\.directions.map/);
  assert.match(page,/navigationClick\(direction,button.dataset.scrollNavKey,event\)/);
  assert.match(page,/button.disabled=direction==='top'\?/);
  assert.match(page,/conversationDirections:\{top:false,bottom:false\}/);
  assert.match(preview,/id="mockConversationNav" aria-label="对话滚动导航"/);
  assert.match(preview,/id="demoReplyTop"/);
  assert.match(preview,/id="demoReplyBottom"/);
  assert.doesNotMatch(preview,/mockFloatingTop|page-shortcut nav-preview/);
  for(const key of ['conversationTop','conversationBottom']){
    assert.match(html,new RegExp('data-scroll-nav="'+key+'"'));
    assert.match(preview,new RegExp('data-scroll-nav-preview="'+key+'"'));
  }
  const mockRail=preview.slice(preview.indexOf(' function renderRail(){'),
    preview.indexOf(' function positionWebTip(){'));
  assert.doesNotMatch(mockRail,/conversationTop|conversationBottom|floatingTop/);
});
