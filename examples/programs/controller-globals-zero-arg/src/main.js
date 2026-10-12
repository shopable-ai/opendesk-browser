// Controller 多文件 ESM：main 无参数，受控 page 与公共库可直接引用。
// 此处的 page 是 Worker 作用域词法绑定，不是网站 window.page。
export default async function main() {
  const title = await page.title();
  const url = await page.url();

  return {
    title,
    url,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
