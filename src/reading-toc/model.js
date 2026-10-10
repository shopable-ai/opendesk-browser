// Trusted content index. Identities are DOM-element and answer-container based,
// never a website's potentially duplicate/hostile id or the text of a heading.
export function createReadingTocIndex(doc) {
  const headingKeys=new WeakMap(),sourceKeys=new WeakMap();
  let serial=0,sourceSerial=0,revision=0,model=[],sources=[],byId=new Map();
  let adapter='article';
  const idFor=(element,table,prefix)=> {
    let value=table.get(element);
    if(!value){value=prefix+(prefix==='h-'?++serial:++sourceSerial);table.set(element,value);}
    return value;
  };
  function visible(heading) {
    if(!heading.isConnected || !heading.getClientRects?.().length ||
       heading.closest('pre,code,nav,aside,footer,template,[hidden],[aria-hidden="true"],[inert],[role="navigation"],[contenteditable="true"],[data-opendesk-toc-root]'))
      return false;
    const style=doc.defaultView?.getComputedStyle?.(heading);
    return style?.display!=='none' && style?.visibility!=='hidden' &&
      Boolean(heading.textContent?.trim());
  }
  function sourceRoot(heading,kind) {
    if(kind==='chatgpt')return heading.closest('[data-message-author-role="assistant"]');
    if(kind==='zhihu')return heading.closest('.AnswerItem');
    return heading.closest('article')||heading.closest('main,[role="main"]')||doc.body;
  }
  function certainArticleTitle(heading,root) {
    if(heading.tagName!=='H1')return false;
    const article=heading.closest('article');
    if(!article||root!==article)return false;
    // Only the semantic article title may be suppressed. Section headers
    // regularly contain legitimate H2-H6 and must remain navigable.
    if(heading.matches?.('[data-toc-document-title],[itemprop="headline"]'))return true;
    const header=heading.closest('header');
    return Boolean(header&&header.parentElement===article&&header.querySelector('h1')===heading);
  }
  function rebuild() {
    const next=[],groupMap=new Map(),stacks=new Map(),nextSources=[];
    const hasChat=Boolean(doc.querySelector('[data-message-author-role="assistant"]'));
    const hasZhihu=!hasChat&&Boolean(doc.querySelector('.AnswerItem'));
    adapter=hasChat?'chatgpt':hasZhihu?'zhihu':'article';
    const nodes=doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for(const heading of nodes) {
      if(next.length>=300)break;
      if(!visible(heading))continue;
      const root=sourceRoot(heading,adapter);
      if(!root)continue; // No cross-answer inferred grouping.
      if(adapter==='article'&&certainArticleTitle(heading,root))continue;
      const label=heading.textContent.replace(/\s+/g,' ').trim().slice(0,200);
      if(!label)continue;
      const sourceId=idFor(root,sourceKeys,'s-');
      if(!groupMap.has(sourceId)) {
        if(nextSources.length>=40)continue;
        const kind=adapter==='article'?'article':'answer';
        const number=nextSources.length+1;
        const source={id:sourceId,label:kind==='answer'?'回答 '+number:(number===1?'当前网页':'正文 '+number),kind};
        groupMap.set(sourceId,source);nextSources.push(source);
      }
      const id=idFor(heading,headingKeys,'h-');
      const rank=Number(heading.tagName.slice(1));
      const stack=stacks.get(sourceId)||[];
      while(stack.length && stack[stack.length-1].rank>=rank)stack.pop();
      const parent=stack.at(-1);
      const item={id,sourceId,label,rank,depth:parent?parent.depth+1:0,
        topId:parent?parent.topId:id,element:heading};
      next.push(item);stack.push(item);stacks.set(sourceId,stack);
    }
    model=next;sources=nextSources;byId=new Map(next.map(item=>[item.id,item]));
    revision++;
    return snapshot();
  }
  function snapshot(activeId='') {
    return {revision,adapter,sources:sources.map(s=>({...s})),
      items:model.map(({element,...rest})=>rest),
      activeId:byId.has(activeId)?activeId:(model[0]?.id||'')};
  }
  function resolve(id,sourceId) {
    const result=byId.get(id);
    return result&&result.sourceId===sourceId&&result.element.isConnected?result:null;
  }
  return Object.freeze({rebuild,snapshot,resolve,get items(){return model;},get revision(){return revision;}});
}
