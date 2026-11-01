// Fixed, synchronous ISOLATED-world snapshot for the audited media Host.
// Pass this function itself to executeScript; all helpers must remain inside it.
// URLs (including signatures) are transient trusted data, never sandbox output,
// logs or storage. Host must still check document identity and source permission.
export function inspectMediaSources() {
  const windowMs = 30000, sources = [], unique = new Map();
  let blobVideos = 0, recentManifestRequests = 0, manifestRequests = 0;
  const types = {
    m3u8: 'application/vnd.apple.mpegurl', mpd: 'application/dash+xml',
    mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/x-m4v',
    mov: 'video/quicktime', ogv: 'video/ogg', m4a: 'audio/mp4',
    mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg',
    oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav'
  };
  const parse = (raw, relative = false) => {
    if (typeof raw !== 'string' || raw.length > 4096 || !raw.trim()) return null;
    try {
      const url = relative ? new URL(raw, document.baseURI) : new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.href.length > 4096) return null;
      return url;
    } catch { return null; }
  };
  // Resource MIME is a pathname hint, not a verified response Content-Type.
  // Do not treat TS/m4s fragments or query-string suffixes as complete media.
  const extension = url => url.pathname.match(
    /\.(m3u8|mpd|mp4|webm|m4v|mov|ogv|m4a|mp3|aac|ogg|oga|opus|wav)$/i
  )?.[1].toLowerCase();
  const add = (url, mime, playing, source) => {
    const type = typeof mime === 'string' ? mime.slice(0, 128).trim() : '';
    const previous = unique.get(url.href);
    if (previous) {
      previous.playing ||= playing;
      if (!previous.mime) previous.mime = type || types[extension(url)] || '';
      return;
    }
    if (sources.length >= 48) return;
    const row = {url: url.href, mime: type || types[extension(url)] || '', playing, source};
    unique.set(url.href, row);
    sources.push(row);
  };

  const videos = document.querySelectorAll('video');
  for (let i = 0; i < Math.min(videos.length, 24); i++) {
    const video = videos[i], playing = !video.paused && !video.ended;
    let blob = false;
    const read = (raw, mime) => {
      if (typeof raw === 'string' && raw.length <= 4096 && /^blob:/i.test(raw.trim()))
        blob = true;
      const url = parse(raw, true);
      if (url) add(url, mime, playing, 'element');
    };
    const mime = video.getAttribute('type');
    read(video.currentSrc, mime);
    // Read raw src attributes: an empty reflected .src can resolve to the page.
    read(video.getAttribute('src'), mime);
    const children = video.querySelectorAll('source');
    for (let j = 0; j < Math.min(children.length, 4); j++)
      read(children[j].getAttribute('src'), children[j].getAttribute('type'));
    if (blob) blobVideos++;
  }

  let entries = [], now = NaN;
  try {
    if (typeof performance !== 'undefined') {
      now = performance.now();
      if (Number.isFinite(now) && now >= 0) entries = performance.getEntriesByType('resource');
    }
  } catch { entries = []; }
  if (Array.isArray(entries)) {
    // Scan the recorded tail newest first; do not enlarge or clear the page buffer.
    for (let i = entries.length - 1, first = Math.max(0, entries.length - 256); i >= first; i--) {
      const entry = entries[i], start = entry?.startTime;
      if (!Number.isFinite(start) || start < 0 || start > now) continue;
      const url = parse(entry.name);
      if (!url) continue;
      const ext = extension(url);
      if (!ext) continue;
      const manifest = ext === 'm3u8' || ext === 'mpd', recent = now - start <= windowMs;
      // A blob VOD normally requests its manifest only at initialization. Read
      // older manifests still in this document's bounded tail, without watching
      // requests or keeping URLs across snapshots. Direct files keep the window.
      if (!recent && !(blobVideos > 0 && manifest)) continue;
      if (manifest) { manifestRequests++; if (recent) recentManifestRequests++; }
      // A network entry cannot prove which video is playing or whether bytes are valid.
      add(url, types[ext], false, 'resource');
    }
  }
  return {sources, diagnostics: {
    blobVideos, recentManifestRequests, windowMs,
    replaySuggested: blobVideos > 0 && manifestRequests === 0
  }};
}
