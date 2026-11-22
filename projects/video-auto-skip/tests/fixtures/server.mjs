import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {promisify} from 'node:util';

const exec = promisify(execFile);
export const prefix = '/video-auto-skip-fixture';
export const clips = Object.freeze({one: 210, two: 240, three: 188, alternate: 195, long: 420, ad: 4});
const lines = ['primary', 'backup'];
const titles = ['one', 'two', 'three'];
export const route = (episode, line = 'primary') => prefix + '/ep-' + episode + (line === 'primary' ? '' : '/backup');

function documentHtml(origin, episode, line) {
  const clip = name => origin + prefix + '/media/' + name + '.webm';
  const links = [3, 2, 1].flatMap(number => [...lines].reverse().map(item =>
    '<li><a data-od-episode="' + number + '" data-od-order="' + number + '" data-od-line="' + item +
      '" href="' + route(number, item) + '">Episode ' + number + ' (' + item + ')</a></li>')).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Local series fixture</title>' +
    '<style>body{font:16px system-ui;margin:20px}video{display:block;background:#111;max-width:100%}[hidden]{display:none!important}button{margin:4px}</style>' +
    '<main data-od-series="native-series" data-od-title="Local Series" data-od-season="1" data-od-episode="' + episode +
    '" data-od-order="' + episode + '" data-od-line="' + line + '">' +
    '<h1>Local Series · Season 1 · Episode ' + episode + ' · ' + line + '</h1>' +
    '<video data-od-feature controls playsinline preload="auto" muted width="480" height="270" src="' + clip(titles[episode - 1]) + '"></video>' +
    '<button id="fixture-play">Play / pause</button>' +
    '<form id="fixture-seek"><label>Seek seconds <input id="fixture-time" type="number" min="0" step="any" required></label><button id="fixture-seek-submit">Seek</button></form>' +
    '<button id="fixture-source" data-src="' + clip('alternate') + '">Replace feature source</button>' +
    '<button id="fixture-long-source" data-src="' + clip('long') + '">Use a seven-minute source</button>' +
    '<button id="fixture-open-stream" data-src="' + clip('alternate') + '">Open stream with no declared end</button>' +
    '<label><input id="fixture-autoplay" type="checkbox"> Start subsequent episodes on arrival</label>' +
    '<ul data-od-playlist-complete>' + links + '</ul></main>' +
    '<aside aria-label="Advertisement"><video controls muted preload="metadata" width="192" height="108" src="' + clip('ad') + '"></video>' +
    '<video hidden muted preload="none" src="' + clip('ad') + '"></video></aside>' +
    '<output id="media-evidence" hidden>[]</output><script src="' + prefix + '/playback.js"></script></html>';
}

function byteRange(header, size) {
  if (!header) return {start: 0, end: size - 1};
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && start < size && start <= end ? {start, end} : null;
}

export async function startFixture({directory, port = 0, signal, durations = clips, renderPage = documentHtml} = {}) {
  // Generated media lives only in the caller's temporary directory.
  const files = new Map();
  const colors = ['navy', 'teal', 'purple', 'olive', 'indigo', 'maroon'];
  const entries = Object.entries(durations);
  for (const [index, [name, seconds]] of entries.entries()) {
    const file = path.join(directory, name + '.webm');
    await exec('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'color=c=' + colors[index] + ':s=160x90:r=6', '-t', String(seconds), '-an',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', file],
      {timeout: 30_000, signal});
    files.set(prefix + '/media/' + name + '.webm', {file, size: (await stat(file)).size});
  }
  const script = await readFile(new URL('./playback.js', import.meta.url));
  const visits = new Map();
  let origin;
  const server = createServer((request, response) => {
    const pathname = request.url;
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, {Allow: 'GET, HEAD'}).end(); return; }
    const clip = files.get(pathname);
    if (clip) {
      const range = byteRange(request.headers.range, clip.size);
      if (!range) { response.writeHead(416, {'Content-Range': 'bytes */' + clip.size}).end(); return; }
      const {start, end} = range;
      const headers = {'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1};
      if (request.headers.range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + clip.size;
      response.writeHead(request.headers.range ? 206 : 200, headers);
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(clip.file, {start, end});
      response.on('close', () => stream.destroy());
      stream.on('error', () => response.destroy());
      stream.pipe(response);
      return;
    }
    const episode = new RegExp('^' + prefix + '/ep-([1-3])(/backup)?$').exec(pathname);
    const isScript = pathname === prefix + '/playback.js';
    if (!episode && !isScript) { response.writeHead(404).end(); return; }
    if (episode && request.method === 'GET') visits.set(pathname, (visits.get(pathname) ?? 0) + 1);
    const body = isScript ? script : Buffer.from(renderPage(origin, Number(episode[1]), episode[2] ? 'backup' : 'primary'));
    response.writeHead(200, {'Content-Type': isScript ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
      'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff'}).end(request.method === 'HEAD' ? undefined : body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  return {origin, episodeLoads: (episode, line) => visits.get(route(episode, line)) ?? 0,
    close: () => new Promise(resolve => {server.close(resolve); server.closeAllConnections();})};
}
