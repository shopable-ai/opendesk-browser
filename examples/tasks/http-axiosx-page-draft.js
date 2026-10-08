// OpenDesk Sidebar「开发」草稿：通过现有 Page API 点击网页内的 axiosx 按钮。
// 网页必须先通过「独立网页 SDK」批准 network 并安装 MAIN/ISOLATED 入口。
// 参数：{"url":"./request-sample.json","expected":"success"}。
// 不直接调用 Worker axiosx，不使用页面任意求值或 DOM 强制改值。
async function main() {
  const url = String(params.url ?? './request-sample.json');
  const expected = params.expected === 'error' ? 'error' : 'success';
  // Reset establishes the page's default SDK/GET channel after earlier manual tests.
  await page.click('#reset-all');
  await page.getByLabel('请求 URL', {exact:true}).fill(url);
  await page.getByRole('button', {name:'发送请求', exact:true}).click();
  await page.locator('#api-status[data-state="' + expected + '"]')
    .waitFor({state:'visible', timeout:10000});
  return {
    channel:'page-sdk-axiosx-through-page-api',
    url,
    httpStatus:await page.locator('#api-http-status').textContent(),
    duration:await page.locator('#api-duration').textContent(),
    responseText:await page.locator('#api-response').textContent(),
    headersText:await page.locator('#api-headers').textContent(),
    errorText:await page.locator('#api-error').textContent()
  };
}
