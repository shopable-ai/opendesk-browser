// Paste directly into Sidebar > 开发 and run as a draft.
// Params: {"keyword":"OpenDesk"}; no saved task or external MCP required.
async function main() {
  await page.getByLabel('搜索关键词', {exact:true})
    .fill(String(params.keyword ?? 'OpenDesk'));

  await page.getByRole('button', {name:'搜索', exact:true})
    .click();

  await page.getByText('搜索完成', {exact:true})
    .waitFor({state:'visible', timeout:10000});

  return {result:await page.locator('#results').textContent()};
}
