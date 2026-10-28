// Business allowlist mirrored by the frozen Task manifest; Authority still owns admission.
export const CAPTURE_ORIGINS=Object.freeze([
  'http://127.0.0.1:43111',
  'https://book.douban.com',
  'https://download.csdn.net'
]);
export function allowedUrl(value,base) {
  const url=new URL(value,base);
  if(!CAPTURE_ORIGINS.includes(url.origin)||url.username||url.password)
    throw Object.assign(new Error('E_CAPTURE_ORIGIN'),{code:'E_CAPTURE_ORIGIN'});
  return url.href;
}
