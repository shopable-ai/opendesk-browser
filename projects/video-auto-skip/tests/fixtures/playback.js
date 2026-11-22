const main = document.querySelector('main');
const media = main.querySelector('video[data-od-feature]');
const record = document.querySelector('#media-evidence');
const status = document.querySelector('#fixture-status');
const lastSeek = document.querySelector('#fixture-last-seek');
const events = [];
let stableTime = 0;
let seekOrigin;
const render = () => { record.textContent = JSON.stringify(events); };
const seconds = time => Number.isFinite(time) ? time.toFixed(2) + ' 秒' : '未知';
function renderStatus() {
  const state = media.error ? '媒体出错' : media.readyState < 1 ? '等待媒体' : media.seeking ? '定位中' :
    media.ended ? '已结束' : media.paused ? '暂停' : '播放中';
  status.textContent = state + ' · ' + seconds(media.currentTime) + ' / ' + seconds(media.duration);
}
media.addEventListener('durationchange', renderStatus);
media.addEventListener('emptied', () => {
  lastSeek.textContent = '—';
  renderStatus();
});
for (const type of ['loadedmetadata', 'play', 'playing', 'pause', 'seeking', 'seeked', 'timeupdate', 'ended', 'error']) {
  media.addEventListener(type, () => {
    if (type === 'seeking') seekOrigin ??= stableTime;
    if (type !== 'timeupdate') {
      events.push({type, from: seekOrigin ?? stableTime, time: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : null, paused: media.paused});
      render();
    }
    if (type === 'seeked') lastSeek.textContent = seconds(seekOrigin ?? stableTime) + ' → ' + seconds(media.currentTime);
    if (type === 'seeked' || type === 'loadedmetadata') seekOrigin = undefined;
    if (!media.seeking) stableTime = media.currentTime;
    renderStatus();
  });
}
renderStatus();
document.querySelector('#fixture-play').addEventListener('click', () => {
  if (media.paused) void media.play().catch(() => {});
  else media.pause();
});
document.querySelector('#fixture-seek').addEventListener('submit', event => {
  event.preventDefault();
  const time = document.querySelector('#fixture-time').valueAsNumber;
  if (Number.isFinite(time) && [...Array(media.seekable.length).keys()].some(i =>
    media.seekable.start(i) <= time && time <= media.seekable.end(i))) media.currentTime = time;
});
let streamUrl;
for (const button of document.querySelectorAll('#fixture-source, #fixture-long-source')) button.addEventListener('click', event => {
  const source = event.currentTarget.dataset.src;
  if (media.getAttribute('src') !== source) { stableTime = 0; media.src = source; }
  if (streamUrl) { URL.revokeObjectURL(streamUrl); streamUrl = undefined; }
});
document.querySelector('#fixture-open-stream').addEventListener('click', async event => {
  if (streamUrl) return;
  try {
    const response = await fetch(event.currentTarget.dataset.src);
    if (!response.ok) throw new Error('fixture stream unavailable');
    const bytes = await response.arrayBuffer();
    const source = new MediaSource();
    streamUrl = URL.createObjectURL(source);
    source.addEventListener('sourceopen', () => {
      const buffer = source.addSourceBuffer('video/webm; codecs="vp9"');
      buffer.addEventListener('updateend', () => {
        source.duration = Infinity;
        source.setLiveSeekableRange(0, buffer.buffered.end(0));
      }, {once: true});
      buffer.appendBuffer(bytes);
    }, {once: true});
    stableTime = 0;
    media.src = streamUrl;
  } catch { record.dataset.streamError = 'open-failed'; }
});
// Only this explicit fixture-player preference may start playback after navigation.
// A new, direct visit (including fixture start) never starts on its own.
const preference = document.querySelector('#fixture-autoplay');
preference.checked = sessionStorage.getItem('fixture-autoplay') === 'on';
preference.addEventListener('change', () => sessionStorage.setItem('fixture-autoplay', preference.checked ? 'on' : 'off'));
if (preference.checked && performance.getEntriesByType('navigation')[0]?.type === 'navigate') {
  // Leave time to observe the arrived-but-not-started state before the site starts playback.
  setTimeout(() => { void media.play().catch(() => {}); }, 9000);
}
