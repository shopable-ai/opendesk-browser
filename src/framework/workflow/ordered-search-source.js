// Fixed Controller source, shared by planning and compiled observe steps.
// This adds no navigation, evaluation, permission or completion authority.
export const ORDERED_SEARCH_SELECTION=Object.freeze({
  root:'#rso',item:'a:has(h3)',title:'h3',
  exclude:'[data-text-ad],[data-ad],[data-ad-slot],#tads,#bottomads,[aria-label="Sponsored" i],[aria-label="广告"]',
  order:'dom',limit:3,scanLimit:30
});

export const WORKFLOW_ORDERED_SEARCH_FUNCTION=
  'const __workflowOrderedSearchSelection='+JSON.stringify(ORDERED_SEARCH_SELECTION)+';\n'+
String.raw`async function __observeWorkflowOrderedSearch(request,document) {
  // Gate before even constructing a Locator. Ordinary observe mocks and home
  // pages need no additional API calls, including page.url().
  if(typeof request!=='string'||!document?.documentId||typeof document.url!=='string')return null;
  let url;
  try{url=new URL(document.url);}catch{return null;}
  const queries=url.searchParams.getAll('q');
  if(url.origin!=='https://www.google.com'||url.pathname!=='/search'||
    url.username||url.password||queries.length!==1)return null;
  const query=queries[0];
  if(!query.trim()||query.length>120||!request.toLocaleLowerCase().includes(query.toLocaleLowerCase()))return null;
  // Mirror the UI's explicit-read gate in this fixed Controller source. Search
  // operands and negated clauses are data, not instructions to read results.
  const instruction=request.replace(/((?:搜索|查找|检索|填入|填写|输入|\b(?:search|fill|type)\b)\s*)(?:「[^」]*」|『[^』]*』|“[^”]*”|‘[^’]*’|"[^"]*")/gi,'$1')
    .replace(/(?:不要|不需|无需|不得|别|禁止|勿|do\s+not|don't|never)\s*(?:点击|按下|提交|搜索|查找|检索|跳转|打开|进入|填写|填入|输入|查看|读取|提取|读回|观察|检查|press|click|submit|search|open|navigate|fill|type|read|extract|observe|inspect|check)[^，,。；;\n]*/gi,'')
    .toLocaleLowerCase().split(query.toLocaleLowerCase()).join(' ');
  if(!/(?:读取|提取|读回|列出|给出|告诉|\b(?:read|extract|list|show|tell)\b)/i.test(instruction)||
    !/(?:前\s*(?:三|3)\s*(?:条|项|个)|\b(?:top|first)\s+(?:three|3)\b)/i.test(instruction)||
    !/(?:自然(?:搜索)?结果|搜索结果|\b(?:organic|search)\s+results?\b)/i.test(instruction)||
    !/(?:标题|网址|链接|\b(?:titles?|urls?|addresses?)\b)/i.test(instruction))return null;
  const unchanged=async()=>{
    if(await page.url()!==document.url)
      throw Object.assign(new Error('Ordered search document URL changed'),{code:'E_DOCUMENT_STALE'});
  };
  await unchanged();
  const selection=__workflowOrderedSearchSelection,root=page.locator(selection.root),
    rootCount=await root.count(),items=[],seen=new Set();
  let scanned=0,excluded=0;
  if(rootCount>1)throw new Error('Ordered search root is not unique');
  if(rootCount===1){
    const candidates=root.locator(selection.item),count=await candidates.count();
    for(let i=0;i<Math.min(count,selection.scanLimit)&&items.length<selection.limit;i++){
      scanned++;
      const link=candidates.nth(i);
      // Native CSS ancestor matching works within the scoped Locator: the
      // heading must have no advertising ancestor, including outside #rso.
      const heading=link.locator(selection.title+':not(:is('+selection.exclude+') *)');
      if(!await link.isVisible()){
        excluded++;continue;
      }
      const headingCount=await heading.count();
      if(headingCount===0&&await link.locator(selection.title).count()>0){
        excluded++;continue;
      }
      // Ambiguous or vanished natural candidates cannot be replaced by a
      // later DOM rank. Only proven ads and invisible entries are excluded.
      if(headingCount!==1)break;
      if(!await heading.isVisible()){excluded++;continue;}
      const title=(await heading.innerText()).trim(),raw=await link.getAttribute('href');
      if(!title||title.length>300||typeof raw!=='string'||!raw||raw.length>2048||/[\u0000-\u0020\u007f]/.test(raw)){
        break;
      }
      let href;
      try{
        const target=new URL(raw,document.url);
        if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.href.length>2048){
          break;
        }
        href=target.href;
      }catch{break;}
      const item={position:items.length+1,title,href};
      // About 2 KiB per item, including the complete URL. Oversized evidence
      // stops this incomplete prefix; it is never shortened or replaced by
      // a fourth natural result. Successful reads satisfy excluded=scanned-3.
      if(seen.has(href)||new TextEncoder().encode(JSON.stringify(item)).byteLength>2304)break;
      seen.add(href);items.push(item);
    }
  }
  await unchanged();
  // Fewer than three items is partial evidence, never a completion claim.
  const result={kind:'ordered-search-results',version:1,
    document:{url:document.url,documentId:document.documentId},query,
    selection:{...selection,scanned,excluded},items};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>8*1024)
    throw new Error('Ordered search evidence exceeds observation budget');
  return result;
}
`;
