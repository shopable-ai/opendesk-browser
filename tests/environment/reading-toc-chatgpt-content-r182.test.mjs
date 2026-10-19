import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadingTocIndex} from '../../src/reading-toc/model.js';

// Minimal DOM fixture: headings keep their real ancestor/DOM identities, while
// the assistant's .markdown boundary is separate from turn chrome and role labels.
class Node {
  constructor(kind,tagName='DIV',parentElement=null,textContent='',attributes={}){
    this.kind=kind;this.tagName=tagName;this.parentElement=parentElement;
    this.textContent=textContent;this.isConnected=true;this.attributes=attributes;
  }
  getAttribute(name){return this.attributes[name]??null;}
  getClientRects(){return this.isConnected?[1]:[];}
  matches(){return false;}
  closest(selector){
    for(let node=this;node;node=node.parentElement){
      if(selector==='[data-message-author-role="assistant"]'&&node.kind==='assistant')return node;
      if(selector==='.markdown'&&node.kind==='markdown')return node;
      if(selector==='[data-message-role="assistant"]'&&node.kind==='assistant-new')return node;
      if(selector==='[data-conversation-transcript]'&&node.kind==='transcript')return node;
      if(selector==='[data-assistant-markdown-root]'&&node.kind==='markdown-new')return node;
      if(selector==='[data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]'&&
         node.getAttribute('data-chatgpt-selection-message-id')!==null&&
         node.getAttribute('data-chatgpt-selection-conversation-id')!==null)return node;
      if(selector==='[data-markdown-text-style="assistant-message"]'&&
         node.getAttribute('data-markdown-text-style')==='assistant-message')return node;
      if(selector==='.AnswerItem'&&node.kind==='zhihu')return node;
      if(selector==='article'&&node.kind==='article')return node;
      if(selector==='main,[role="main"]'&&node.kind==='main')return node;
      if(selector.startsWith('pre,code,nav,aside')&&['nav','pre','overlay'].includes(node.kind))return node;
    }
    return null;
  }
}
function docFor(body,headings,{host='chatgpt.com',assistant=null,zhihu=null}={}){
  return {body,location:{hostname:host},
    defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
    querySelector:selector=>selector==='[data-message-author-role="assistant"]'?assistant:
      selector==='.AnswerItem'?zhihu:null,
    querySelectorAll:selector=>{
      assert.equal(selector,'h1,h2,h3,h4,h5,h6');
      return headings.filter(node=>node.isConnected);
    }};
}

test('R1.8.2 ChatGPT uses only assistant Markdown headings, preserving H1-H6 and exact duplicates',()=>{
  const body=new Node('body','BODY'),user=new Node('user','DIV',body);
  const userText=new Node('markdown','DIV',user);
  const assistant1=new Node('assistant','DIV',body),text1=new Node('markdown','DIV',assistant1);
  const assistant2=new Node('assistant','DIV',body),text2=new Node('markdown','DIV',assistant2);
  const titles=['周末城市公园活动计划','准备','路线','活动','收尾感','附录'];
  const headings=[
    new Node('heading','H2',user,'你说：'),
    new Node('heading','H2',userText,'用户的标题'),
    new Node('heading','H2',assistant1,'ChatGPT 说：'),
    ...titles.map((title,i)=>new Node('heading','H'+(i+1),text1,title)),
    new Node('heading','H2',assistant2,'回答二'),
    new Node('heading','H3',text2,'路线')
  ];
  const index=createReadingTocIndex(docFor(body,headings,{assistant:assistant1}));
  const snapshot=index.rebuild();
  assert.equal(snapshot.adapter,'chatgpt');
  assert.deepEqual(snapshot.items.map(row=>row.label),[...titles,'路线']);
  assert.deepEqual(snapshot.items.map(row=>row.rank),[1,2,3,4,5,6,3]);
  assert.deepEqual(snapshot.items.map(row=>row.depth),[0,1,2,3,4,5,0]);
  assert.equal(snapshot.sources.length,2);
  assert.notEqual(snapshot.items[2].sourceId,snapshot.items[6].sourceId);
  assert.notEqual(snapshot.items[2].id,snapshot.items[6].id);
  assert.equal(index.resolve(snapshot.items[2].id,snapshot.items[6].sourceId),null);
  assert.equal(index.resolve(snapshot.items[2].id,snapshot.items[2].sourceId)?.label,'路线');
});

