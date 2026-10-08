// OpenDesk Sidebar「开发」草稿：通过 Page API 点击标准测试页的原生 fetch GET 按钮。
// 保留历史文件名兼容旧链接；本例不调用 Page SDK axiosx，也不作为其验收证据。
// 参数：{"url":"./request-sample.json","expected":"success"}。
// 页面请求遵守浏览器 CORS；Worker axiosx 请使用 http-worker-axiosx-draft.js 单独验收。
async function main() {
  const url = String(params.url ?? './request-sample.json');
  const expected = params.expected === 'error' ? 'error' : 'success';
  await page.getByLabel('请求 URL', {exact:true}).fill(url);
  await page.getByRole('button', {name:'发送 GET', exact:true}).click();
  await page.locator('#api-status[data-state="' + expected + '"]')
    .waitFor({state:'visible', timeout:10000});
  return {
    channel:'page-fetch-through-page-api',
    url,
    httpStatus:await page.locator('#api-http-status').textContent(),
    duration:await page.locator('#api-duration').textContent(),
    responseText:await page.locator('#api-response').textContent(),
    errorText:await page.locator('#api-error').textContent()
  };
}
