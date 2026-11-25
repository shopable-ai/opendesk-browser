// ==OpenDeskParams==
// @version 1
// @param text query "搜索关键词" required minLength=1 maxLength=120
// @param number limit "结果数量" required const=3 default=3
// @param switch showExecutionTab "显示执行标签页" default=true
// ==/OpenDeskParams==

// Fixed Controller Task. A single search navigation stays in the approved Google Origin.
// These are ISOLATED DOM actions, not operating-system keyboard/mouse events.
async function main() {
  const query=params?.query;
  if(typeof query!=='string'||!query.trim()||query.length>120||params?.limit!==3||
      (Object.hasOwn(params,'showExecutionTab')&&typeof params.showExecutionTab!=='boolean')||
      Object.keys(params).some(key=>!['query','limit','showExecutionTab'].includes(key)))
    throw Object.assign(new Error('Expected a nonempty query and limit=3'),{code:'E_TASK_PARAMS'});
  const isHomepage=url=>url.pathname==='/'||url.pathname==='/webhp';
  const readUrl=async()=>{
    const url=new URL(await page.url());
    if(url.origin!=='https://www.google.com'||url.username||url.password||
        (!isHomepage(url)&&url.pathname!=='/search'))
      throw Object.assign(new Error('请在 Google 首页或搜索结果页运行，或选择“新建标签页”，起始网址 https://www.google.com/'),{code:'E_TARGET'});
    return url;
  };
  let url=await readUrl();
  const trace=[];
  const record=(action,state,detail={})=>trace.push({at:new Date().toISOString(),action,state,...detail});
  const body=async()=>(await page.locator('body').innerText()).slice(0,3000);
  const noResults=text=>/did not match any documents|找不到和您查询|没有找到/i.test(text);
  const blocked=text=>/captcha|unusual traffic|automated queries|验证码|安全验证|访问受限|异常流量/i.test(text);
  const documentId=async()=>(await page.observe({root:'body',maxDepth:1,maxNodes:1,maxChars:256})).document.documentId;
  const result=(status,results=[])=>({kind:'google.search.top3.result',version:1,query,sourceUrl:url.href,
    status,count:results.length,results,inputMode:'isolated-dom',trace,observedAt:new Date().toISOString()});
  // Errors propagate to the Run result; no operation is replayed after a missing acknowledgement.
  if (params.showExecutionTab !== false) await page.bringToFront();
  if(blocked(await body()))throw Object.assign(new Error('Google 需要验证；请检查目标网页后再准备下一次运行'),{code:'E_SEARCH_BLOCKED'});
  if(url.pathname!=='/search'||url.searchParams.get('q')!==query){
    const target=new URL('https://www.google.com/search');
    target.searchParams.set('q',query);
    record('navigation','started',{url:target.href});
    await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:15000});
    url=await readUrl();
    record('navigation','observed',{url:url.href,documentId:await documentId()});
    if(url.pathname!=='/search'||url.searchParams.get('q')!==query)
      throw Object.assign(new Error('Unexpected search navigation'),{code:'E_TARGET'});
  }
  if(blocked(await body()))throw Object.assign(new Error('Google 需要验证；请检查目标网页后再准备下一次运行'),{code:'E_SEARCH_BLOCKED'});
  try{await page.locator('#rso').waitFor({state:'visible',timeout:12000});}
  catch(error){if(error.code==='E_TIMEOUT'&&noResults(await body()))return result('no_results');throw error;}
  const links=page.locator('#rso a:has(h3)');
  const paid=page.locator('#rso [data-text-ad] a:has(h3),#rso [data-ad] a:has(h3),#rso [data-ad-slot] a:has(h3)');
  const excluded=new Set();
  for(let i=0,count=Math.min(await paid.count(),40);i<count;i++)excluded.add(await paid.nth(i).getAttribute('href'));
  const results=[];
  for(let i=0,count=Math.min(await links.count(),30);i<count&&results.length<3;i++){
    const anchor=links.nth(i),heading=anchor.locator('h3'),href=await anchor.getAttribute('href');
    if(!href||excluded.has(href)||!await anchor.isVisible()||await heading.count()!==1)continue;
    const title=(await heading.innerText()).replace(/\s+/g,' ').trim();
    let link;try{link=new URL(href,url);}catch{continue;}
    if(!title||!['https:','http:'].includes(link.protocol)||link.username||link.password)continue;
    // Keep the observed public redirect target, omit Google's transient browser session parameter.
    if(link.origin==='https://www.google.com'&&link.pathname==='/goto')link.searchParams.delete('gsessionid');
    if(link.href.length>1000||results.some(row=>row.url===link.href))continue;
    results.push({position:results.length+1,title:title.slice(0,240),url:link.href});
  }
  record('results','read',{locator:'#rso a:has(h3)',url:url.href,count:results.length});
  if(results.length)return result('success',results);
  if(noResults(await body()))return result('no_results');
  throw Object.assign(new Error('未能识别 Google 自然搜索结果；请检查目标网页'),{code:'E_SEARCH_RESULTS'});
}
