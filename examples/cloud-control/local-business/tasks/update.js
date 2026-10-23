async function main() {
  await page.locator('#execution-context[data-state="ready"]').waitFor();
  await page.locator('#update-recordKey').fill(params.recordKey);
  await page.locator('#update-name').fill(params.name);
  await page.locator('#update-status').fill(params.status);
  await page.locator('#update-submit').click();
  await page.locator('#update-result:not(:empty)').waitFor();
  if (await page.locator('#update-result').textContent() !== '已持久保存：' + params.recordKey) {
    throw new Error('保存提示与当前记录不匹配');
  }
  return {recordKey:params.recordKey, action:'update', persistence:'requires-independent-readback'};
}
