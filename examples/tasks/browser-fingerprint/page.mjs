import {FIELDS,readEnvironment,comparison,languageCacheMismatch} from './model.mjs';

const get = id => document.getElementById(id);
const labels = {same:'与基线一致',changed:'已变化',unavailable:'不可比较'};
let current, baseline;
const rows = new Map();
for (const [key,label,source] of FIELDS) {
  const row = document.createElement('tr');
  const heading = document.createElement('th'); heading.scope = 'row';
  const name = document.createElement('strong'); name.textContent = label;
  const origin = document.createElement('small'); origin.textContent = source;
  heading.append(name,origin);
  const cells = Array.from({length:3}, () => document.createElement('td'));
  row.append(heading,...cells); get('fields').append(row);
  rows.set(key,{row,cells});
}

function format(reading, key) {
  if (reading.status !== 'available') return '不可读取 / 浏览器未提供';
  const value = reading.value;
  if (key === 'uaCH') return `${value.platform} · ${value.mobile ? '移动设备' : '桌面设备'}\n`+
    value.brands.map(({brand,version}) => `${brand} ${version}`).join(' / ');
  if (key === 'viewport' || key === 'screen') return `${value.width} × ${value.height}`;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
const time = iso => new Date(iso).toLocaleTimeString('zh-CN',{hour12:false});
function report() {
  return {schema:'opendesk.fingerprint-page.v1',source:'WEBSITE_MAIN_SELF_READ',
    baseline,current,comparison:comparison(current,baseline),
    languageCacheMismatch:languageCacheMismatch(current),
    httpAcceptLanguage:'UNVERIFIABLE',geolocation:'UNSUPPORTED',
    note:'本页基线不保证是未覆盖的原始环境；差异不是扩展执行成功证明。'};
}
function render() {
  const compared = comparison(current,baseline);
  for (const value of compared) {
    const {row,cells} = rows.get(value.key);
    row.dataset.state = value.status;
    const values = [format(value.current,value.key),format(value.baseline,value.key),labels[value.status]];
    cells.forEach((cell,i) => { if (cell.textContent !== values[i]) cell.textContent = values[i]; });
  }
  const changed = compared.filter(row => row.status === 'changed').length;
  const unknown = compared.filter(row => row.status === 'unavailable').length;
  get('comparison').textContent = `${changed} 项变化 · ${compared.length-changed-unknown} 项与基线一致 · ${unknown} 项不可比较`;
  get('target').textContent = current.page;
  get('baseline-time').textContent = `本页基线 ${time(baseline.capturedAt)}`;
  get('sampling').textContent = `${get('auto').checked ? '每秒自动读取' : '自动读取已暂停'} · 最近采集 ${time(current.capturedAt)}`;
  get('cache-warning').hidden = !languageCacheMismatch(current);
  if (get('report').open) get('report-json').textContent = JSON.stringify(report(),null,2);
}
function sample() {
  current = readEnvironment(window);
  baseline ||= current;
  render();
}
function feedback(message) { get('feedback').textContent = message; }
get('refresh').addEventListener('click',() => {sample();feedback('已读取当前网页实际值。');});
get('auto').addEventListener('change',() => {
  sample(); feedback(get('auto').checked ? '自动读取已恢复。' : '已暂停自动读取，可手动立即读取。');
});
get('baseline').addEventListener('click',() => {
  sample(); baseline = current; render();
  feedback('已记录当前值为本页基线；此操作不会恢复或修改浏览器环境。');
});
get('report').addEventListener('toggle',() => {
  if (get('report').open) get('report-json').textContent = JSON.stringify(report(),null,2);
});
get('copy').addEventListener('click',async () => {
  sample();
  try {
    await navigator.clipboard.writeText(JSON.stringify(report(),null,2));
    feedback('报告已复制，包含本页基线和当前实际值。');
  } catch {
    get('report').open = true;
    get('report-json').textContent = JSON.stringify(report(),null,2);
    get('report-json').focus();
    feedback('浏览器未允许剪贴板写入，请在展开的 JSON 报告中选择并复制。');
  }
});
get('download').addEventListener('click',() => {
  sample();
  const url = URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)+'\n'],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'browser-environment-'+current.capturedAt.replace(/[:.]/g,'-')+'.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  feedback('已请求下载 JSON 报告，请在浏览器下载列表核对文件。');
});
let timer;
function startSampling() {
  clearInterval(timer);
  timer = setInterval(() => {if (!document.hidden && get('auto').checked) sample();},1000);
}
startSampling();
document.addEventListener('visibilitychange',() => {if (!document.hidden && get('auto').checked) sample();});
window.addEventListener('pagehide',() => clearInterval(timer));
window.addEventListener('pageshow',event => {if (event.persisted) {startSampling();sample();}});
sample();
