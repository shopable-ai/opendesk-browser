// OpenDesk 开发 → Page JS. One read-only inventory; review the site UI separately.
async function main() {
  // Constrain the probe to the requested top-level episode. Never record the URL.
  const ids = new URLSearchParams(location.search).getAll('id');
  if (window !== window.top || location.origin !== 'https://www.iyf.tv' ||
      location.pathname !== '/play/O3MkOSlztbO' ||
      ids.length !== 1 || ids[0] !== 'fanqXazJzVZ') {
    return JSON.stringify({ status: 'BLOCKED', reason: 'TARGET_NOT_MATCHED' });
  }

  const documents = [], media = [];
  const budget = { documents: 16, media: 32, depth: 3, ranges: 12 };
  let truncated = false;
  const seconds = (n) => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
  const visible = (node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    [...node.getClientRects()].some((r) => r.width > 0 && r.height > 0);

  const walk = (doc, label, depth, frameVisible) => {
    if (documents.length >= budget.documents) { truncated = true; return; }
    if (!doc) { documents.push({ label, readable: false, frameVisible }); return; }
    const players = doc.querySelectorAll('video,audio');
    const frames = doc.querySelectorAll('iframe,frame');
    documents.push({ label, readable: true, frameVisible, mediaCount: players.length, frameCount: frames.length });
    for (const node of players) {
      if (media.length >= budget.media) { truncated = true; break; }
      const ranges = node.seekable;
      const seekable = [];
      for (let i = 0; i < Math.min(ranges.length, budget.ranges); i++) {
        seekable.push([seconds(ranges.start(i)), seconds(ranges.end(i))]);
      }
      if (ranges.length > budget.ranges) truncated = true;
      media.push({ label: label + '.m' + media.length, kind: node.localName, visible: frameVisible && visible(node),
        sourcePresent: Boolean(node.currentSrc || node.srcObject), readyState: node.readyState, paused: node.paused,
        seeking: node.seeking, ended: node.ended, muted: node.muted, currentTime: seconds(node.currentTime),
        duration: seconds(node.duration), durationState: Number.isNaN(node.duration) ? 'unknown' :
          Number.isFinite(node.duration) ? 'finite' : 'unbounded', seekable });
    }
    if (depth >= budget.depth) { truncated ||= frames.length > 0; return; }
    for (let i = 0; i < frames.length; i++) {
      if (documents.length >= budget.documents) { truncated = true; break; }
      const frame = frames[i];
      walk(frame.contentDocument, label + '.f' + i, depth + 1, frameVisible && visible(frame));
    }
  };

  walk(document, 'top', 0, true);
  const report = { status: 'OBSERVATION_ONLY', truncated, documents, media };
  // Page preview displays at most 2048 characters. Drop complete rows, never cut JSON.
  while (JSON.stringify(report).length > 1800) {
    report.truncated = true;
    if (media.length) media.pop();
    else documents.pop();
  }
  // Labels identify rows in this receipt only. They never select a player in another run.
  return JSON.stringify(report);
}