test('R1.8.2 ChatGPT without an assistant or known Markdown boundary fails closed',()=>{
  const body=new Node('body','BODY'),user=new Node('user','DIV',body);
  const fakeTitle=new Node('heading','H1',user,'你说：');
  for(const host of ['chatgpt.com','chat.openai.com']){
    const result=createReadingTocIndex(docFor(body,[fakeTitle],{host})).rebuild();
    assert.equal(result.adapter,'chatgpt');
    assert.deepEqual(result.items,[]);
  }
  const assistant=new Node('assistant','DIV',body);
  const roleTitle=new Node('heading','H2',assistant,'ChatGPT 说：');
  const index=createReadingTocIndex(docFor(body,[roleTitle],{assistant}));
  assert.deepEqual(index.rebuild().items,[],'assistant chrome without Markdown is not answer text');
});

test('R1.8.2 streamed edits, replacement and conversation switch never leave stale IDs',()=>{
  const body=new Node('body','BODY');
  const assistant=new Node('assistant','DIV',body),markdown=new Node('markdown','DIV',assistant);
  const h1=new Node('heading','H1',markdown,'计划'),h2=new Node('heading','H2',markdown,'准备');
  const headings=[h1,h2],index=createReadingTocIndex(docFor(body,headings,{assistant}));
  const first=index.rebuild(),original=first.items[1];
  assert.deepEqual(first.items.map(x=>x.label),['计划','准备']);
  const h3=new Node('heading','H3',markdown,'流式生成的标题');
  headings.push(h3);
  const streamed=index.rebuild();
  assert.equal(streamed.items.at(-1).label,'流式生成的标题');
  h2.textContent='准备（修订）';
  assert.equal(index.rebuild().items[1].id,original.id);
  assert.equal(index.rebuild().items[1].label,'准备（修订）');
  h2.isConnected=false;
  const removed=index.rebuild();
  assert(!removed.items.some(row=>row.id===original.id));
  assert.equal(index.resolve(original.id,original.sourceId),null,'removed DOM node cannot navigate');
  const answer2=new Node('assistant','DIV',body),text2=new Node('markdown','DIV',answer2);
  headings.splice(0,headings.length,new Node('heading','H1',text2,'新对话'));
  const switched=index.rebuild();
  assert.deepEqual(switched.items.map(row=>row.label),['新对话']);
  assert.notEqual(switched.items[0].id,first.items[0].id,'a new conversation owns new DOM identities');
});

test('R1.8.2 irrelevant headings do not consume the 300-entry quota or truncate AI titles',()=>{
  const body=new Node('body','BODY'),assistant=new Node('assistant','DIV',body);
  const markdown=new Node('markdown','DIV',assistant);
  const title='标题'.repeat(130);
  const heading=new Node('heading','H2',markdown,title);
  const outside=Array.from({length:340},(_,i)=>new Node('heading','H3',body,'导航 '+i));
  const result=createReadingTocIndex(docFor(body,[...outside,heading],{assistant})).rebuild();
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].label,title,'AI heading text is not cut off');
});

test('R1.8.2 ordinary article and Zhihu modes keep their existing heading extraction',()=>{
  const body=new Node('body','BODY');
  const article=new Node('article','ARTICLE',body),chapter=new Node('heading','H2',article,'文章章节');
  const normal=createReadingTocIndex(docFor(body,[chapter],{host:'example.org'})).rebuild();
  assert.equal(normal.adapter,'article');
  assert.deepEqual(normal.items.map(x=>x.label),['文章章节']);
  const answer=new Node('zhihu','DIV',body),topic=new Node('heading','H2',answer,'知乎回答标题');
  const zhihu=createReadingTocIndex(docFor(body,[topic],{host:'www.zhihu.com',zhihu:answer})).rebuild();
  assert.equal(zhihu.adapter,'zhihu');
  assert.deepEqual(zhihu.items.map(x=>x.label),['知乎回答标题']);
});


