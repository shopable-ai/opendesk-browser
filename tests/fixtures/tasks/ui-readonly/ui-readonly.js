// Test-owned Controller fixture; params and page are Worker lexical bindings.
async function main() {
  const targetUrl = 'http://127.0.0.1:43111/demo-form.html';
  const checkTarget = async () => {
    if (await page.url() !== targetUrl) {
      throw Object.assign(new Error('Expected the fixed UI test page'), {code: 'E_TARGET'});
    }
  };
  await checkTarget();
  if (params.holdMs > 0) {
    await new Promise(resolve => setTimeout(resolve, params.holdMs));
  }
  await checkTarget();
  const title = String(await page.title() ?? '');
  const heading = String(await page.locator('h1').textContent() ?? '');
  if (!title.trim() || !heading.trim()) {
    throw Object.assign(new Error('UI test page title or H1 unavailable'), {code: 'E_PAGE_CONTENT'});
  }
  const normalize = value => params.caseSensitive ? value : value.toLowerCase();
  const query = normalize(params.query);
  const matches = value => params.mode === 'exact'
    ? normalize(value) === query : normalize(value).includes(query);
  return {kind: 'test.ui.readonly.result', version: 1, sourceUrl: targetUrl,
    title, heading, query: params.query, holdMs: params.holdMs,
    mode: params.mode, caseSensitive: params.caseSensitive,
    matched: matches(title) || matches(heading)};
}
