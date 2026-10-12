// Attach as a Page USER_SCRIPT / async-main on a separately approved website.
// No export default here: this is a Sidebar single-file, not a multi-file ESM.
// No Controller page/params/axiosx exist in this world.
async function main() {
  const title=document.title;
  return {
    title,
    url:location.href,
    words:_.words(title),
    date:dayjs().format('YYYY-MM-DD')
  };
}
