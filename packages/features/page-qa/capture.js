// Serialized by chrome.scripting.executeScript({func}). MUST stay closure-free.
// Snapshot excludes input values, HTML, cookies, link targets and query/fragment tokens.
export function capturePage() {
  const MAX_ELEMENTS=1500;
  if(!['http:','https:'].includes(globalThis.location?.protocol))
    throw Error('Page QA only inspects ordinary HTTP(S) tabs');
  const doc=globalThis.document;
  if(!doc?.documentElement)throw Error('Page document is not available');
  const selectorFor=element=>{
    const id=element.id;
    if(typeof id==='string'&&id.length&&id.length<=100&&globalThis.CSS?.escape) {
      const byId='#'+globalThis.CSS.escape(id);
      if(doc.querySelectorAll(byId).length===1)return byId;
    }
    const sections=[];
    let node=element;
    while(node&&node.nodeType===1&&sections.length<10) {
      const tag=node.tagName.toLowerCase();
      if(!/^[a-z][a-z0-9-]*$/.test(tag))break;
      let number=1,sibling=node.previousElementSibling;
      while(sibling){if(sibling.tagName===node.tagName)number++;sibling=sibling.previousElementSibling;}
      sections.unshift(tag+':nth-of-type('+number+')');
      node=node.parentElement;
    }
    return sections.join(' > ').slice(0,400);
  };
  const accessibleName=element=>{
    const label=element.getAttribute('aria-label');
    if(label?.trim())return true;
    const labelled=element.getAttribute('aria-labelledby');
    if(labelled?.trim()) {
      for(const id of labelled.trim().split(/\s+/).slice(0,8)) {
        if(doc.getElementById(id)?.textContent?.trim())return true;
      }
    }
    if(element.getAttribute('title')?.trim())return true;
    return Boolean(element.textContent?.trim()||
      element.querySelector?.('img[alt]:not([alt=""])')||
      element.querySelector?.('svg title'));
  };
  const nodes=doc.querySelectorAll('img,button,a[href],input,textarea,select,h1,h2,h3,h4,h5,h6');
  const elements=[];
  for(let i=0;i<Math.min(nodes.length,MAX_ELEMENTS);i++) {
    const el=nodes[i],tag=el.tagName.toLowerCase();
    const type=(tag==='input'?el.getAttribute('type')||'text':'').toLowerCase();
    elements.push({
      tag,selector:selectorFor(el),type,
      hasAlt:tag==='img'?el.hasAttribute('alt'):undefined,
      hasName:['button','a'].includes(tag)?accessibleName(el):undefined,
      hasLabel:['input','textarea','select'].includes(tag)?
        Boolean(el.labels?.length||accessibleName(el)):undefined,
      headingLevel:/^h[1-6]$/.test(tag)?Number(tag[1]):undefined
    });
  }
  const address=new URL(globalThis.location.href);
  return {
    schema:'opendesk.page-qa.snapshot.v1',
    page:{
      url:address.origin+address.pathname,
      title:String(doc.title||'').slice(0,160),
      lang:String(doc.documentElement.getAttribute('lang')||'').slice(0,32)
    },
    inspected:elements.length,
    truncated:nodes.length>MAX_ELEMENTS,
    elements
  };
}
