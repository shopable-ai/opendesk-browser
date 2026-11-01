import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {inspectMediaSources} from '../trusted/discovery.js';

const resource = (name, startTime = 59900) => ({name, startTime});
const media = ({currentSrc = '', src = null, mime = '', paused = false,
  ended = false, sources = []} = {}) => ({
  currentSrc, paused, ended,
  getAttribute: name => name === 'src' ? src : name === 'type' ? mime : null,
  querySelectorAll: selector => {
    assert.equal(selector, 'source');
    return sources.map(({src = null, mime = ''}) => ({
      getAttribute: name => name === 'src' ? src : name === 'type' ? mime : null
    }));
  }
});

function inspect({videos = [], entries = [], now = 60000,
  baseURI = 'https://page.example/watch/index.html', performance} = {}) {
  const document = {
    baseURI,
    querySelectorAll: selector => {
      assert.equal(selector, 'video');
      return videos;
    }
  };
  Object.defineProperties(document, {
    cookie: {get: () => assert.fail('must not read cookies')},
    documentElement: {get: () => assert.fail('must not read page HTML')}
  });
  const context = {
    URL, document,
    performance: performance ?? {
      now: () => now,
      getEntriesByType: type => {
        assert.equal(type, 'resource');
        return entries;
      }
    },
    fetch: () => assert.fail('snapshot must not fetch'),
    setTimeout: () => assert.fail('snapshot must not start timers'),
    PerformanceObserver: class {
      constructor() { assert.fail('snapshot must not start observers'); }
    },
    console: {log: () => assert.fail('must not log media URLs')},
    localStorage: new Proxy({}, {get: () => assert.fail('must not persist media URLs')})
  };
  // Mirrors executeScript's function copy: no imported helpers or closures exist.
  const result = runInNewContext(`(${inspectMediaSources.toString()})()`,
    context, {timeout: 1000});
  return JSON.parse(JSON.stringify(result));
}

test('serialized snapshot finds recent HLS and DASH requests behind a blob video', () => {
  const result = inspect({
    videos: [media({currentSrc: 'blob:https://page.example/player'})],
    entries: [
      resource('https://cdn.example/master.m3u8?token=ephemeral'),
      resource('https://cdn.example/manifest.mpd'),
      resource('https://cdn.example/segment.ts'),
      resource('https://page.example/player.js')
    ]
  });
  assert.deepEqual(result, {
    sources: [
      {url: 'https://cdn.example/manifest.mpd', mime: 'application/dash+xml',
        playing: false, source: 'resource'},
      {url: 'https://cdn.example/master.m3u8?token=ephemeral',
        mime: 'application/vnd.apple.mpegurl', playing: false, source: 'resource'}
    ],
    diagnostics: {blobVideos: 1, recentManifestRequests: 2, windowMs: 30000,
      replaySuggested: false}
  });
});

test('element sources resolve against baseURI and take precedence over resource duplicates', () => {
  const result = inspect({
    videos: [media({currentSrc: 'https://page.example/watch/clip.mp4', src: './clip.mp4',
      sources: [{src: '../alternate.webm', mime: 'video/webm'}]})],
    entries: [resource('https://page.example/watch/clip.mp4')]
  });
  assert.deepEqual(result.sources, [
    {url: 'https://page.example/watch/clip.mp4', mime: 'video/mp4',
      playing: true, source: 'element'},
    {url: 'https://page.example/alternate.webm', mime: 'video/webm',
      playing: true, source: 'element'}
  ]);
});

test('empty src attributes never resolve to the page even when reflected src does', () => {
  const emptySource = {
    src: 'https://page.example/watch.mp4', getAttribute: () => ''
  };
  const emptyVideo = media({src: ''});
  emptyVideo.src = 'https://page.example/watch.mp4';
  emptyVideo.querySelectorAll = () => [emptySource];
  assert.deepEqual(inspect({baseURI: 'https://page.example/watch.mp4',
    videos: [emptyVideo, media({src: '   '})],
    entries: [resource(''), resource('  ')]
  }), {
    sources: [],
    diagnostics: {blobVideos: 0, recentManifestRequests: 0, windowMs: 30000,
      replaySuggested: false}
  });
});

test('extensionless element sources preserve bounded MIME and actual playback state', () => {
  const result = inspect({videos: [
    media({src: '/media?id=1', mime: 'video/mp4', paused: true}),
    media({currentSrc: 'https://cdn.example/media?id=2', mime: 'x'.repeat(200), ended: true})
  ]});
  assert.deepEqual(result.sources, [
    {url: 'https://page.example/media?id=1', mime: 'video/mp4',
      playing: false, source: 'element'},
    {url: 'https://cdn.example/media?id=2', mime: 'x'.repeat(128),
      playing: false, source: 'element'}
  ]);
});

