// Side Panel「开发」→ Controller 草稿：直接粘贴并点击「运行草稿」。
// 不写 export default，不需要 main({page})，也不向网站 window 注入任何能力。
async function main() {
  const title=await page.title();
  return {
    title,
    url:await page.url(),
    words:_.words(title),
    date:dayjs().format('YYYY-MM-DD'),
    abi:OpenDeskLibs.abi
  };
}
