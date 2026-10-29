// Presentation only: never alter records or the app's export payload.
export const PAGE_SIZE = 50;
export function valueText(value) {
  if (value == null || value === '') return '';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
export function columnKind(key) {
  if (/^(title|name|标题|名称)$/i.test(key)) return 'title';
  if (/(author|作者)/i.test(key)) return 'author';
  if (/(price|价格|金额)/i.test(key)) return 'price';
  if (/(url|href|link|网址|链接)/i.test(key)) return 'url';
  if (/(description|summary|intro|content|abstract|描述|简介|摘要)/i.test(key)) return 'description';
  return 'text';
}
export const kindLabels = {title:'标题',author:'作者',price:'价格',url:'URL',description:'长描述',text:'文本'};
export function resultKeys(rows) {
  const keys = [...new Set(rows.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : []))];
  return [...keys.filter(key => columnKind(key) === 'title'), ...keys.filter(key => columnKind(key) !== 'title')];
}
export function pageRows(rows, page) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1));
  return {page:current,pages,start:current * PAGE_SIZE,rows:rows.slice(current * PAGE_SIZE,(current + 1) * PAGE_SIZE)};
}
export function resultIdentity(state) {
  return JSON.stringify([state.profileEpoch,state.selectedId,state.clientRequestId,state.runId,state.snapshot?.resultId]);
}
export function emptyMessage(state, busy) {
  if (busy) return '采集中，记录将在任务返回后显示。';
  if (state.error || ['failed','error'].includes(state.snapshot?.status) || state.result?.engine?.status === 'failed') return '采集失败，尚无记录；请查看错误信息与运行详情。';
  return state.result == null ? '开始采集后，在这里查看记录和下载结果。' : '本次结果没有记录，可展开运行详情查看原因。';
}