test('deduplication retains an active element when another video or request shares its URL', () => {
  const result = inspect({videos: [
    media({src: '/clip.mp4', paused: true}),
    media({currentSrc: 'https://page.example/clip.mp4'})
  ], entries: [resource('https://page.example/clip.mp4')]});
  assert.deepEqual(result.sources, [{url: 'https://page.example/clip.mp4',
    mime: 'video/mp4', playing: true, source: 'element'}]);
});

test('special protocols, URL credentials, malformed and excessive URLs are excluded', () => {
  const unsafe = [
    '', '   ', 'data:video/mp4;base64,YQ==', 'javascript:movie.mp4',
    'file:///private/movie.mp4', 'ftp://cdn.example/movie.mp4',
    'blob:https://page.example/movie.mp4', 'https://user:pass@cdn.example/a.m3u8',
    '//user@cdn.example/a.mpd', 'https://:pass@cdn.example/a.mp4',
    'http://[broken/movie.mp4', 'https://cdn.example/' + 'a'.repeat(4096) + '.mp4',
    null, 42
  ];
  const result = inspect({videos: unsafe.map(src => media({src})),
    entries: unsafe.map(name => resource(name))});
  assert.deepEqual(result.sources, []);
  assert.equal(result.diagnostics.recentManifestRequests, 0);
});

test('URL length is bounded both before and after absolute URL serialization', () => {
  const prefix = 'https://cdn.example/';
  const exact = prefix + 'a'.repeat(4096 - prefix.length - 4) + '.mp4';
  const result = inspect({videos: [media({src: exact}),
    media({src: prefix + 'é'.repeat(1000) + '.mp4'}),
    media({src: './' + 'a'.repeat(4090) + '.mp4'})],
    entries: [resource(exact + 'a'), resource(prefix + 'é'.repeat(1000) + '.mp4')]});
  assert.deepEqual(result.sources.map(row => row.url), [exact]);
});

test('resource candidates use explicit pathname suffixes, never query or fragment guesses', () => {
  const result = inspect({entries: [
    resource('https://cdn.example/UPPER.M3U8?token=short'),
    resource('https://cdn.example/clip.WEBM#t=2'),
    resource('https://cdn.example/audio.m4a'),
    resource('https://cdn.example/clip.mp4?range=0-100'),
    resource('https://cdn.example/api?file=master.m3u8'),
    resource('https://cdn.example/player.js#master.mpd'),
    resource('https://cdn.example/fake.mp4.js'),
    resource('https://cdn.example/part.ts'),
    resource('https://cdn.example/part.m4s')
  ]});
  assert.deepEqual(result.sources, [
    {url: 'https://cdn.example/clip.mp4?range=0-100', mime: 'video/mp4',
      playing: false, source: 'resource'},
    {url: 'https://cdn.example/audio.m4a', mime: 'audio/mp4',
      playing: false, source: 'resource'},
    {url: 'https://cdn.example/clip.WEBM#t=2', mime: 'video/webm',
      playing: false, source: 'resource'},
    {url: 'https://cdn.example/UPPER.M3U8?token=short', mime: 'application/vnd.apple.mpegurl',
      playing: false, source: 'resource'}
  ]);
  assert.equal(result.diagnostics.recentManifestRequests, 1);
});

test('only finite request start times within the last 30 seconds are accepted', () => {
  const result = inspect({entries: [
    resource('https://cdn.example/old.m3u8', 29999.9),
    resource('https://cdn.example/boundary.m3u8', 30000),
    resource('https://cdn.example/now.mpd', 60000),
    resource('https://cdn.example/future.mpd', 60001),
    resource('https://cdn.example/nan.mpd', NaN),
    resource('https://cdn.example/infinity.mpd', Infinity),
    resource('https://cdn.example/string.mpd', '59900'),
    resource('https://cdn.example/negative.mpd', -1),
    {name: 'https://cdn.example/missing.mpd'}
  ]});
  assert.deepEqual(result.sources.map(row => row.url), [
    'https://cdn.example/now.mpd', 'https://cdn.example/boundary.m3u8'
  ]);
  assert.equal(result.diagnostics.recentManifestRequests, 2);
});

test('retains old manifest records for a loaded blob video without retaining old direct files', () => {
  const result = inspect({
    now: 600000,
    videos: [media({currentSrc: 'blob:https://page.example/player', paused: true})],
    entries: [
      resource('https://cdn.example/master.m3u8?sig=temporary', 1),
      resource('https://cdn.example/media.mpd', 2),
      resource('https://cdn.example/old.mp4', 3),
      resource('https://cdn.example/future.m3u8', 600001),
      resource('https://cdn.example/invalid.m3u8', NaN)
    ]
  });
  assert.deepEqual(result.sources.map(row => row.url), [
    'https://cdn.example/media.mpd', 'https://cdn.example/master.m3u8?sig=temporary'
  ]);
  assert.equal(result.diagnostics.recentManifestRequests, 0);
  assert.equal(result.diagnostics.replaySuggested, false);
  assert.deepEqual(inspect({now: 600000, entries: [
    resource('https://cdn.example/master.m3u8', 1)
  ]}).sources, [], 'a page without a blob video keeps the original time window');
});

