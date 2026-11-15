// One fixed, bounded read implementation shared by AI planning and compiled workflows.
// The original RunHost, Locator checks and Document pin remain the execution authority.
export const WORKFLOW_OBSERVE_FUNCTION=String.raw`async function __observeWorkflowPage(request='') {
  const first=await page.observe({maxDepth:8,maxNodes:48,maxChars:6000});
  const visible=first.nodes.filter(row=>row.state?.visible===true);
  const control=row=>['textbox','searchbox','combobox','button','link'].includes(row.role);
  const rows=[...visible].sort((a,b)=>Number(control(b))-Number(control(a))).slice(0,16),
    seen=new Set(rows.map(row=>JSON.stringify(row.locator)));
  const query=String(request||'').slice(0,512).replace(/\s+/g,'');
  let truncated=first.truncated===true||visible.length>16;
  if(query){
    const regions=page.locator('section[id],form[id],[id*="result" i],[role="list"]'),count=await regions.count();
    if(count>12)truncated=true;
    const roots=[];
    // Search forms need not have an id. Only select this generic root when
    // the live DOM proves it unique; never invent a site-specific selector.
    const unnamedForms=await page.locator('form:not([id])').count();
    if(unnamedForms===1)roots.push('form:not([id])');
    else if(unnamedForms>1)truncated=true;
    for(let i=0;i<Math.min(count,12);i++){
      const id=await regions.nth(i).getAttribute('id');
      if(!/^[A-Za-z][\w-]{0,79}$/.test(id||''))continue;
      roots.push('[id='+JSON.stringify(id)+']');
    }
    for(const root of roots){
      if(rows.length>=24){truncated=true;break;}
      const part=await page.observe({root,maxDepth:8,maxNodes:48,maxChars:6000});
      // A planning request may contain a short control label ("搜索"), while
      // a post-click effect observation may contain only the search term.
      // Match bounded, visible result text containing that term as well.
      const match=row=>row?.state?.visible===true&&[row.name,row.text].some(value=>{
        if(typeof value!=='string')return false;
        const text=value.replace(/\s+/g,'').toLocaleLowerCase();
        const term=query.toLocaleLowerCase();
        return text.length>=2&&text.length<=120&&
          (text.length<=40&&term.includes(text)||
            term.length>=2&&term.length<=120&&text.includes(term));
      });
      if(!part.nodes.some(match))continue;
      for(const row of [...part.nodes].sort((a,b)=>Number(match(b))-Number(match(a)))){
        if(!row.locator||row.locator.parent||row.state?.visible!==true)continue;
        const key=JSON.stringify(row.locator);
        if(seen.has(key))continue;
        if(rows.length>=24){truncated=true;break;}
        seen.add(key);rows.push(row);
      }
      if(part.truncated)truncated=true;
    }
  }
  // Read-only proof for ordinary links already observed in this Document.
  // New windows, downloads, opaque schemes and sensitive URLs are refused.
  for(const row of rows){
    if(row?.role!=='link'||row.state?.visible!==true||row.state?.disabled ||
      !row.locator||row.locator.parent||row.locator.index!==undefined)continue;
    const d=row.locator;
    let loc;
    if(d.kind==='role'&&d.value==='link'&&d.exact===true&&d.name===row.name)
      loc=page.getByRole('link',{name:d.name,exact:true});
    else if(d.kind==='css')loc=page.locator(d.value);
    else if(d.kind==='testId')loc=page.getByTestId(d.value);
    else continue;
    try {
      if(await loc.count()!==1)continue;
      const href=await loc.getAttribute('href'),
        target=await loc.getAttribute('target'),
        download=await loc.getAttribute('download');
      if(typeof href!=='string'||href.length<1||href.length>260||
        /[^\x21-\x7e]|["'\\<>]/.test(href)||
        download!==null||(target!==null&&target!==''&&target!=='_self'))continue;
      const url=new URL(href,first.document?.url);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
        url.hash||url.href.length>320||
        /(?:login|account|checkout|payment|delete|logout|auth|token|reset|upload|send|order)/i.test(url.pathname)||
        [...url.searchParams].some(([key,val])=>!['product','detail','sku','item','id'].includes(key)||
          !/^[\w-]{1,60}$/.test(val)))continue;
      row.navigation={href,url:url.href,origin:url.origin};
    }catch{}
  }
  let title='';
  try{if(typeof page.title==='function')title=String(await page.title()).slice(0,200);}catch{}
  // Leave room for the receipt's Run/Result/hash and Document envelope within
  // the existing 12 KiB send limit. Count UTF-8, including trusted link proof.
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
  while(rows.length&&bytes({nodes:rows,title})>9*1024){rows.pop();truncated=true;}
  return {...first,nodes:rows,title,truncated};
}
`;

export const WORKFLOW_OBSERVE_SOURCE=WORKFLOW_OBSERVE_FUNCTION+
  "\nasync function main() { return __observeWorkflowPage(params.request); }\n";
