// Adapter for the single, explicitly marked acceptance player. Do not reuse
// these selectors for an unverified site or infer its ordering from the DOM.
const pathPattern = /^\/video-auto-skip-fixture\/ep-([1-9][0-9]{0,5})(\/backup)?$/;
const idPattern = /^[a-z0-9][a-z0-9_-]{0,30}$/;
const playerSelector = 'main[data-od-series][data-od-season][data-od-episode][data-od-line][data-od-title][data-od-order]';
const positiveOrder = raw => typeof raw === 'string' && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : null;

function readRoute(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const route = pathPattern.exec(url.pathname);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || !route ||
      url.search || url.hash) return null;
  return {url, order: Number(route[1]), line: route[2] ? 'backup' : 'primary'};
}

function visible(el) {
  return !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
    (typeof el.checkVisibility !== 'function' || el.checkVisibility({visibilityProperty: true, opacityProperty: true})) &&
    el.getClientRects().length > 0;
}

export function identifyLocalPlayer(doc, href) {
  const route = readRoute(href);
  if (!route) return {state: 'unsupported', reason: '当前页面不在此候选支持的播放器范围内。'};
  const [root, ...others] = doc.querySelectorAll(playerSelector);
  if (!root || others.length) return {state: 'unavailable', reason: '无法唯一确认当前作品与剧集。'};
  const {odSeries: work, odSeason: season, odEpisode: episode, odLine: line, odTitle: rawTitle, odOrder} = root.dataset;
  const order = positiveOrder(odOrder), title = rawTitle?.trim();
  if (![work, season, episode, line].every(value => typeof value === 'string' && idPattern.test(value)) ||
      !title || title.length > 100 || /[\x00-\x1f\x7f]/.test(title) || order !== route.order || route.line !== line) {
    return {state: 'unavailable', reason: '页面和播放器的剧集或线路标识不一致。'};
  }
  const [media, ...additional] = root.querySelectorAll('video[data-od-feature]');
  if (!media || additional.length || !visible(media) || media.error) {
    return {state: 'unavailable', reason: '无法唯一确认当前正片播放器。'};
  }
  // Source URLs are used only for in-memory identity, never sent to the sidebar.
  const source = media.currentSrc;
  if (!source) return {state: 'unavailable', reason: '正片正在加载。'};
  return {state: 'ready', root, media, source, href, order, context: {
    seriesKey: 'local:' + work + ':' + season,
    episodeKey: episode,
    title,
    season,
    episode: String(order),
    line,
  }};
}

const denied = reason => ({reason});

export function nextLocalEpisode(binding) {
  const {root, context, order} = binding;
  if (root.querySelector('[data-od-native-next]')) return denied('next-site-handling');
  const playlist = root.querySelectorAll('[data-od-playlist-complete]');
  if (playlist.length !== 1) return denied('next-list-incomplete');
  const anchors = [...playlist[0].querySelectorAll('a[data-od-episode][data-od-order][data-od-line]')];
  if (!anchors.length || anchors.length > 500) return denied('next-not-confirmed');
  const byEpisode = new Map(), byOrder = new Map();
  for (const link of anchors) {
    const {odEpisode: episode, odOrder, odLine: line} = link.dataset;
    const n = positiveOrder(odOrder);
    const route = readRoute(link.href);
    if (!idPattern.test(episode ?? '') || !idPattern.test(line ?? '') || !n || !route || route.url.origin !== new URL(binding.href).origin ||
        route.order !== n || route.line !== line) return denied('next-not-confirmed');
    if ((byEpisode.has(episode) && byEpisode.get(episode).order !== n) ||
        (byOrder.has(n) && byOrder.get(n) !== episode)) return denied('next-not-confirmed');
    if (!byEpisode.has(episode)) byEpisode.set(episode, {order: n, entries: []});
    byEpisode.get(episode).entries.push({line, link, href: route.url.href});
    byOrder.set(n, episode);
  }
  if (byOrder.get(order) !== context.episodeKey) return denied('next-not-confirmed');
  const upcoming = [...byOrder].filter(([n]) => n > order).sort(([a], [b]) => a - b);
  if (!upcoming.length) return denied('next-list-end');
  const [[nextOrder, key]] = upcoming;
  if (nextOrder !== order + 1) return denied('next-list-gap');
  const candidates = byEpisode.get(key).entries.filter(({line, link}) => line === context.line && visible(link) &&
    !link.hasAttribute('download') && (!link.target || link.target.toLowerCase() === '_self') &&
    link.getAttribute('aria-disabled') !== 'true');
  const targets = new Set(candidates.map(({href}) => href));
  if (!targets.size) return denied('next-line-unavailable');
  if (targets.size !== 1) return denied('next-not-confirmed');
  const {link, href, line} = candidates[0];
  return {target: {link, href, episodeKey: key, seriesKey: context.seriesKey, line}};
}
