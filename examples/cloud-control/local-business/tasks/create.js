async function main() {
  await page.locator('#execution-context[data-state="ready"]').waitFor();
  await page.locator('#create-recordKey').fill(params.recordKey);
  await page.locator('#create-name').fill(params.name);
  await page.locator('#create-status').fill(params.status);
  await page.locator('#create-submit').click();
  await page.locator('#create-result:not(:empty)').waitFor();
  if (await page.locator('#create-result').textContent() !== '已持久保存：' + params.recordKey) {
    throw new Error('保存提示与当前记录不匹配');
  }
  return {recordKey:params.recordKey, action:'create', persistence:'requires-independent-readback'};
}
