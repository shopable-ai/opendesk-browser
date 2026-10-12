// Page USER_SCRIPT 多文件 ESM：main 无参数，直接使用 DOM 和预置库。
// 不会获得 Controller 的 page、params、axiosx 或后台 Chrome 权限。
export default async function main() {
  const title = document.title;
  return {
    title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
