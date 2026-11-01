async function main() {
  await page.locator('#name').fill(params.name);
  await page.click('#submit');
  await page.waitForSelector('#done');
  const submitted = await page.locator('#done').textContent();
  if (submitted !== '已提交：' + params.name.trim()) {
    throw new Error('E_FORM_READBACK');
  }
  return {ok: true, url: await page.url()};
}
