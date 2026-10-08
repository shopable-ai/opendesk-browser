// OpenDesk Browser > Sidebar > 开发：直接运行此 HTTP 草稿，不用安装任务。
// 默认参数：{"url":"./request-sample.json","expected":"success"}
// 可改为 {"url":"./__opendesk_expected_404__.json","expected":"error"}。
// 此脚本使用已存在的 Locator Page API，不绕过扩展许可，也不代替真实原生回执。
async function main() {
  const url = String(params.url ?? './request-sample.json');
  const expected = params.expected === 'error' ? 'error' : 'success';
  await page.getByLabel('API URL', {exact:true}).fill(url);
  await page.getByRole('button', {name:'发送请求', exact:true}).click();
  await page.locator('#http-status[data-state="' + expected + '"]')
    .waitFor({state:'visible', timeout:10000});
  return {
    url,
    expected,
    httpStatus: await page.locator('#http-code').textContent(),
    duration: await page.locator('#http-duration').textContent(),
    contentType: await page.locator('#http-content-type').textContent(),
    responseText: await page.locator('#http-response').textContent(),
    errorText: await page.locator('#http-error').textContent()
  };
}
