// 开发 → 直接编辑 → 自动化；目标为 demo-form.html，不保存或安装任务。
// 参数示例：{"name":"UI-unique-marker"}；每次有意运行使用新的唯一标记。
async function main() {
  const name = String(params.name ?? '');
  if (!name || name.length > 40) throw new Error('请提供 1–40 字符的唯一测试标记');
  const url = await page.url();
  if (new URL(url).origin !== 'http://127.0.0.1:43111' ||
      new URL(url).pathname !== '/demo-form.html') throw new Error('目标不是标准测试页');
  await page.getByLabel('姓名', {exact:true}).fill(name);
  await page.getByLabel('咨询类型', {exact:true}).selectOption('support');
  await page.getByRole('button', {name:'提交', exact:true}).click();
  await page.locator('#done').waitFor({state:'visible', timeout:5000});
  const actual = await page.locator('#done').textContent();
  const expected = '已提交：' + name.trim();
  if (actual !== expected) throw new Error('完成文字不一致：' + actual);
  return {url, name, topic:await page.locator('#topic').inputValue(), expected, actual};
}
