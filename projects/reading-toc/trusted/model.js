import {selectReadingTocOverview} from './overview.js';

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
  function writingSurface(heading) {
    const host=String(doc.location?.hostname||doc.defaultView?.location?.hostname||'').toLowerCase();
    if(host!=='chatgpt.com'&&host!=='chat.openai.com')return null;
    const editor=heading.closest('.ProseMirror[contenteditable="true"]');
    if(!editor||editor.closest('form,#prompt-textarea,[data-message-author-role="user"],[data-message-role="user"]'))return null;
    return editor.closest('[class~="group/writing-block-surface"]');
  }
  function visible(heading) {
    // ChatGPT's delivered Writing card is an editor too. Keep the composer
    // and arbitrary editable regions excluded; admit only this known card.
    const writing=adapter==='chatgpt'&&writingSurface(heading);
    if(!heading.isConnected || !heading.getClientRects?.().length ||
        heading.closest('pre,code,nav,aside,footer,template,[hidden],[aria-hidden="true"],[inert],[role="navigation"],[data-opendesk-toc-root]'+(writing?'':',[contenteditable="true"]')))
      return false;
    const style=doc.defaultView?.getComputedStyle?.(heading);
    return style?.display!=='none' && style?.visibility!=='hidden' &&
      Boolean(heading.textContent?.trim());
  }
  function sourceRoot(heading,kind) {
    if(kind==='chatgpt'){
      const root=heading.closest('[data-message-author-role="assistant"]');
      const markdown=heading.closest('.markdown');
      // Role labels and controls in an assistant turn are not Markdown answer content.
      // Unknown ChatGPT layouts fail closed instead of indexing arbitrary chrome.
      if(root&&markdown?.closest('[data-message-author-role="assistant"]')===root)return root;
      // Observed ChatGPT transcript layout (2026-10): answer content still
      // requires both an assistant turn and its explicit Markdown boundary.
      const turn=heading.closest('[data-message-role="assistant"]');
      const content=heading.closest('[data-assistant-markdown-root]');
      if(turn?.closest('[data-conversation-transcript]')&&
         content?.closest('[data-message-role="assistant"]')===turn)return turn;
      // Current ChatGPT binds answer fragments to one selected message rather
      // than a role-bearing turn. Keep both the assistant content boundary and
      // its conversation/message owner; selection metadata alone is not content.
      const ownerSelector='[data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]';
      const owner=heading.closest(ownerSelector);
      const answer=heading.closest('[data-markdown-text-style="assistant-message"]');
      if(owner?.getAttribute('data-chatgpt-selection-message-id')?.trim()&&
        owner.getAttribute('data-chatgpt-selection-conversation-id')?.trim()&&
        answer?.closest(ownerSelector)===owner)return owner;
      // Writing cards may be portaled outside the assistant turn. Give each
      // card its own DOM-bound source instead of guessing an answer owner.
      return writingSurface(heading);
    }
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
  // Ordinary pages have one content area. Multiple <article> cards inside a
  // <main> belong to that area, not to separate selectable "sources".
  function primaryContentRoot(headings) {
    const dominant=selector=>{
      const counts=new Map();
      for(const heading of headings){
        const root=heading.closest?.(selector);
        if(root)counts.set(root,(counts.get(root)||0)+1);
      }
      let best=null,largest=0;
      for(const [root,count] of counts)if(count>largest){best=root;largest=count;}
      return best;
    };
    return dominant('main,[role="main"]')||dominant('article')||doc.body;
  }
  function withinRoot(heading,root) {
    if(root===doc.body)return true;
    for(let node=heading;node;node=node.parentElement)if(node===root)return true;
    return false;
  }
  function rebuild() {
    const next=[],groupMap=new Map(),stacks=new Map(),nextSources=[];
    const host=String(doc.location?.hostname||doc.defaultView?.location?.hostname||'').toLowerCase();
    const onChatGPT=host==='chatgpt.com'||host==='chat.openai.com';
    const hasChat=onChatGPT||Boolean(doc.querySelector('[data-message-author-role="assistant"]'));
    const hasZhihu=!hasChat&&Boolean(doc.querySelector('.AnswerItem'));
    adapter=hasChat?'chatgpt':hasZhihu?'zhihu':'article';
    const headings=[];
    for(const heading of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')){
      if(!visible(heading)||adapter==='chatgpt'&&!sourceRoot(heading,adapter))continue;
      headings.push(heading);
      if(headings.length>=300)break;
    }
    // The Writing portal's DOM position differs from its position in the
    // transcript. Preserve reading order using the real heading geometry.
    if(adapter==='chatgpt'&&headings.some(heading=>writingSurface(heading))){
      headings.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
    }
    const primaryRoot=adapter==='article'?primaryContentRoot(headings):null;
    for(const heading of headings) {
      const localRoot=sourceRoot(heading,adapter);
      const root=adapter==='article'?primaryRoot:localRoot;
      if(!root)continue; // No cross-answer inferred grouping.
      if(adapter==='article'&&(!withinRoot(heading,primaryRoot)||
        certainArticleTitle(heading,localRoot)))continue;
      const text=heading.textContent.replace(/\s+/g,' ').trim();
      const label=adapter==='chatgpt'?text:text.slice(0,200);
      if(!label)continue;
      const sourceId=idFor(root,sourceKeys,'s-');
      if(!groupMap.has(sourceId)) {
        if(nextSources.length>=40)continue;
        const kind=adapter==='article'?'article':'answer';
        const number=nextSources.length+1;
        const source={id:sourceId,label:kind==='answer'?
          (root===writingSurface(heading)?'写作内容 ':'回答 ')+number:
          (number===1?'当前网页':'正文 '+number),kind};
        groupMap.set(sourceId,source);nextSources.push(source);
      }
      const id=idFor(heading,headingKeys,'h-');
      const rank=Number(heading.tagName.slice(1));
      const stack=stacks.get(sourceId)||[];
      while(stack.length && stack[stack.length-1].rank>=rank)stack.pop();
      const parent=stack.at(-1);
      const item={id,sourceId,label,rank,depth:parent?parent.depth+1:0,
        parentId:parent?.id||null,topId:parent?parent.topId:id,element:heading};
      next.push(item);stack.push(item);stacks.set(sourceId,stack);
    }
    model=next;sources=nextSources;byId=new Map(next.map(item=>[item.id,item]));
    revision++;
    return snapshot();
  }
  function snapshot(activeId='') {
    const effectiveActive=byId.has(activeId)?activeId:(model[0]?.id||'');
    // One trusted summary algorithm powers both the webpage overlay and the
    // installed sandbox UI. Only IDs/metadata cross the sandbox boundary.
    const overview=Object.fromEntries(sources.map(source=>[
      source.id,selectReadingTocOverview(
        model.filter(item=>item.sourceId===source.id),effectiveActive)
    ]));
    return {revision,adapter,sources:sources.map(s=>({...s})),
      items:model.map(({element,...rest})=>rest),activeId:effectiveActive,overview};
  }
  function resolve(id,sourceId) {
    const result=byId.get(id);
    return result&&result.sourceId===sourceId&&result.element.isConnected?result:null;
  }
  return Object.freeze({rebuild,snapshot,resolve,get items(){return model;},get revision(){return revision;}});
}
