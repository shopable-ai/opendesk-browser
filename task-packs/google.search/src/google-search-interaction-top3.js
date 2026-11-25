// ==OpenDeskParams==
// @version 1
// @param text query "搜索关键词" required minLength=1 maxLength=120
// @param number limit "结果数量" required const=3 default=3
// @param switch showExecutionTab "显示执行标签页" default=true
// ==/OpenDeskParams==

// Controller interaction test: ISOLATED DOM input/click, not trusted OS input.
// Every intentional run submits once; failures propagate without replay or URL fallback.
async function main() {
  const query = params?.query;
  if (typeof query !== 'string' || !query.trim() || query.length > 120 || params?.limit !== 3 ||
      (Object.hasOwn(params, 'showExecutionTab') && typeof params.showExecutionTab !== 'boolean') ||
      Object.keys(params).some(key => !['query', 'limit', 'showExecutionTab'].includes(key))) {
    fail('E_TASK_PARAMS', 'Expected a nonempty query and limit=3');
  }

  const trace = [];
  const record = (action, detail = {}) => trace.push({action, ...detail});
  let url = await readTarget();
  if (params.showExecutionTab !== false) await page.bringToFront();
  await checkChallenge();

  // Reset results pages to the homepage, including repeat queries, to exercise input each run.
  if (url.pathname === '/search') {
    await page.goto('https://www.google.com/', {waitUntil: 'load', timeout: 15000});
    url = await readTarget();
    if (!isHomepage(url)) fail('E_TARGET', 'Expected Google homepage after preparation');
    record('homepage', {waitUntil: 'load', documentId: await documentId()});
  }
  await checkChallenge();
  const beforeDocumentId = await documentId();
  const input = page.locator('form[action="/search"] textarea[name="q"]');
  await input.fill(query, {timeout: 10000});
  await checkInput(input);
  record('input', {value: query});

  // The first btnK belongs to autocomplete; the last homepage button can be
  // covered when suggestions arrive. Wait for the popup's own submit node.
  // A missing/hidden popup stops this interaction test without another action.
  const submit = page.locator('form[action="/search"] input[name="btnK"]').first();
  await submit.waitFor({state: 'visible', timeout: 8000});
  record('submit-ready', {button: 'autocomplete'});

  const submitUrl = await readTarget();
  if (submitUrl.href !== url.href) fail('E_TARGET', 'Target changed before submission');
  await checkInput(input);
  await submit.click({waitUntil: 'domcontentloaded', timeout: 15000});
  url = await readTarget();
  if (url.pathname !== '/search' || url.searchParams.get('q') !== query) {
    fail('E_TARGET', 'Unexpected search destination or query');
  }
  record('submit', {count: 1, waitUntil: 'domcontentloaded', beforeDocumentId, documentId: await documentId()});
  await checkChallenge();

  // Navigation readiness does not mean that Google's business results are ready.
  try {
    await page.locator('#rso').waitFor({state: 'visible', timeout: 12000});
  } catch (error) {
    if (error.code === 'E_TIMEOUT' && noResults(await bodyText())) return result('no_results', []);
    throw error;
  }
  const results = await readResults();
  record('results', {count: results.length});
  if (results.length) return result('success', results);
  if (noResults(await bodyText())) return result('no_results', []);
  fail('E_SEARCH_RESULTS', '未能识别 Google 自然搜索结果；请检查目标网页');

  function fail(code, message) {
    throw Object.assign(new Error(message), {code});
  }

  function isHomepage(target) {
    return target.pathname === '/' || target.pathname === '/webhp';
  }

  async function readTarget() {
    const target = new URL(await page.url());
    if (target.origin !== 'https://www.google.com' || target.username || target.password ||
        (!isHomepage(target) && target.pathname !== '/search')) {
      fail('E_TARGET', '请在 Google 首页或搜索页运行，或选择新建标签页，起始网址 https://www.google.com/');
    }
    return target;
  }

  async function documentId() {
    return (await page.observe({root: 'body', maxDepth: 1, maxNodes: 1, maxChars: 256})).document.documentId;
  }

  async function bodyText() {
    return (await page.locator('body').innerText()).slice(0, 3000);
  }

  async function checkChallenge() {
    if (/captcha|unusual traffic|automated queries|验证码|安全验证|访问受限|异常流量/i.test(await bodyText())) {
      fail('E_SEARCH_BLOCKED', 'Google 需要验证；请检查目标网页后再准备下一次运行');
    }
  }

  async function checkInput(locator) {
    if (await locator.inputValue() !== query) fail('E_SEARCH_INPUT', '搜索输入读回不一致；停止提交');
  }

  function noResults(text) {
    return /did not match any documents|找不到和您查询|没有找到/i.test(text);
  }

  async function readResults() {
    // Recreate locators after the navigation handoff; never reuse homepage locators.
    const links = page.locator('#rso a:has(h3)');
    const ads = page.locator('#rso [data-text-ad] a:has(h3),#rso [data-ad] a:has(h3),#rso [data-ad-slot] a:has(h3)');
    const excluded = new Set();
    const adCount = Math.min(await ads.count(), 40);
    for (let index = 0; index < adCount; index++) excluded.add(await ads.nth(index).getAttribute('href'));
    const rows = [];
    const linkCount = Math.min(await links.count(), 30);
    for (let index = 0; index < linkCount && rows.length < 3; index++) {
      const anchor = links.nth(index);
      const heading = anchor.locator('h3');
      const href = await anchor.getAttribute('href');
      if (!href || excluded.has(href) || !await anchor.isVisible() || await heading.count() !== 1) continue;
      const title = (await heading.innerText()).replace(/\s+/g, ' ').trim();
      let link;
      try { link = new URL(href, url); } catch { continue; }
      if (!title || !['https:', 'http:'].includes(link.protocol) || link.username || link.password) continue;
      if (link.origin === 'https://www.google.com' && link.pathname === '/goto') link.searchParams.delete('gsessionid');
      if (link.href.length > 1000 || rows.some(row => row.url === link.href)) continue;
      rows.push({position: rows.length + 1, title: title.slice(0, 240), url: link.href});
    }
    return rows;
  }

  function result(status, results) {
    return {
      kind: 'google.search.interaction.top3.result', version: 1, query,
      sourceUrl: url.href, status, count: results.length, results,
      inputMode: 'isolated-dom', trace, observedAt: new Date().toISOString()
    };
  }
}
