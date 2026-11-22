const playerSelector = 'aa-videoplayer vg-player#main-player';
export const iyfMediaSelector = playerSelector + ' > video#video_player';
const listSelector = '#playPageBottom .playlist-new app-list';
const token = /^[a-zA-Z0-9_-]{1,48}$/;
const episodeNumber = /^[1-9][0-9]{0,5}$/;
const text = el => el?.textContent.trim();
const only = (root, selector) => {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
};
const visible = el => !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0 &&
  (typeof el.checkVisibility !== 'function' || el.checkVisibility({visibilityProperty: true, opacityProperty: true}));

export function isIyfPage(href) {
  try {
    const url = new URL(href);
    return url.origin === 'https://www.iyf.tv' && url.pathname.startsWith('/play/');
  } catch { return false; }
}

function route(href) {
  if (!isIyfPage(href)) return null;
  const url = new URL(href);
  const work = url.pathname.slice('/play/'.length), id = url.searchParams.get('id');
  if (url.username || url.password || url.hash || !token.test(work) || !id || !token.test(id) ||
      [...url.searchParams].length !== 1) return null;
  return {work, id, href: url.href};
}

function entry(link) {
  const target = route(link.href);
  const label = link.getAttribute('title')?.trim();
  if (!target || !episodeNumber.test(label ?? '') || text(link) !== label ||
      link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self') ||
      link.getAttribute('aria-disabled') === 'true') return null;
  return {...target, order: Number(label), link};
}

const entries = '.n-media-list app-media-button a.media-button';
const unavailable = reason => ({state: 'unavailable', reason});

// iYF's HLS player can move a cold seek from just before a segment to
// just inside it. A nearby position alone does not establish that correction.
export function isIyfBufferNudge(media, target, position) {
  if (!(position > target && position - target <= 0.25)) return false;
  try {
    const ranges = media.buffered;
    let atSegmentStart = false;
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i), end = ranges.end(i);
      if (start <= target && target < end) return false;
      if (target < start && start <= position && position < end && position - start <= 0.1) atSegmentStart = true;
    }
    return atSegmentStart;
  } catch { return false; }
}

export function identifyIyfPlayer(doc, href, previous) {
  const current = route(href);
  const info = only(doc, 'app-video-info .video-detail');
  const list = only(doc, listSelector);
  const root = only(doc, playerSelector);
  if (!current || !info || !list || !root) return unavailable('无法唯一确认 iYF 的作品、选集和播放器。');
  const heading = info.querySelectorAll(':scope > div > h4.d-inline');
  const playerHeading = root.querySelectorAll(':scope > .player-title-bar .player-title > span');
  const title = text(heading[0]), number = text(heading[1]);
  const activeLink = only(list, entries + '.active');
  const active = activeLink && entry(activeLink);
  if (heading.length !== 2 || !title || title.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(title) || !episodeNumber.test(number ?? '') ||
      active?.href !== current.href || String(active.order) !== number) {
    return unavailable('iYF 的网页、选集和播放器剧集尚未一致。');
  }

  const media = only(doc, iyfMediaSelector);
  const hasMatchingTitle = playerHeading.length === 2 &&
    title === text(playerHeading[0]) && number === text(playerHeading[1]);
  // The floating layout removes the title bar without reloading the video.
  const sameFloatingVideo = previous && !root.querySelector(':scope > .player-title-bar') &&
    root.querySelector(':scope > .floating-player-controls .close-small-player-button') &&
    previous.root === root && previous.media === media && previous.source === media?.currentSrc &&
    previous.href === current.href && previous.context.title === title && previous.context.episode === number;
  if (!hasMatchingTitle && !sameFloatingVideo) return unavailable('iYF 的网页、选集和播放器剧集尚未一致。');
  if (!media || media.error || !visible(media) || !media.currentSrc || media.readyState < 1 ||
      media.videoWidth <= 0 || media.videoHeight <= 0 || root.querySelector('iframe') ||
      [...root.querySelectorAll('video')].some(video => video !== media &&
        (video.currentSrc || !video.paused)) ||
      [...root.querySelectorAll('#coin-or-upgrade-to-skip-ad > *, #player-message-dialog > *')].some(visible)) {
    return unavailable('iYF 正片正在加载，或播放器当前无法唯一确认。');
  }
  return {state: 'ready', site: 'iyf', root, media, source: media.currentSrc, href: current.href,
    list, work: current.work, order: active.order, context: {
      seriesKey: 'iyf:' + current.work, episodeKey: current.id, title, episode: number,
      season: '季号未提供', line: '线路未标识',
    }};
}

// iYF can load the next source before it updates the URL and episode labels.
// A new media identity near the end cannot inherit the old episode's rules.
export function createIyfReader(doc) {
  let last, continuous = false;
  const read = href => {
    const own = identifyIyfPlayer(doc, href, continuous ? last : null);
    continuous = false;
    if (own.state !== 'ready') return own;
    const {media} = own;
    if (last?.href === own.href && (last.media !== media || last.source !== own.source) && last.nearEnd) {
      return unavailable('iYF 正在切换播放内容，等待剧集身份确认。');
    }
    const nearEnd = media.ended || (Number.isFinite(media.duration) && media.duration > 0 &&
      media.duration - media.currentTime <= 10);
    last = {...own, nearEnd};
    continuous = true;
    return own;
  };
  read.invalidate = media => { if (last?.media === media) continuous = false; };
  return read;
}

export function nextIyfEpisode(own) {
  // The rendered range is a pagination group; it is not a season or a line.
  const group = only(own.list, '.medias-selector-expandable-tabs-nav:not(.medias-selector-expandable-tabs-nav-hidden) > button.active.playing');
  const range = /^([0-9]{1,6})\s*[-–]\s*([0-9]{1,6})$/.exec(text(group) ?? '');
  if (!range || !visible(group) || own.order < +range[1] || own.order > +range[2]) return {reason: 'next-list-incomplete'};
  const next = own.order + 1;
  if (next > +range[2]) return {reason: 'next-list-incomplete'};
  const byOrder = new Map(), byId = new Map();
  for (const link of own.list.querySelectorAll(entries)) {
    const row = entry(link);
    if (!row || row.work !== own.work || row.order < +range[1] || row.order > +range[2] ||
        (byOrder.has(row.order) && byOrder.get(row.order) !== row.id) ||
        (byId.has(row.id) && byId.get(row.id) !== row.order)) return {reason: 'next-not-confirmed'};
    byOrder.set(row.order, row.id);
    byId.set(row.id, row.order);
  }
  if (byOrder.get(own.order) !== own.context.episodeKey) return {reason: 'next-not-confirmed'};
  if (!byOrder.has(next)) return {reason: 'next-list-gap'};
  // The real site has independently switched episodes even before its active
  // link updated. There is no verified opt-out, same-line identity, or app receipt.
  return {reason: 'next-site-handling'};
}
