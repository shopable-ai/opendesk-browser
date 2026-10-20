import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadingTocIndex} from '../../examples/sidebar-tools/reading-toc/trusted/model.js';

// Synthetic semantic headings only. The fixture keeps DOM ancestry, identity,
// document order and page geometry independent; it does not emulate layout.
class Node {
  constructor(tagName='DIV',parentElement=null,textContent='',attributes={},top=0){
    Object.assign(this,{tagName,parentElement,textContent,attributes,top,isConnected:true,hasLayout:true});
    this.style={display:'block',visibility:'visible'};
  }
  getAttribute(name){return this.attributes[name]??null;}
  getClientRects(){return this.isConnected&&this.hasLayout?[this.getBoundingClientRect()]:[];}
  getBoundingClientRect(){return {top:this.top};}
  matches(selector){
    return selector.split(',').some(simple=>{
      const attributes=[...simple.matchAll(/\[([\w-]+)(?:(~=|=)"([^"]*)")?\]/g)];
      const base=simple.replace(/\[[^\]]+\]/g,'');
      if(base.startsWith('.')&&!this.getAttribute('class')?.split(/\s+/).includes(base.slice(1)))return false;
      if(base.startsWith('#')&&this.getAttribute('id')!==base.slice(1))return false;
      if(base&&!base.startsWith('.')&&!base.startsWith('#')&&base.toUpperCase()!==this.tagName)return false;
      return attributes.every(([,name,operator,value])=>{
        const actual=this.getAttribute(name);
        return operator==='~='?actual?.split(/\s+/).includes(value):operator==='='?actual===value:actual!==null;
      });
    });
  }
  closest(selector){
    for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;
    return null;
  }
}

function writingCard(parent){
  const surface=new Node('DIV',parent,'',{class:'group other-token group/writing-block-surface'});
  const editor=new Node('DIV',surface,'',{class:'ProseMirror prose',contenteditable:'true'});
  return {surface,editor};
}

function assistantAnswer(parent){
  const turn=new Node('DIV',parent,'',{'data-message-author-role':'assistant'});
  return new Node('DIV',turn,'',{class:'markdown'});
}

function docFor(body,headings,host='chatgpt.com'){
  return {
    body,location:{hostname:host},
    defaultView:{getComputedStyle:heading=>heading.style},
    querySelector:selector=>{
      for(const heading of headings){
        if(!heading.isConnected)continue;
        const node=heading.closest(selector);
        if(node)return node;
      }
      return null;
    },
    querySelectorAll:selector=>{
      assert.equal(selector,'h1,h2,h3,h4,h5,h6');
      return headings.filter(heading=>heading.isConnected);
    },
  };
}

test('ChatGPT portal Writing H1/H2/H3 form an independent source beside assistant Markdown',async t=>{
  for(const host of ['chatgpt.com','chat.openai.com']){
    await t.test(host,()=>{
      const body=new Node('BODY');
      const answer=new Node('H2',assistantAnswer(body),'回答说明',{},10);
      const {surface,editor}=writingCard(body);
      const chapters=[new Node('H1',editor,'合成计划',{},100),
        new Node('H2',editor,'准备',{},120),new Node('H3',editor,'材料',{},140)];
      assert.equal(surface.parentElement,body,'the portal is outside the assistant turn');
      assert.equal(chapters[0].closest('[data-message-author-role="assistant"]'),null);
      const index=createReadingTocIndex(docFor(body,[answer,...chapters],host));
      const snapshot=index.rebuild();
      assert.equal(snapshot.adapter,'chatgpt');
      assert.deepEqual(snapshot.items.map(({label,rank,depth})=>({label,rank,depth})),[
        {label:'回答说明',rank:2,depth:0},{label:'合成计划',rank:1,depth:0},
        {label:'准备',rank:2,depth:1},{label:'材料',rank:3,depth:2},
      ]);
      assert.equal(snapshot.sources.length,2);
      const [answerRow,...writingRows]=snapshot.items;
      const sourceId=writingRows[0].sourceId;
      assert.notEqual(sourceId,answerRow.sourceId);
      assert.ok(writingRows.every(row=>row.sourceId===sourceId));
      assert.match(snapshot.sources.find(source=>source.id===sourceId).label,/^写作内容 /);
      assert.equal(writingRows[1].parentId,writingRows[0].id);
      assert.equal(writingRows[2].parentId,writingRows[1].id);
      assert.equal(writingRows[2].topId,writingRows[0].id);
      writingRows.forEach((row,i)=>assert.equal(index.resolve(row.id,row.sourceId)?.element,chapters[i]));
    });
  }
});

test('same-named chapters in separate Writing cards never resolve through another source',()=>{
  const body=new Node('BODY'),portal=new Node('DIV',body);
  const cards=[writingCard(portal),writingCard(portal)];
  const headings=cards.flatMap(({editor},i)=>[
    new Node('H1',editor,'同名计划',{id:'duplicate-title'},100+i*100),
    new Node('H2',editor,'同名章节',{id:'duplicate-section'},120+i*100),
  ]);
  const index=createReadingTocIndex(docFor(body,headings)),snapshot=index.rebuild();
  assert.deepEqual(snapshot.items.map(row=>row.label),['同名计划','同名章节','同名计划','同名章节']);
  assert.equal(snapshot.sources.length,2);
  assert.equal(new Set(snapshot.items.map(row=>row.id)).size,4);
  const [first,firstChild,second,secondChild]=snapshot.items;
  assert.notEqual(first.sourceId,second.sourceId);
  assert.equal(firstChild.sourceId,first.sourceId);
  assert.equal(secondChild.sourceId,second.sourceId);
  assert.equal(firstChild.parentId,first.id);
  assert.equal(secondChild.parentId,second.id);
  snapshot.items.forEach((row,i)=>{
    const otherSource=row.sourceId===first.sourceId?second.sourceId:first.sourceId;
    assert.equal(index.resolve(row.id,row.sourceId)?.element,headings[i]);
    assert.equal(index.resolve(row.id,otherSource),null);
  });
});

test('Writing recognition keeps composer, form, user messages and unknown editors excluded',async t=>{
  const cases=[
    ['composer',body=>writingCard(new Node('DIV',body,'',{id:'prompt-textarea'})).editor],
    ['form',body=>writingCard(new Node('FORM',body)).editor],
    ['user role',body=>writingCard(new Node('DIV',body,'',{'data-message-author-role':'user'})).editor],
    ['transcript user role',body=>writingCard(new Node('DIV',body,'',{'data-message-role':'user'})).editor],
    ['ordinary composer',body=>new Node('DIV',body,'',{id:'prompt-textarea',contenteditable:'true'})],
    ['unknown ProseMirror editor',body=>new Node('DIV',body,'',{class:'ProseMirror',contenteditable:'true'})],
    ['unknown editor in a known surface',body=>{
      const {surface}=writingCard(body);
      return new Node('DIV',surface,'',{contenteditable:'true'});
    }],
    ['similar surface class is not a class-token match',body=>{
      const surface=new Node('DIV',body,'',{class:'group/writing-block-surface-extra'});
      return new Node('DIV',surface,'',{class:'ProseMirror',contenteditable:'true'});
    }],
  ];
  for(const [name,parentFor] of cases){
    await t.test(name,()=>{
      const body=new Node('BODY'),{editor}=writingCard(body);
      const safe=new Node('H2',editor,'有效写作章节',{},10);
      const blocked=new Node('H2',parentFor(body),'排除的标题',{},20);
      const index=createReadingTocIndex(docFor(body,[safe,blocked]));
      assert.deepEqual(index.rebuild().items.map(row=>row.label),['有效写作章节']);
      assert.equal(index.items[0].element,safe);
    });
  }
});

test('Writing-shaped editable content remains excluded on non-ChatGPT sites',()=>{
  for(const host of ['example.org','chatgpt.com.example.org']){
    const body=new Node('BODY'),{editor}=writingCard(body);
    const ordinary=new Node('H2',body,'普通网页章节');
    const writing=new Node('H2',editor,'仿写作卡片章节');
    const index=createReadingTocIndex(docFor(body,[ordinary,writing],host));
    const snapshot=index.rebuild();
    assert.equal(snapshot.adapter,'article');
    assert.deepEqual(snapshot.items.map(row=>row.label),['普通网页章节']);
    assert.equal(index.items[0].element,ordinary);
  }
});

test('known Writing cards do not admit pre, code or hidden headings',async t=>{
  const cases=[
    ['pre',editor=>new Node('H2',new Node('PRE',editor),'隐藏标题')],
    ['code',editor=>new Node('H2',new Node('CODE',editor),'隐藏标题')],
    ['hidden ancestor',editor=>new Node('H2',new Node('DIV',editor,'',{hidden:''}),'隐藏标题')],
    ['aria-hidden ancestor',editor=>new Node('H2',new Node('DIV',editor,'',{'aria-hidden':'true'}),'隐藏标题')],
    ['inert ancestor',editor=>new Node('H2',new Node('DIV',editor,'',{inert:''}),'隐藏标题')],
    ['display none',editor=>{
      const heading=new Node('H2',editor,'隐藏标题');heading.style.display='none';return heading;
    }],
    ['visibility hidden',editor=>{
      const heading=new Node('H2',editor,'隐藏标题');heading.style.visibility='hidden';return heading;
    }],
    ['no client rects',editor=>{
      const heading=new Node('H2',editor,'隐藏标题');heading.hasLayout=false;return heading;
    }],
    ['disconnected',editor=>{
      const heading=new Node('H2',editor,'隐藏标题');heading.isConnected=false;return heading;
    }],
    ['empty title',editor=>new Node('H2',editor,' \n\t ')],
  ];
  for(const [name,headingFor] of cases){
    await t.test(name,()=>{
      const body=new Node('BODY'),{editor}=writingCard(body);
      const safe=new Node('H1',editor,'可见写作标题',{},10);
      const index=createReadingTocIndex(docFor(body,[safe,headingFor(editor)]));
      assert.deepEqual(index.rebuild().items.map(row=>row.label),['可见写作标题']);
      assert.equal(index.items[0].element,safe);
    });
  }
});

test('portaled Writing cards follow page y positions across answers instead of portal DOM order',()=>{
  const body=new Node('BODY');
  const firstAnswer=new Node('H2',assistantAnswer(body),'回答开头',{},10);
  const lastAnswer=new Node('H2',assistantAnswer(body),'回答结尾',{},400);
  const late=writingCard(body),early=writingCard(body);
  const headings=[firstAnswer,lastAnswer,
    new Node('H1',late.editor,'后卡标题',{},300),new Node('H2',late.editor,'后卡章节',{},320),
    new Node('H1',early.editor,'前卡标题',{},100),new Node('H2',early.editor,'前卡章节',{},120)];
  const doc=docFor(body,headings),index=createReadingTocIndex(doc);
  const snapshot=index.rebuild();
  assert.deepEqual(doc.querySelectorAll('h1,h2,h3,h4,h5,h6').map(heading=>heading.textContent),
    ['回答开头','回答结尾','后卡标题','后卡章节','前卡标题','前卡章节']);
  assert.deepEqual(snapshot.items.map(row=>row.label),
    ['回答开头','前卡标题','前卡章节','后卡标题','后卡章节','回答结尾']);
  const [first,earlyTitle,earlyChild,lateTitle,lateChild,last]=snapshot.items;
  assert.deepEqual(snapshot.sources.map(source=>source.id),
    [first.sourceId,earlyTitle.sourceId,lateTitle.sourceId,last.sourceId]);
  assert.equal(new Set(snapshot.sources.map(source=>source.id)).size,4);
  assert.equal(earlyChild.parentId,earlyTitle.id);
  assert.equal(lateChild.parentId,lateTitle.id);
  assert.equal(index.resolve(earlyTitle.id,earlyTitle.sourceId)?.element,headings[4]);
  assert.equal(index.resolve(lateTitle.id,lateTitle.sourceId)?.element,headings[2]);
});

test('Writing title edits retain DOM identity while deletion and same-text replacement invalidate old IDs',()=>{
  const body=new Node('BODY'),{editor}=writingCard(body);
  const title=new Node('H1',editor,'合成计划',{},10);
  const section=new Node('H2',editor,'准备',{id:'stable-dom-id'},20);
  const headings=[title,section],index=createReadingTocIndex(docFor(body,headings));
  const original=index.rebuild().items[1];
  section.textContent='准备（修订）';
  const edited=index.rebuild().items[1];
  assert.equal(edited.id,original.id);
  assert.equal(edited.sourceId,original.sourceId);
  assert.equal(edited.label,'准备（修订）');
  assert.equal(section.getAttribute('id'),'stable-dom-id');
  assert.equal(index.resolve(original.id,original.sourceId)?.element,section);
  assert.equal(index.resolve(original.id,original.sourceId)?.label,'准备（修订）');

  section.isConnected=false;
  assert.equal(index.resolve(original.id,original.sourceId),null);
  assert.deepEqual(index.rebuild().items.map(row=>row.label),['合成计划']);
  assert.equal(index.resolve(original.id,original.sourceId),null);

  const replacement=new Node('H2',editor,'准备（修订）',{id:'stable-dom-id'},20);
  headings.splice(1,1,replacement);
  const replaced=index.rebuild().items[1];
  assert.notEqual(replaced.id,original.id,'same text and website ID do not reuse an old DOM identity');
  assert.equal(replaced.sourceId,original.sourceId,'the unchanged card keeps its source');
  assert.equal(index.resolve(original.id,original.sourceId),null);
  assert.equal(index.resolve(replaced.id,replaced.sourceId)?.element,replacement);

  replacement.isConnected=false;
  const nextReplacement=new Node('H2',editor,'准备（修订）',{id:'stable-dom-id'},20);
  headings.splice(1,1,nextReplacement);
  assert.equal(index.resolve(replaced.id,replaced.sourceId),null);
  const directlyReplaced=index.rebuild().items[1];
  assert.notEqual(directlyReplaced.id,replaced.id,'direct replacement also invalidates the old ID');
  assert.equal(directlyReplaced.sourceId,replaced.sourceId);
  assert.equal(index.resolve(replaced.id,replaced.sourceId),null);
  assert.equal(index.resolve(directlyReplaced.id,directlyReplaced.sourceId)?.element,nextReplacement);
});
