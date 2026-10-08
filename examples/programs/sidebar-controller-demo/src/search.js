// OpenDesk Modern Page API subset, not the Node Playwright library.
export async function searchFixture(page,keyword) {
  await page.getByLabel('搜索关键词',{exact:true}).fill(keyword);
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await page.getByText('搜索完成',{exact:true}).waitFor({state:'visible',timeout:10000});
  return {
    result:await page.locator('#results').textContent(),
    counter:await page.locator('#search-count').textContent()
  };
}
