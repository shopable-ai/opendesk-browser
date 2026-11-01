// Fixed Controller Task. Homepage: one visible search; /s?wd=: read-only compatibility.
// Locator operations are ISOLATED DOM actions, not operating-system keyboard/mouse events.
async function main() {
  const query = params?.query;
  if (typeof query !== 'string' || !query.trim() || query.length > 120 || params?.limit !== 3 ||
      Object.keys(params).some(key => !['query','limit'].includes(key))) {
    throw Object.assign(new Error('Expected a nonempty query and limit=3'), {code:'E_TASK_PARAMS'});
  }
  let url = new URL(await page.url());
  const homepage = url.pathname === '/' && !url.search;
  if (url.origin !== 'https://www.baidu.com' || url.username || url.password ||
      (!homepage && (url.pathname !== '/s' || url.searchParams.get('wd') !== query))) {
    throw Object.assign(new Error('Expected the approved Baidu homepage or exact query'), {code:'E_TARGET'});
  }
  const sample = (text,max) => Array.from(text).slice(0,max).join('');
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const trace = [];
  const record = (action,state,detail={}) => {
    const entry={at:new Date().toISOString(),action,state,...detail};
    if(typeof entry.value==='string') {
      entry.value=sample(entry.value,120);
      if(entry.value!==detail.value)entry.valueTruncated=true;
    }
    if(entry.url?.length>=1200) {delete entry.url;entry.urlOmitted=true;}
    trace.push(entry);
  };
  const observeDocument = async () => {
    const id=(await page.observe({root:'body',maxDepth:1,maxNodes:1,maxChars:256}))?.document?.documentId;
    return typeof id==='string' && id && bytes(id)<=256 ? {documentId:id} : {};
  };
  const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
  const clean = text => String(text || '').replace(/\s+/g,' ').trim();
  const readBody = async () => (await page.locator('body').innerText()).slice(0,3000);
  const blocked = text => /验证码|安全验证|访问受限|异常流量|security verification|captcha|unusual traffic/i.test(text);
  const noResults = text => /没有找到|未找到相关|没有相关搜索结果|抱歉.*没有/i.test(text);
  const result = (status,results=[],error=null) => {
    const output={kind:'baidu.search.top3.result',version:2,query,
      ...(url.href.length<1200?{sourceUrl:url.href}:{sourceUrlOmitted:true}),
      status,count:results.length,results:results.map(row=>({...row})),inputMode:'isolated-dom',trace,
      ...(error?{error}:{}),observedAt:new Date().toISOString()};
    // Leave 2 KiB for the existing Bridge envelope; native verifies its full serialization.
    const oversized=()=>bytes(output)>6144;
    if(oversized()) {
      output.truncated=true;
      output.trace=trace.map(({url,...entry})=>entry);
      for(let i=output.results.length-1;i>=0&&oversized();i--)delete output.results[i].directUrl;
      if(oversized())for(const row of output.results) {
        row.title=sample(row.title,64);row.summary=sample(row.summary,80);
      }
      if(oversized()) {
        output.observedCount=results.length;
        while(output.results.length&&oversized()) {output.results.pop();output.count=output.results.length;}
        if(status==='success'&&!output.count) {
          output.status='stopped';output.error={code:'E_RESULT_SIZE',message:'Observed results exceeded the return budget'};
        }
      }
      if(oversized()) {output.trace=[];output.traceOmitted=true;}
      if(oversized()) {delete output.sourceUrl;output.sourceUrlOmitted=true;}
    }
    return output;
  };
  try {
    if (blocked(await readBody())) return result('blocked');
    if (homepage) {
      // Both IDs were observed in the real homepage; the legacy field is hidden on the new UI.
      const modern = page.locator('#chat-textarea');
      const fieldSelector = await modern.isVisible() ? '#chat-textarea' : '#kw';
      const buttonSelector = fieldSelector === '#chat-textarea' ? '#chat-submit-button' : '#su';
      const field = page.locator(fieldSelector);
      record('input','before',{locator:fieldSelector,value:await field.inputValue(),url:url.href,...await observeDocument()});
      record('input','started',{locator:fieldSelector});
      await field.fill(query,{timeout:10000});
      const entered = await field.inputValue();
      record('input','returned',{locator:fieldSelector,value:entered});
      if (entered !== query) throw Object.assign(new Error('Search input did not match'),{code:'E_INPUT_VALUE'});
      await pause(3000); // Leave the observed input visible before submitting once.
      record('click','started',{locator:buttonSelector,url:await page.url()});
      // The observed Baidu homepage changes history inside the same document.
      // A cross-document replacement remains fenced rather than replaying this click.
      await page.locator(buttonSelector).click({timeout:10000});
      record('click','returned',{locator:buttonSelector});
      const deadline=Date.now()+12000;
      do {
        url=new URL(await page.url());
        if(url.origin !== 'https://www.baidu.com' || url.username || url.password)
          throw Object.assign(new Error('Unexpected navigation origin'),{code:'E_TARGET'});
        if(url.pathname==='/s' && url.searchParams.get('wd')===query) break;
        await pause(200);
      } while(Date.now()<deadline);
      if(url.pathname!=='/s' || url.searchParams.get('wd')!==query) throw Object.assign(new Error('Search navigation not observed'),{code:'E_SEARCH_NAVIGATION'});
      record('navigation','observed',{url:url.href,...await observeDocument()});
    }
    if(blocked(await readBody())) return result('blocked');
    try { await page.locator('#content_left').waitFor({state:'visible',timeout:12000}); }
    catch(error) {
      // Document/permission/unknown-effect fences are not missing search DOM.
      if(error.code!=='E_TIMEOUT') throw error;
      return result(blocked(await readBody())?'blocked':'dom_unavailable');
    }
    const results=[];
    const nodes=page.locator('#content_left .result.c-container');
    const count=Math.min(await nodes.count(),40);
    for(let i=0;i<count && results.length<3;i++) {
      const node=nodes.nth(i);
      if(!await node.isVisible()) continue;
      const tpl=await node.getAttribute('tpl');
      if(tpl!==null && !['se_com_default','www_index'].includes(tpl)) continue;
      if(await node.getAttribute('data-tuiguang')!==null || await node.getAttribute('data-ad')!==null ||
          /(?:^|\s)ec-tuiguang(?:\s|$)/u.test(await node.getAttribute('class') || '') ||
          await node.locator('[data-tuiguang],[data-click*="tuiguang"],.ec-tuiguang,.c-icon-bear-p,.c-icon-bear-ad').count()) continue;
      // Text mentioning advertising is not an ad label. Check exact visible labels.
      if(/广告|推广|赞助/u.test(await node.textContent())) {
        const labels=node.locator('span,a,em,small');
        let adLabel=false;
        const count=Math.min(await labels.count(),60);
        for(let j=0;j<count;j++) {
          const label=labels.nth(j);
          if(await label.isVisible() && /^(广告|推广|商业推广|赞助)$/u.test(clean(await label.textContent()))) {
            adLabel=true;break;
          }
        }
        if(adLabel) continue;
      }
      const anchors=node.locator('h3 a');
      let anchor=null, visibleCount=0;
      const anchorCount=await anchors.count();
      for(let j=0;j<anchorCount;j++) {
        const candidate=anchors.nth(j);
        if(await candidate.isVisible()) {anchor=candidate;visibleCount++;}
        if(visibleCount>1) break;
      }
      if(visibleCount!==1) continue;
      const title=clean(await anchor.innerText());
      const abstract=node.locator('.c-abstract,[class*="content-right_"],[class*="summary-gap_"],.c-span-last').first();
      if(!await abstract.isVisible()) continue;
      const summary=clean(await abstract.innerText());
      const href=await anchor.getAttribute('href');
      if(!href || !title || !summary) continue;
      let link;try{link=new URL(href,url);}catch{continue;}
      if(!['http:','https:'].includes(link.protocol)||link.username||link.password||link.href.length>=1200||results.some(r=>r.url===link.href))continue;
      let directUrl=null;
      const mu=await node.getAttribute('mu');
      try {
        if(mu) {const direct=new URL(mu);if(['http:','https:'].includes(direct.protocol)&&!direct.username&&!direct.password&&direct.href.length<1200)directUrl=direct.href;}
      } catch {}
      const slot=await node.getAttribute('id');
      results.push({position:results.length+1,title:sample(title,96),summary:sample(summary,200),
        url:link.href,...(directUrl?{directUrl}:{}),evidence:{...(slot===null||slot.length<=80?{slot}:{slotOmitted:true}),tpl}});
    }
    record('results','read',{url:url.href,count:results.length});
    const body=results.length?'':await readBody();
    await pause(3000); // Keep the results visible for the user before returning.
    return result(results.length?'success':blocked(body)?'blocked':noResults(body)?'no_results':'dom_changed',results);
  } catch(error) {
    // A lost ACK can mean the action happened. Never submit it again in this invocation.
    const failure={code:typeof error.code==='string'&&error.code.length<=64?error.code:null,
      message:sample(String(error.message||error),180)};
    record('operation','stopped',failure);
    return result('stopped',[],failure);
  }
}
