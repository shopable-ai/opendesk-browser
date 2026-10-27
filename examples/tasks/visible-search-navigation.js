// Controller Task. Only the local Browser Test Lab origin is permitted.
// Short pauses keep actual page actions visible while observing the run.
async function main() {
  const origin = 'http://127.0.0.1:43111';
  const keyword = String(params.keyword ?? 'OpenDesk');
  if (!['OpenDesk', 'Workflow'].includes(keyword)) throw new Error('Unsupported demo keyword');
  if (!String(await page.url()).startsWith(origin + '/')) throw new Error('Unexpected target origin');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await pause(8000);
  await page.goto(origin + '/workflow-search.html', {waitUntil:'domcontentloaded', timeout:10000});
  await pause(2000);
  await page.getByLabel('搜索关键词', {exact:true}).fill(keyword);
  await pause(2000);
  await page.getByRole('button', {name:'搜索', exact:true}).click();
  await page.locator('#workflow-search-complete').waitFor({state:'visible', timeout:10000});
  const submissions = await page.locator('#workflow-search-count').textContent();
  const searchResult = await page.locator('#workflow-search-results').textContent();
  const title = keyword === 'OpenDesk' ? 'OpenDesk Browser · 官方项目介绍' : 'OpenDesk Workflow · 使用指南';
  const href = await page.getByRole('link', {name:title, exact:true}).getAttribute('href');
  const expected = keyword === 'OpenDesk' ? '?detail=opendesk' : '?detail=workflow';
  if (href !== expected || submissions !== '提交次数：1') throw new Error('Search result did not match');
  await pause(3000);
  // Navigate with the public API so Authority can transfer to the new document.
  await page.goto(origin + '/workflow-search.html' + href, {waitUntil:'domcontentloaded', timeout:10000});
  const detailTitle = await page.locator('#workflow-search-detail-title').textContent();
  const detailDescription = await page.locator('#workflow-search-detail-description').textContent();
  if (detailTitle !== title) throw new Error('Detail page did not match the selected search result');
  const detailUrl = await page.url();
  await pause(3000);
  return {keyword, submissions, searchResult, detailTitle, detailDescription, detailUrl, observedAt:new Date().toISOString()};
}