test('R1.8.6 live ChatGPT transcript layout keeps only assistant markdown and distinct answers',()=>{
  const body=new Node('body','BODY'),transcript=new Node('transcript','OL',body);
  const user=new Node('user','LI',transcript),a=new Node('assistant-new','LI',transcript),b=new Node('assistant-new','LI',transcript);
  const aText=new Node('markdown-new','DIV',a),bText=new Node('markdown-new','DIV',b);
  const orphan=new Node('assistant-new','LI',body);
  const headings=[new Node('heading','H2',user,'用户标题'),new Node('heading','H4',a,'ChatGPT 说：'),
    new Node('heading','H2',aText,'重复标题'),new Node('heading','H2',bText,'重复标题'),
    new Node('heading','H2',orphan,'未知容器'),new Node('heading','H2',new Node('markdown-new','DIV',orphan),'未确认对话')];
  const index=createReadingTocIndex(docFor(body,headings));
  const snapshot=index.rebuild();
  assert.deepEqual(snapshot.items.map(row=>row.label),['重复标题','重复标题']);
  assert.equal(snapshot.sources.length,2);
  assert.notEqual(snapshot.items[0].sourceId,snapshot.items[1].sourceId);
  assert.notEqual(snapshot.items[0].id,snapshot.items[1].id);
  assert.equal(index.resolve(snapshot.items[0].id,snapshot.items[1].sourceId),null);
});

test('R1.9.2 observed ChatGPT message-selection layout indexes three independent answers',()=>{
  const body=new Node('body','BODY'),headings=[];
  const answer=(message,conversation='conversation-a')=>new Node('selection','DIV',body,'',{
    'data-chatgpt-selection-message-id':message,
    'data-chatgpt-selection-conversation-id':conversation
  });
  const markdown=parent=>new Node('content','DIV',parent,'',{
    'data-markdown-text-style':'assistant-message'
  });
  for(const id of ['answer-a','answer-b','answer-c']){
    const root=answer(id),text=markdown(root);
    headings.push(new Node('heading','H2',root,'ChatGPT 说：'),
      new Node('heading','H2',text,'重复标题'),
      new Node('heading','H3',markdown(root),'子章节'));
  }
  const user=answer('user-message');
  headings.unshift(new Node('heading','H2',new Node('content','DIV',user,'',{
    'data-markdown-text-style':'user-message'
  }),'用户标题'));
  const index=createReadingTocIndex(docFor(body,headings)),first=index.rebuild();
  assert.equal(first.adapter,'chatgpt');
  assert.equal(first.sources.length,3);
  assert.deepEqual(first.items.map(x=>x.label),['重复标题','子章节','重复标题','子章节','重复标题','子章节']);
  assert.deepEqual(first.items.map(x=>x.depth),[0,1,0,1,0,1]);
  assert.equal(new Set(first.items.map(x=>x.id)).size,6);
  const [a,,b]=first.items;
  assert.notEqual(a.sourceId,b.sourceId);
  assert.equal(index.resolve(a.id,b.sourceId),null);
  assert.equal(index.resolve(a.id,a.sourceId)?.element,headings[2]);
  for(const heading of headings)heading.isConnected=false;
  const replacement=new Node('heading','H2',markdown(answer('next-answer','conversation-b')),'历史对话章节');
  headings.push(replacement);
  const switched=index.rebuild();
  assert.deepEqual(switched.items.map(x=>x.label),['历史对话章节']);
  assert.notEqual(switched.items[0].sourceId,a.sourceId);
  assert.equal(index.resolve(a.id,a.sourceId),null,'old conversation cannot navigate');
  assert.equal(index.resolve(switched.items[0].id,switched.items[0].sourceId)?.element,replacement);
});

test('R1.9.2 ChatGPT selection metadata alone never admits user or orphan headings',()=>{
  const body=new Node('body','BODY');
  const root=new Node('selection','DIV',body,'',{
    'data-chatgpt-selection-message-id':'message',
    'data-chatgpt-selection-conversation-id':'conversation'
  });
  const empty=new Node('selection','DIV',body,'',{
    'data-chatgpt-selection-message-id':'',
    'data-chatgpt-selection-conversation-id':'conversation'
  });
  const markdown=parent=>new Node('content','DIV',parent,'',{
    'data-markdown-text-style':'assistant-message'
  });
  const headings=[new Node('heading','H2',root,'消息控件'),
    new Node('heading','H2',markdown(body),'孤立内容'),
    new Node('heading','H2',markdown(empty),'缺少消息身份')];
  assert.deepEqual(createReadingTocIndex(docFor(body,headings)).rebuild().items,[]);
});
