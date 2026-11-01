// Fixed Controller Task. Explicit click navigation stays in the approved Google Origin.
// These are ISOLATED DOM actions, not operating-system keyboard/mouse events.
async function main() {
  const query=params?.query;
  if(typeof query!=='string'||!query.trim()||query.length>120||params?.limit!==3||
      Object.keys(params).some(key=>!['query','limit'].includes(key)))
    throw Object.assign(new Error('Expected a nonempty query and limit=3'),{code:'E_TASK_PARAMS'});
  let url=new URL(await page.url());
  const homepage=url.pathname==='/'&&!url.search;
  if(url.origin!=='https://www.google.com'||url.username||url.password||
      (!homepage&&(url.pathname!=='/search'||url.searchParams.get('q')!==query)))
    throw Object.assign(new Error('Expected the approved Google homepage or exact query'),{code:'E_TARGET'});
  const trace=[];
  const record=(action,state,detail={})=>trace.push({at:new Date().toISOString(),action,state,...detail});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const body=async()=>(await page.locator('body').innerText()).slice(0,3000);
  const blocked=text=>/captcha|unusual traffic|automated queries|验证码|安全验证|访问受限|异常流量/i.test(text);
  const documentId=async()=>(await page.observe({root:'body',maxDepth:1,maxNodes:1,maxChars:256})).document.documentId;
  const result=(status,results=[],error=null)=>({kind:'google.search.top3.result',version:1,query,sourceUrl:url.href,
    status,count:results.length,results,inputMode:'isolated-dom',trace,...(error?{error}:{}),observedAt:new Date().toISOString()});
  try {
    if(blocked(await body()))return result('blocked');
    if(homepage){
      const field=page.locator('textarea[name=q]');
      record('input','before',{locator:'textarea[name=q]',value:await field.inputValue(),url:url.href,documentId:await documentId()});
      await pause(3000);
      await field.fill(query,{timeout:10000});
      const entered=await field.inputValue();
      record('input','returned',{locator:'textarea[name=q]',value:entered});
      if(entered!==query)throw Object.assign(new Error('Search input did not match'),{code:'E_INPUT_VALUE'});
      await pause(1000);
      // Suggestions repaint the buttons after filling. Resolve the visible button now.
      const buttons=page.locator('input[name=btnK]');let index=-1;
      for(let i=0;i<await buttons.count();i++)if(await buttons.nth(i).isVisible()){index=i;break;}
      if(index<0)throw Object.assign(new Error('No visible search button'),{code:'E_SELECTOR_NOT_FOUND'});
      const locator='input[name=btnK] >> nth='+index;
      record('click','started',{locator,url:await page.url()});
      await buttons.nth(index).click({waitUntil:'load',timeout:15000});
      record('click','returned',{locator});
      url=new URL(await page.url());
      record('navigation','observed',{url:url.href,documentId:await documentId()});
      if(url.origin!=='https://www.google.com'||url.pathname!=='/search'||url.searchParams.get('q')!==query)
        throw Object.assign(new Error('Unexpected search navigation'),{code:'E_TARGET'});
    }
    if(blocked(await body()))return result('blocked');
    try{await page.locator('#rso').waitFor({state:'visible',timeout:12000});}
    catch(error){if(error.code!=='E_TIMEOUT')throw error;return result(blocked(await body())?'blocked':'dom_unavailable');}
    const links=page.locator('#rso a:has(h3)');
    const paid=page.locator('#rso [data-text-ad] a:has(h3),#rso [data-ad] a:has(h3),#rso [data-ad-slot] a:has(h3)');
    const excluded=new Set();
    for(let i=0;i<Math.min(await paid.count(),40);i++)excluded.add(await paid.nth(i).getAttribute('href'));
    const results=[];
    for(let i=0;i<Math.min(await links.count(),30)&&results.length<3;i++){
      const anchor=links.nth(i),href=await anchor.getAttribute('href');
      if(!href||excluded.has(href)||!await anchor.isVisible()||await anchor.locator('h3').count()!==1)continue;
      const title=(await anchor.locator('h3').innerText()).replace(/\s+/g,' ').trim();
      let link;try{link=new URL(href,url);}catch{continue;}
      if(!title||!['https:','http:'].includes(link.protocol)||link.username||link.password)continue;
      // Keep the observed public redirect target, omit Google's transient browser session parameter.
      if(link.origin==='https://www.google.com'&&link.pathname==='/goto')link.searchParams.delete('gsessionid');
      if(link.href.length>1000||results.some(row=>row.url===link.href))continue;
      results.push({position:results.length+1,title:title.slice(0,240),url:link.href});
    }
    record('results','read',{locator:'#rso a:has(h3)',url:url.href,count:results.length});
    await pause(2000);
    return result(results.length?'success':/did not match any documents|找不到和您查询|没有找到/i.test(await body())?'no_results':'dom_changed',results);
  }catch(error){
    // A dispatched click may have happened even when its acknowledgement is lost. Never retry it here.
    record('operation','stopped',{code:error.code||null,message:String(error.message||error).slice(0,200)});
    return result('stopped',[],{code:error.code||null,message:String(error.message||error).slice(0,200)});
  }
}
