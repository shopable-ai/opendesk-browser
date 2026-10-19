async function main() {
  await page.goto('http://127.0.0.1:43111/demo-form.html?r17-delivery=1792426584969#lab-form');
  await page.locator('#name').fill('Cloud R17 newly delivered Controller');
  return {receipt: await page.locator('#name').inputValue()};
}
