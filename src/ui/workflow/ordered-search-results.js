import {ORDERED_SEARCH_SELECTION} from '../../framework/workflow/ordered-search-source.js';

export function requiresOrderedSearchResults(goal) {
  if(typeof goal!=='string')return false;
  const instruction=goal.replace(/((?:搜索|查找|检索|填入|填写|输入|\b(?:search|fill|type)\b)\s*)(?:「[^」]*」|『[^』]*』|“[^”]*”|‘[^’]*’|"[^"]*")/gi,'$1')
    .replace(/(?:不要|不需|无需|不得|别|禁止|勿|do\s+not|don't|never)\s*(?:点击|按下|提交|搜索|查找|检索|跳转|打开|进入|填写|填入|输入|查看|读取|提取|读回|观察|检查|press|click|submit|search|open|navigate|fill|type|read|extract|observe|inspect|check)[^，,。；;\n]*/gi,'');
  return /(?:读取|提取|读回|列出|给出|告诉|\b(?:read|extract|list|show|tell)\b)/i.test(instruction)&&
    /(?:前\s*(?:三|3)\s*(?:条|项|个)|\b(?:top|first)\s+(?:three|3)\b)/i.test(instruction)&&
    /(?:自然(?:搜索)?结果|搜索结果|\b(?:organic|search)\s+results?\b)/i.test(instruction)&&
    /(?:标题|网址|链接|\b(?:titles?|urls?|addresses?)\b)/i.test(instruction);
}

// Called only after the exact frozen Controller's durable Run/Result has been
// verified. Model prose and planning summaries never reach this oracle.
export function verifyOrderedSearchResults({workflow,values,target,request}={}) {
  if(!requiresOrderedSearchResults(request)||!values||!target?.documentId)return null;
  let source;
  try{source=new URL(target.url);}catch{return null;}
  const queries=source.searchParams.getAll('q'),query=queries[0];
  if(source.origin!=='https://www.google.com'||source.pathname!=='/search'||
    source.origin!==target.origin||queries.length!==1||!query?.trim()||query.length>120||
    !request.toLocaleLowerCase().includes(query.toLocaleLowerCase()))return null;
  for(const step of workflow?.steps||[]) {
    const value=values[step.stepId],read=value?.orderedResults;
    if(step.op!=='observe'||value?.kind!=='semantic-dom-summary'||
      value.document?.documentId!==target.documentId||value.document.url!==target.url||
      read?.kind!=='ordered-search-results'||read.version!==1||read.query!==query||
      read.document?.documentId!==target.documentId||read.document.url!==target.url||
      !read.selection||Object.entries(ORDERED_SEARCH_SELECTION).some(([key,expected])=>
        read.selection[key]!==expected)||
      !Number.isSafeInteger(read.selection.scanned)||read.selection.scanned<3||
      read.selection.scanned>ORDERED_SEARCH_SELECTION.scanLimit||
      !Number.isSafeInteger(read.selection.excluded)||read.selection.excluded<0||
      read.selection.excluded!==read.selection.scanned-3||
      !Array.isArray(read.items)||read.items.length!==3)continue;
    const seen=new Set();
    if(!read.items.every((item,index)=>{
      if(item?.position!==index+1||typeof item.title!=='string'||!item.title.trim()||
        item.title.length>300||typeof item.href!=='string'||item.href.length>2048||seen.has(item.href))return false;
      let url;try{url=new URL(item.href);}catch{return false;}
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href!==item.href)return false;
      seen.add(item.href);return true;
    }))continue;
    return structuredClone(read);
  }
  return null;
}
