import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {createIyfReader, identifyIyfPlayer, nextIyfEpisode} from '../src/page/iyf-player.js';

const href = 'https://www.iyf.tv/play/seriesA?id=episode200';
const href201 = 'https://www.iyf.tv/play/seriesA?id=episode201';
const link = (id, number, active = '') => '<app-media-button><a class="media-button ' + active +
  '" href="/play/seriesA?id=' + id + '" title="' + number + '">' + number + '</a></app-media-button>';

function fixture(t) {
  const {window} = new JSDOM('<app-video-info><div class="video-detail"><div><h4 class="d-inline">作品</h4>' +
    '<h4 class="d-inline" id="episode">200</h4></div></div></app-video-info>' +
    '<aa-videoplayer><div><vg-player id="main-player"><vg-controls class="player-title-bar">' +
    '<div class="player-title"><span>作品</span><span id="player-episode">200</span></div></vg-controls>' +
    '<dn-dialog id="coin-or-upgrade-to-skip-ad"></dn-dialog><video id="video_player"></video></vg-player></div>' +
    '<vg-airplay><video></video></vg-airplay></aa-videoplayer><video id="unrelated"></video>' +
    '<div id="playPageBottom"><a class="media-button" href="/play/unrelated?id=other">201</a>' +
    '<div class="playlist-new"><app-list><div class="medias-selector-expandable-tabs-nav medias-selector-expandable-tabs-nav-hidden">' +
    '<button class="active playing">200-201</button></div><div class="medias-selector-expandable-tabs-nav">' +
    '<button class="active playing">200-201</button></div><div class="n-media-list">' +
    link('episode201', 201) + link('episode200', 200, 'active') + '</div></app-list></div></div>', {url: href});
  t.after(() => window.close());
  window.Element.prototype.getClientRects = () => [{}];
  const doc = window.document, media = doc.querySelector('#video_player');
  let source = 'opaque-current-source';
  Object.defineProperties(media, {
    currentSrc: {get: () => source}, readyState: {value: 4}, videoWidth: {value: 853},
    videoHeight: {value: 480}, duration: {value: 1156, writable: true},
  });
  return {doc, media, setSource: next => {source = next;}};
}

test('iYF requires a matching route, episode labels and sole playable main video', t => {
  const {doc, media} = fixture(t);
  const own = identifyIyfPlayer(doc, href);
  assert.equal(own.state, 'ready');
  assert.equal(own.media, media);
  assert.equal(own.context.episodeKey, 'episode200');
  assert.equal(own.context.season, '季号未提供');
  assert.equal(own.context.line, '线路未标识');
  assert.equal(identifyIyfPlayer(doc, href201).state, 'unavailable');
  assert.equal(identifyIyfPlayer(doc, href + '&id=other').state, 'unavailable');
  assert.equal(identifyIyfPlayer(doc, href.replace('www.iyf.tv', 'www.iyf.tv.example.test')).state, 'unavailable');
  const dialog = doc.querySelector('#coin-or-upgrade-to-skip-ad');
  dialog.innerHTML = '<div>广告</div>';
  assert.equal(identifyIyfPlayer(doc, href).state, 'unavailable');
  dialog.firstElementChild.hidden = true;
  assert.equal(identifyIyfPlayer(doc, href).state, 'ready');
  const other = doc.createElement('video');
  Object.defineProperty(other, 'currentSrc', {value: 'other-source'});
  own.root.append(other);
  assert.equal(identifyIyfPlayer(doc, href).state, 'unavailable');
  other.remove();
  doc.querySelector('#player-episode').textContent = '201';
  assert.equal(identifyIyfPlayer(doc, href).state, 'unavailable');
});

test('iYF waits for new episode identity if the next source loads before the route catches up', t => {
  const {doc, media, setSource} = fixture(t);
  const read = createIyfReader(doc);
  assert.equal(read(href).state, 'ready');
  media.currentTime = 305;
  media.duration = 1150;
  setSource('user-selected-definition');
  assert.equal(read(href).media.duration, 1150);
  media.currentTime = 1145;
  assert.equal(read(href).state, 'ready');
  media.currentTime = 0;
  setSource('next-episode-source');
  assert.equal(read(href).state, 'unavailable');
  doc.querySelector('#player-episode').textContent = '201';
  doc.querySelector('#episode').textContent = '201';
  doc.querySelector('a[title="200"]').classList.remove('active');
  doc.querySelector('a[title="201"]').classList.add('active');
  assert.equal(read(href201).context.episode, '201');
});

test('iYF does not bind a short replacement in the main video slot while the feature title is gone', t => {
  const {doc, media, setSource} = fixture(t);
  const read = createIyfReader(doc);
  media.currentTime = 1147;
  assert.equal(read(href).state, 'ready');
  doc.querySelector('.player-title-bar').remove();
  setSource('site-interstitial');
  media.currentTime = 0;
  media.duration = 19.767;
  assert.equal(read(href).state, 'unavailable');
});

test('iYF keeps only the verified current media when the floating layout removes the title', t => {
  const {doc, media, setSource} = fixture(t);
  const read = createIyfReader(doc);
  const {root} = read(href);
  const titleBar = root.querySelector('.player-title-bar');
  titleBar.remove();
  root.insertAdjacentHTML('afterbegin', '<div class="floating-player-controls"><button class="close-small-player-button"></button></div>');
  assert.equal(createIyfReader(doc)(href).state, 'unavailable', 'A floating player cannot establish a new identity');
  assert.equal(read(href).media, media, 'Moving the same video must preserve its binding');
  doc.querySelector('#episode').textContent = '201';
  assert.equal(read(href).state, 'unavailable', 'Conflicting episode labels must stop playback automation');
  doc.querySelector('#episode').textContent = '200';
  assert.equal(read(href).state, 'unavailable', 'A lost identity must be verified again');
  root.prepend(titleBar);
  assert.equal(read(href).media, media);
  titleBar.remove();
  setSource('site-interstitial');
  assert.equal(read(href).state, 'unavailable', 'A different source cannot inherit the verified identity');
  root.prepend(titleBar);
  assert.equal(read(href).media, media);
  titleBar.remove();
  assert.equal(read(href).media, media);
  read.invalidate(media);
  assert.equal(read(href).state, 'unavailable', 'A trusted reload must reverify identity even if currentSrc is reused');
});

test('iYF does not dispatch against site auto-next, partial groups or conflicting episode links', t => {
  const {doc} = fixture(t);
  const own = identifyIyfPlayer(doc, href);
  assert.deepEqual(nextIyfEpisode(own), {reason: 'next-site-handling'});
  doc.querySelector('.n-media-list').insertAdjacentHTML('beforeend', link('episode201', 201));
  assert.deepEqual(nextIyfEpisode(own), {reason: 'next-site-handling'});
  doc.querySelector('.n-media-list').insertAdjacentHTML('beforeend', link('other201', 201));
  assert.deepEqual(nextIyfEpisode(own), {reason: 'next-not-confirmed'});
  for (const a of own.list.querySelectorAll('a[title="201"]')) a.parentElement.remove();
  assert.deepEqual(nextIyfEpisode(own), {reason: 'next-list-gap'});
  own.list.querySelector('.medias-selector-expandable-tabs-nav:not(.medias-selector-expandable-tabs-nav-hidden) button')
    .textContent = '150-200';
  assert.deepEqual(nextIyfEpisode(own), {reason: 'next-list-incomplete'});
});
