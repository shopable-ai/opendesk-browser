// Sidebar > 开发. Defaults: {"url":"./request-sample.json","expected":"success"}.
// Select the webpage channel/method manually before running this DOM draft.
async function main() {
  await page.getByLabel('请求 URL', {exact:true}).fill(String(params.url ?? './request-sample.json'));
  await page.locator('#api-send').click();
  await page.locator('#api-status[data-state="' + String(params.expected ?? 'success') + '"]')
    .waitFor({state:'visible', timeout:10000});
  return {
    status:await page.locator('#api-http-status').textContent(),
    contentType:await page.locator('#api-content-type').textContent(),
    body:await page.getByTestId('api-response').textContent(),
    error:await page.locator('#api-error').textContent()
  };
}
