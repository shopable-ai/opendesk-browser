// Fixed Controller Task: baidu.search.top3. Run only after an exact installed-task admission.
// The trusted caller owns target navigation to https://www.baidu.com/s?wd=<query>.
async function main() {
  const query = params?.query;
  if (typeof query !== 'string' || !query.trim() || query.length > 120 || params?.limit !== 3 ||
      Object.keys(params).some(key => !['query', 'limit'].includes(key))) {
    throw Object.assign(new Error('Expected a nonempty query and limit=3'), {code:'E_TASK_PARAMS'});
  }
  const url = new URL(await page.url());
  if (url.origin !== 'https://www.baidu.com' || url.pathname !== '/s' || url.searchParams.get('wd') !== query) {
    throw Object.assign(new Error('Controller target is not the approved Baidu query'), {code:'E_TARGET'});
  }
  // Read-only page DOM. Never follow sponsored links or run code from search snippets.
  try { await page.locator('#content_left').waitFor({state:'visible',timeout:15000}); }
  catch {
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0,2000);
    const blocked = /验证码|安全验证|请输入验证码|访问受限|异常流量|security verification|captcha/i.test(body);
    return {kind:'baidu.search.top3.result',version:1,query,sourceUrl:url.href,
      status:blocked?'blocked':'dom_unavailable',count:0,results:[],observedAt:new Date().toISOString()};
  }
  // Fixed verified program source, never AI-provided JavaScript. The callback executes
  // in the page's admitted ISOLATED DOM scope through the existing Controller driver.
  const rows = await page.$$eval('#content_left .result.c-container', nodes => {
    const visible = node => {
      if (!node || !node.isConnected || node.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
      const css = getComputedStyle(node);
      return css.display !== 'none' && css.visibility !== 'hidden';
    };
    const clean = text => String(text || '').replace(/\s+/g,' ').trim();
    const evidence = [];
    for (const node of nodes.slice(0,40)) {
      const anchors = [...node.querySelectorAll('h3 a')].filter(visible);
      if (anchors.length !== 1) continue;
      const a=anchors[0], heading=a.closest('h3');
      if (!heading || !visible(heading) || !visible(node)) continue;
      const tags=[...node.querySelectorAll('[data-tuiguang],[data-click*="tuiguang"],.ec-tuiguang,.c-icon-bear-p,.c-icon-bear-ad')];
      const adLabel=[...node.querySelectorAll('span,a,em,small')].slice(0,60)
        .some(el=>visible(el) && /^(广告|推广|商业推广|赞助)$/u.test(clean(el.textContent)));
      if (tags.length || adLabel || node.matches('[data-tuiguang],[data-ad],.ec-tuiguang')) continue;
      const title=clean(a.innerText || a.textContent);
      const abstract=node.querySelector('.c-abstract,[class*="content-right_"],[class*="summary-gap_"],.c-span-last');
      const summary=abstract && visible(abstract) ? clean(abstract.innerText || abstract.textContent) : '';
      const href=a.getAttribute('href');
      const direct=node.getAttribute('mu');
      if (!title || !summary || !href) continue; // Only verifiable, visible organic results.
      evidence.push({title:title.slice(0,320),summary:summary.slice(0,900),href,mu:direct||null,
        slot:node.getAttribute('id')||null,tpl:node.getAttribute('tpl')||null});
      if (evidence.length >= 3) break;
    }
    return evidence;
  });
  const results=[];
  for (const row of rows) {
    let url;
    try { url = new URL(row.href,'https://www.baidu.com'); } catch {continue;}
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) continue;
    if (results.some(old=>old.url===url.href)) continue;
    let directUrl=null;
    try {if(row.mu){const mu=new URL(row.mu);if(['http:','https:'].includes(mu.protocol)&&!mu.username&&!mu.password)directUrl=mu.href;}}catch{}
    results.push({position:results.length+1,title:row.title,summary:row.summary,url:url.href,
      ...(directUrl?{directUrl}:{}),evidence:{slot:row.slot,tpl:row.tpl}});
    if(results.length===3)break;
  }
  const body=results.length ? '' : (await page.locator('body').innerText().catch(()=>'')).slice(0,2000);
  const blocked=/验证码|安全验证|访问受限|异常流量|captcha/i.test(body);
  const noResults=/没有找到|未找到相关|没有相关搜索结果|抱歉.*没有/i.test(body);
  return {kind:'baidu.search.top3.result',version:1,query,sourceUrl:url.href,
    status:results.length?'success':blocked?'blocked':noResults?'no_results':'dom_changed',
    count:results.length,results,observedAt:new Date().toISOString()};
}
