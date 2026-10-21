// Build selected content from connected nodes: Range.cloneContents() loses
// stylesheet visibility and can inadvertently export hidden page text.
export function cloneVisibleSelection(range,doc,win){
  const fragment=doc.createDocumentFragment();
  let visited=0;
  const hidden=element=>{
    if(element.hidden||element.inert||element.getAttribute('aria-hidden')==='true')return true;
    const style=win.getComputedStyle(element);
    return style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.contentVisibility==='hidden';
  };
  const root=range.commonAncestorContainer;
  for(let ancestor=root.nodeType===1?root:root.parentElement;ancestor;ancestor=ancestor.parentElement){
    if(hidden(ancestor))throw new Error('选区没有可剪藏的可见内容');
  }
  const visit=node=>{
    if(++visited>9000)throw new Error('选区结构超过处理上限，请缩小范围');
    if(!range.intersectsNode(node))return null;
    if(node.nodeType===3){
      const start=node===range.startContainer?range.startOffset:0;
      const end=node===range.endContainer?range.endOffset:node.nodeValue.length;
      return start<end?doc.createTextNode(node.nodeValue.slice(start,end)):null;
    }
    if(node.nodeType!==1||hidden(node))return null;
    const copy=node.cloneNode(false);
    if(node.tagName==='OL'){
      const items=[...node.children].filter(child=>child.tagName==='LI');
      const index=items.findIndex(child=>range.intersectsNode(child));
      if(index>0)copy.setAttribute('start',String(Number(node.getAttribute('start')||1)+index));
    }
    for(const child of node.childNodes){
      if(!range.intersectsNode(child))continue;
      const selected=visit(child);
      if(selected)copy.appendChild(selected);
    }
    return copy.childNodes.length||['IMG','BR','HR'].includes(node.tagName)?copy:null;
  };
  let selected=visit(root);
  // Preserve semantic ancestors even when both endpoints are inside one text
  // node. Ancestors contain ONLY the selected branch, never their siblings.
  for(let parent=root.parentElement;selected&&parent&&parent!==doc.body&&parent!==doc.documentElement;parent=parent.parentElement){
    if(++visited>9000)throw new Error('选区结构超过处理上限，请缩小范围');
    const copy=parent.cloneNode(false);
    if(parent.tagName==='OL'){
      const items=[...parent.children].filter(child=>child.tagName==='LI');
      const index=items.findIndex(child=>range.intersectsNode(child));
      if(index>0)copy.setAttribute('start',String(Number(parent.getAttribute('start')||1)+index));
    }
    copy.appendChild(selected);selected=copy;
  }
  if(selected)fragment.appendChild(selected);
  return fragment;
}

