import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';

export default async function main() {
  const url = await page.url();

  if (!url.startsWith('http://127.0.0.1:43111/demo-form.html')) {
    throw new Error('请打开 OpenDesk 标准测试页面');
  }

  const counter = page.locator('#search-count');
  const readCount = async () => {
    const text = await counter.textContent();
    return Number((text || '').replace(/\D/g, ''));
  };
  const before = await readCount();

  await page.getByLabel('搜索关键词', {exact: true}).fill('OpenDesk');
  await page.getByRole('button', {name: '搜索', exact: true}).click();
  await page.getByText('搜索完成', {exact: true}).waitFor({state: 'visible'});

  const result = await page.locator('#results').textContent();
  const after = await readCount();
  const value = max([2, 5, 3]);

  if (value !== 5 || after !== before + 1 || !result?.includes('OpenDesk')) {
    throw new Error('IMPORT_OR_PAGE_ACTION_FAILED');
  }

  return {
    title: await page.title(),
    library: 'd3-array@3.2.4',
    maxValue: value,
    result,
    searchCountBefore: before,
    searchCountAfter: after,
    success: true
  };
}
