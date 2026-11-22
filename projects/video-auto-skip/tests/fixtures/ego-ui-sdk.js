const root = document.querySelector('#tool');
const response = await fetch('/tool.html');
if (!response.ok) throw new Error('Candidate HTML was not served');
root.innerHTML = await response.text();

const iyf = new URLSearchParams(location.search).get('site') === 'iyf';
const context = iyf ? {seriesKey: 'iyf:ego-fixture', episodeKey: 'episode-200', title: 'iYF 测试作品', episode: 200} :
  {seriesKey: 'local:ego-fixture:season-1', episodeKey: 'episode-1', title: '测试作品', season: 1, episode: 1, line: '测试线路'};
const binding = {id: 'ego-ui-binding'};
const key = 'rules.v1';
const receipt = [];
let duration = iyf ? 1243.563 : 2700;
const read = () => JSON.parse(localStorage.getItem(key)) ?? {etag: '0', value: {series: {}}};
const source = document.querySelector('#source-length');
if (iyf) source.textContent = '换到 19:16 线路';
source.addEventListener('click', () => { duration = iyf ? 1156.011 : 2880; });

// This fixture provides only the public SDK calls exercised by the shipped editor.
globalThis.OpenDeskTool = {
  root,
  async request(name, args) {
    if (name === 'storage.get' && args.key === key && args.withEtag) {
      const record = read();
      receipt.push({op: 'storage.get', etag: record.etag});
      return record;
    }
    if (name === 'page.request' && (args.operation === 'video.snapshot' ||
      args.operation === 'video.refresh' && args.payload.binding.id === binding.id)) {
      return {state: 'ready', binding, context, media: {duration, revision: duration, time: 42, paused: true}};
    }
    if (name === 'page.request' && args.operation === 'video.save') {
      const {scope, rules, ifMatch, binding: target} = args.payload;
      const current = read();
      if (target.id !== binding.id) return {state: 'binding-changed'};
      if (ifMatch !== current.etag) return {state: 'conflict'};
      const work = current.value.series[context.seriesKey] ??= {defaults: {}, episodes: {}};
      if (scope === 'series') work.defaults = rules;
      else if (scope !== 'episode') throw new Error('Unexpected save scope');
      else if (Object.keys(rules).length) work.episodes[context.episodeKey] = rules;
      else delete work.episodes[context.episodeKey];
      current.etag = String(Number(current.etag) + 1);
      localStorage.setItem(key, JSON.stringify(current));
      receipt.push({op: 'video.save', scope, rules, etag: current.etag});
      return {saved: true};
    }
    throw new Error('Unimplemented mock SDK request: ' + name + '/' + args.operation);
  },
  ui: {
    notify({message}) { receipt.push({op: 'ui.notify', message}); },
  },
};
globalThis.egoUiFixture = {receipt, read, seedDefault(rules) {
  const record = read();
  record.value.series[context.seriesKey] = {defaults: rules, episodes: {}};
  record.etag = String(Number(record.etag) + 1);
  localStorage.setItem(key, JSON.stringify(record));
}, seedEpisode(rules) {
  const record = read();
  record.value.series[context.seriesKey].episodes[context.episodeKey] = rules;
  record.etag = String(Number(record.etag) + 1);
  localStorage.setItem(key, JSON.stringify(record));
}};
await import('/tool.js');