test('retained blob manifests still use the same bounded tail and never survive the document snapshot', () => {
  const videos = [media({currentSrc: 'blob:https://page.example/player'})];
  const result = inspect({now: 600000, videos, entries: [
    resource('https://cdn.example/outside-tail.m3u8', 1),
    ...Array.from({length: 255}, (_, i) => resource(`https://cdn.example/noise-${i}.js`, 2)),
    resource('https://cdn.example/inside-tail.m3u8', 3)
  ]});
  assert.deepEqual(result.sources.map(row => row.url), ['https://cdn.example/inside-tail.m3u8']);
  assert.deepEqual(inspect({videos}).sources, []);
  assert.equal(inspect({videos}).diagnostics.replaySuggested, true);
});

test('only the last 256 resource records are inspected, including non-media records', () => {
  const ignored = {get startTime() { assert.fail('must not inspect records before the tail'); }};
  const result = inspect({entries: [
    resource('https://cdn.example/evicted.m3u8'), ignored,
    ...Array.from({length: 255}, (_, i) => resource(`https://cdn.example/noise-${i}.js`)),
    resource('https://cdn.example/recent.mpd')
  ]});
  assert.deepEqual(result.sources.map(row => row.url), ['https://cdn.example/recent.mpd']);
  assert.equal(result.diagnostics.recentManifestRequests, 1);
});

test('at most 48 candidates are returned while manifest diagnostics still count requests', () => {
  const result = inspect({entries: [
    resource('https://cdn.example/first.m3u8'),
    ...Array.from({length: 60}, (_, i) => resource(`https://cdn.example/clip-${i}.mp4`)),
    resource('https://cdn.example/last.mpd')
  ]});
  assert.equal(result.sources.length, 48);
  assert.equal(result.sources[0].url, 'https://cdn.example/last.mpd');
  assert.equal(result.sources[47].url, 'https://cdn.example/clip-13.mp4');
  assert.equal(result.diagnostics.recentManifestRequests, 2);
});

test('video and child-source inspection remains bounded without expanding DOM lists', () => {
  const child = {getAttribute() { assert.fail('must not read a fifth source'); }};
  const videos = Array.from({length: 24}, (_, i) => media({src: `/video-${i}.mp4`}));
  videos[0].querySelectorAll = () => [
    ...Array.from({length: 4}, (_, i) => ({getAttribute: name =>
      name === 'src' ? `/alternate-${i}.webm` : ''})), child
  ];
  videos.push({get currentSrc() { assert.fail('must not read a 25th video'); }});
  const result = inspect({videos});
  assert.equal(result.sources.length, 28);
  assert.equal(result.sources.at(-1).url, 'https://page.example/video-23.mp4');
});

test('manifest request counts include repeated requests but candidate URLs are unique', () => {
  const result = inspect({entries: [
    resource('https://cdn.example/master.m3u8'),
    resource('https://cdn.example/master.m3u8'),
    resource('https://cdn.example/master.m3u8')
  ]});
  assert.equal(result.sources.length, 1);
  assert.equal(result.diagnostics.recentManifestRequests, 3);
});

test('blob diagnostics are redacted and suggest replay only when no manifest is visible', () => {
  const videos = [media({currentSrc: 'blob:https://page.example/private-id',
    src: 'blob:https://page.example/private-id'})];
  const result = inspect({videos, entries: [
    resource('https://cdn.example/stale-segment.ts?secret=old', 1),
    resource('https://cdn.example/direct.mp4?secret=temporary')
  ]});
  assert.deepEqual(result.diagnostics, {blobVideos: 1, recentManifestRequests: 0,
    windowMs: 30000, replaySuggested: true});
  assert.equal(inspect({videos, entries: [resource('https://cdn.example/new.m3u8')]})
    .diagnostics.replaySuggested, false);
  assert.equal(inspect().diagnostics.replaySuggested, false);
});

test('missing or unavailable Resource Timing preserves element discovery and replay diagnostics', () => {
  for (const performance of [
    {},
    {now: () => NaN, getEntriesByType: () => [resource('https://cdn.example/a.mpd')]},
    {now: () => 60000, getEntriesByType: () => {throw new Error('unavailable');}},
    {now: () => 60000, getEntriesByType: () => null}
  ]) {
    const result = inspect({videos: [media({src: '/clip.mp4'}),
      media({currentSrc: 'blob:https://page.example/player'})], performance});
    assert.deepEqual(result.sources.map(row => row.url), ['https://page.example/clip.mp4']);
    assert.equal(result.diagnostics.replaySuggested, true);
  }
});

test('snapshots neither mutate entries nor retain signed URLs between calls', () => {
  const entries = Object.freeze([Object.freeze(resource('https://cdn.example/a.m3u8?sig=temporary'))]);
  const first = inspect({entries});
  assert.equal(first.sources.length, 1);
  const second = inspect();
  assert.deepEqual(second.sources, []);
  assert.equal(second.diagnostics.recentManifestRequests, 0);
});
