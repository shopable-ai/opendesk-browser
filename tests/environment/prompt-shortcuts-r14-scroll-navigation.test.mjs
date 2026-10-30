// Source/adapter regression only. Browser-installed and live-site checks remain separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {findConversationNavigation,jumpConversationEdge,jumpRegionEnd} from
  '../../examples/programs/chatgpt-jump-top/src/conversation.js';

const ROOT='projects/prompt-shortcuts';
async function readModel(){
  const sandbox={URL,Intl,TextEncoder,crypto:webcrypto};
  runInNewContext(await readFile(ROOT+'/trusted/model.js','utf8'),sandbox);
  return sandbox.OpenDeskPromptShortcutsModel;
}
test('R1.2.2 existing prompts and image references remain usable without navigation settings',async()=>{
  const model=await readModel();
  const item=model.draft({body:'旧版提示词',imageAssetId:'psa_0123456789abcdef0123456789abcdef'},
    null,()=>'old_item_12345');
  const old={schema:1,items:[item],settings:{webButtons:true,imageSize:'compact'}};
  const next=model.load(old);
  assert.equal(next.items[0].body,item.body);
  assert.equal(next.items[0].imageAssetId,item.imageAssetId);
  assert.equal(next.settings.webButtons,true);
  assert.equal(next.settings.imageSize,'compact');
  assert.equal(Object.hasOwn(next.settings,'scrollNavigation'),false);
  const saved=model.libraryForStorage(next);
  assert.equal(saved.items[0].body,item.body);
  assert.equal(saved.items[0].imageAssetId,item.imageAssetId);
  assert.equal(Object.hasOwn(saved.settings,'scrollNavigation'),false);
});
test('R1.2.2 retired navigation overrides are ignored, never validated as active Prompt settings',async()=>{
  const model=await readModel(),base=model.defaults();
  const cases=[undefined,{regionTop:false,regionBottom:true,
    conversationTop:false,conversationBottom:true,floatingTop:false},
    {regionBottom:false}, {regionTop:'false'}, {unknown:true}, [],null];
  for(const legacy of cases){
    const old={...base,settings:{...base.settings,scrollNavigation:legacy}};
    const loaded=model.load(old);
    assert.equal(Object.hasOwn(loaded.settings,'scrollNavigation'),false);
    const stored=model.libraryForStorage(old);
    assert.equal(Object.hasOwn(stored.settings,'scrollNavigation'),false);
    assert.equal(stored.settings.webButtons,true);
  }
  assert.throws(()=>model.load({...base,settings:{...base.settings,webButtons:'true'}}),
    {code:'E_PROMPT_DATA'},'current Prompt configuration remains validated');
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
test('R1.1 Prompt Shortcuts has no runtime navigation owner',async()=>{
  const [page,html,program,adapter,floating]=await Promise.all([
    readFile(ROOT+'/trusted/page.js','utf8'),
    readFile(ROOT+'/src/index.html','utf8'),
    readFile('examples/programs/chatgpt-jump-top/src/main.js','utf8'),
    readFile('examples/programs/chatgpt-jump-top/src/site-adapters.js','utf8'),
    readFile('examples/programs/chatgpt-jump-top/src/floating-navigation.js','utf8')
  ]);
  assert.doesNotMatch(page,/installJumpToTop|syncJump|stopJump|jumpConversationEdge/);
  assert.doesNotMatch(page,/floatingHost|floatingButtons|navigationSettings|data-opendesk-prompts-floating/);
  assert.doesNotMatch(page,/conversation-sites\.js/);
  assert.doesNotMatch(html,/ps-scroll-settings|data-scroll-nav=/);
  assert.match(program,/installJumpToTop\(/);
  assert.match(program,/installFloatingNavigation\(/);
  assert.match(adapter,/findDeepSeekBindings/);
  assert.match(floating,/data-opendesk-ai-scroll-navigation/);
  assert.match(floating,/doc\.querySelector\(LEGACY\)/,
    'temporarily running old Prompt navigation wins during migration');
});
test('R1.2.2 legacy navigation data never reappears on a normal Prompt save',async()=>{
  const model=await readModel();
  const item=model.draft({body:'兼容旧数据'},null,()=>'old_item_12346');
  const old={schema:1,items:[item],settings:{webButtons:false,imageSize:'standard',
    scrollNavigation:{regionBottom:false,floatingTop:false}}};
  const loaded=model.load(old);
  assert.equal(loaded.items[0].body,item.body);
  assert.equal(Object.hasOwn(loaded.settings,'scrollNavigation'),false);
  const persisted=model.libraryForStorage(loaded);
  const restored=model.load(persisted);
  assert.equal(restored.items[0].body,item.body);
  assert.equal(restored.settings.webButtons,false);
  assert.equal(restored.settings.imageSize,'standard');
  assert.equal(Object.hasOwn(persisted.settings,'scrollNavigation'),false);
});
test('R1.1 site adapters are explicit, restricted and do not claim all reply toolbars',async()=>{
  const {siteForUrl,findSiteBindings}=await import(
    '../../examples/programs/chatgpt-jump-top/src/site-adapters.js');
  assert.equal(siteForUrl('https://chatgpt.com/c/abc'),'chatgpt');
  assert.equal(siteForUrl('https://chat.deepseek.com/a/chat/s/abcd-1234'),'deepseek');
  assert.equal(siteForUrl('https://gemini.google.com/app/abcd'),'gemini');
  for(const url of ['https://chatgpt.com.evil.test/c/abc',
    'http://chatgpt.com/c/abc','https://claude.ai/chat/1',
    'https://chat.deepseek.com/login','https://gemini.google.com/settings'])
    assert.equal(siteForUrl(url),null,url);
  assert.deepEqual(findSiteBindings({},{location:{href:'https://gemini.google.com/app/a'}}),[],
    'unverified Gemini per-answer actions fail closed');
});
