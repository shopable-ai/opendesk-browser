// Exact App Controller sites; Authority still owns admission. The independent
// legacy HTTP Task keeps its own frozen manifest and source.
export const CAPTURE_ORIGINS=Object.freeze([
  'http://127.0.0.1:43111',
  'https://book.douban.com',
  'https://download.csdn.net',
  'https://books.toscrape.com',
  'https://quotes.toscrape.com',
  'https://www.scrapethissite.com'
]);
export function allowedUrl(value,base) {
  const url=new URL(value,base);
  if(!CAPTURE_ORIGINS.includes(url.origin)||url.username||url.password)
    throw Object.assign(new Error('E_CAPTURE_ORIGIN'),{code:'E_CAPTURE_ORIGIN'});
  return url.href;
}
