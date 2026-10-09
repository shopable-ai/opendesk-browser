// OpenDesk Sidebar「开发」：Page API 点击第 06 组的真正网页 SDK axiosx GET。
// 使用前请在扩展工具页安装并批准目标文档的 OpenDeskSDK/network 和目标来源。
// 此草稿不安装 SDK，也不以 Page DOM 状态代替 Controller 原生回执。
// 参数可覆盖：{"url":"https://httpbingo.org/get?source=opendesk","expected":"success"}。
async function main() {
  const url = String(params.url ?? 'https://httpbingo.org/get?source=opendesk');
  const expected = params.expected === 'error' ? 'error' : 'success';
  await page.getByLabel('请求 URL', {exact:true}).fill(url);
  await page.getByRole('button', {name:'发送 GET', exact:true}).click();
  await page.locator('#api-status[data-state="' + expected + '"]')
    .waitFor({state:'visible', timeout:10000});
  return {
    channel:'page-sdk-axiosx-through-page-api',
    url,
    httpStatus:await page.locator('#api-http-status').textContent(),
    duration:await page.locator('#api-duration').textContent(),
    responseText:await page.locator('#api-response').textContent(),
    errorText:await page.locator('#api-error').textContent()
  };
}
