// Fixed, read-only Controller Task. The trusted caller must bind an approved
// installation and open https://httpbingo.org/html in an independent target.
async function main() {
  const url = new URL(await page.url());
  if (url.origin !== 'https://httpbingo.org' || url.pathname !== '/html' ||
      url.search || url.hash || url.username || url.password) {
    throw Object.assign(new Error('Controller target is not the fixed read-only page'), {code:'E_TARGET'});
  }
  const title = String(await page.title() || '').trim();
  const heading = String(await page.locator('h1').textContent() || '').replace(/\s+/gu,' ').trim();
  const excerpt = String(await page.locator('body').innerText() || '').replace(/\s+/gu,' ').trim().slice(0,800);
  if (!heading || !excerpt) {
    throw Object.assign(new Error('Fixed page content unavailable'), {code:'E_PAGE_CONTENT'});
  }
  return {kind:'page.read.fixed.result',version:1,sourceUrl:url.href,
    title:title.slice(0,200),heading:heading.slice(0,200),excerpt,
    observedAt:new Date().toISOString()};
}
