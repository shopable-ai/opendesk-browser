export function getPageTitle(doc) {
  return String(doc.title || '').trim() || '（网页无标题）';
}
