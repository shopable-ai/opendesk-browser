import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {click, nativeText, read} from '../../../tests/native/dynamic-app-r14-helper.mjs';

const q = id => '#vas-' + id;
export async function runNativeR9({c, page, media, appRead, openApp, closePanel, openPanel, contexts, report,
  check, wait, side, frame, output, baseline, nextUrl, verifyInstalled, key}) {
  await mkdir(output, {recursive: true});
  const tap = id => click(c, frame(), q(id), side());
  const type = (id, value) => nativeText(c, frame(), q(id), value, side());
  const evaluate = fn => appRead('(' + fn.toString() + ')()');
  const state = () => evaluate(() => {
    const el = id => document.querySelector('#vas-' + id);
    const r = n => n.getBoundingClientRect();
    const shown = n => n && r(n).width > 0 && r(n).height > 0;
    const main = document.querySelector('.vas');
    const ids = ['intro-start','intro-end','outro-start','outro-end','rule-intro','rule-outro','rule-next','window-range','save','cancel'];
    return {width: innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, main.scrollWidth),
      clipped: ids.filter(id => shown(el(id)) && (r(el(id)).left < 0 || r(el(id)).right > innerWidth)),
      start: el('outro-start').value, end: el('outro-end').value || el('outro-end').placeholder,
      context: el('context').textContent, match: el('tail-match').textContent, save: el('save').textContent,
      saveDisabled: el('save').disabled, discard: shown(el('cancel')), action: el('action').textContent,
      feedback: el('feedback').textContent, viewport: el('window-range').value,
      saveButtons: [...main.querySelectorAll('button')].filter(n => shown(n) && ['保存设置','已保存','正在保存…'].includes(n.textContent)).length};
  });
  const observe = test => wait(async () => {
    const seen = report.lastSidebarState = await state();
    return test(seen) && seen;
  });
  const panelSize = () => read(c, side(), '({width:innerWidth,height:innerHeight,scale:devicePixelRatio})');
  const resize = async width => {
    report.lastRequestedWidth = width;
    await c.send('Emulation.setDeviceMetricsOverride', {width, height: 850, deviceScaleFactor: 1, mobile: false}, side());
    await observe(s => s.width === width);
  };
  const screenshot = async (name, width) => {
    const {data} = await c.send('Page.captureScreenshot', {format: 'png', fromSurface: true}, side());
    const bytes = Buffer.from(data, 'base64');
    const panel = await panelSize();
    const seen = await state();
    assert.equal(seen.width, width);
    assert.ok(bytes.readUInt32BE(16) >= width);
    await writeFile(path.join(output, name + '.png'), bytes);
    (report.screenshots ??= {})[name] = {panel, frameWidth: seen.width, scrollWidth: seen.scrollWidth,
      width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    return seen;
  };
  const tail = (s, start) => s.start === start && s.end === (start === '43:30' ? '45:00' : '48:00');
  await check('r9-360-initial', async () => {
    assert.equal((await contexts()).length, 1);
    report.originalPanel = await panelSize();
    await resize(360);
    return screenshot('360-initial', 360);
  });
  if (baseline) return;
  await check('r9-320-initial', async () => {
    await resize(320);
    const seen = await screenshot('320-initial', 320);
    assert.equal(seen.scrollWidth, 320);
    assert.deepEqual(seen.clipped, []);
    await resize(360);
    return seen;
  });
  await check('r9-drag-and-edit', async () => {
    const before = await state();
    assert.equal(before.save, '保存设置');
    assert.ok(before.saveDisabled && !before.discard && !before.start && before.end === 'End');
    const p = await evaluate(() => {
      const el = document.querySelector('#vas-outro-start-slider .vas-knob');
      const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!document.elementFromPoint(x,y)?.closest('#vas-outro-start-slider')) throw new Error('Start handle is obscured');
      const track = el.closest('svg');
      const sample = event => (track.r9PointerTrace ??= []).push({type: event.type, trusted: event.isTrusted,
        id: event.pointerId, buttons: event.buttons, x: event.clientX, target: event.target.closest('[role=slider]')?.id});
      for (const name of ['pointerdown','pointermove','pointerup','gotpointercapture','lostpointercapture']) track.addEventListener(name, sample, {capture: true});
      return {x,y};
    });
    const offset = await read(c, side(), 'document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect().toJSON()');
    const x = p.x + offset.x, y = p.y + offset.y;
    assert.equal(await read(c, side(), 'document.elementFromPoint(' + x + ',' + y + ')===document.querySelector("#sidebar-tool-frame iframe")'), true);
    const mouse = (type, x, down) => c.send('Input.dispatchMouseEvent', {type, x, y,
      button: type === 'mouseMoved' && !down ? 'none' : 'left', buttons: down ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1}, side());
    await mouse('mouseMoved', x, false);
    await mouse('mousePressed', x, true);
    await mouse('mouseMoved', x - 12, true);
    await mouse('mouseMoved', x - 30, true);
    await mouse('mouseReleased', x - 30, false);
    report.dragPointerTrace = await evaluate(() => document.querySelector('#vas-outro-start-slider').closest('svg').r9PointerTrace ?? []);
    const dragged = await observe(s => s.start && s.start !== '43:30' && s.discard && !s.saveDisabled);
    await type('outro-start', '43:30');
    await type('outro-end', 'End');
    await key(side(), 'Enter', 13);
    await observe(s => tail(s, '43:30') && s.discard && !s.saveDisabled && s.match.includes('待保存') && s.match.includes('01:30'));
    return {dragged: dragged.start, pending: await screenshot('360-pending', 360)};
  });
  await check('r9-save-receipt', async () => {
    await tap('save');
    await observe(s => s.save === '已保存' && s.saveDisabled && !s.discard && s.feedback.includes('已保存'));
    return screenshot('360-saved', 360);
  });
  await check('r9-reopen-and-inherit', async () => {
    const closed = (await contexts())[0].documentId;
    await closePanel();
    await openPanel();
    assert.notEqual((await contexts())[0].documentId, closed);
    await openApp();
    const reopened = await observe(s => tail(s, '43:30') && s.match.includes('01:30') && s.match.includes('已保存') && !s.discard);
    await c.send('Page.navigate', {url: nextUrl}, page.session);
    await wait(async () => {const v = await media(); return v?.episode === 2 && v.duration === 2880 && v.ready >= 2;});
    const inherited = await observe(s => tail(s, '46:30') && s.match.includes('01:30') && !s.discard);
    return {reopened, inherited, installed: await verifyInstalled()};
  });
  await check('r9-320-operable-and-discard', async () => {
    await resize(320);
    const seen = await screenshot('320-inherited', 320);
    assert.equal(seen.scrollWidth, 320);
    assert.equal(seen.clipped.length, 0, seen.clipped.join(', '));
    assert.equal(seen.saveButtons, 1);
    const switchBefore = await evaluate(() => document.querySelector('#vas-rule-outro').checked);
    await tap('rule-outro');
    assert.notEqual(await evaluate(() => document.querySelector('#vas-rule-outro').checked), switchBefore);
    await tap('rule-outro');
    await type('outro-start', '46:00');
    await observe(s => s.start === '46:00' && s.discard && !s.saveDisabled);
    const pending = await screenshot('320-pending', 320);
    await tap('cancel');
    const discarded = await observe(s => tail(s, '46:30') && s.saveDisabled && !s.discard && s.feedback.includes('已放弃'));
    return {pending, discarded, shot: await screenshot('320-discarded', 320)};
  });
  await check('r9-player-applies-tail', async () => {
    await nativeText(c, page.session, '#fixture-time', '2789.25');
    await click(c, page.session, '#fixture-seek-submit');
    const staged = await wait(async () => {const m = await media(); return m?.paused && !m.seeking && Math.abs(m.time - 2789.25) < .15 && m;});
    await click(c, page.session, '#fixture-play');
    const playback = await wait(async () => {
      const m = await media();
      const jump = m?.events.slice(staged.events.length).find(e => e.type === 'seeked' && e.from >= 2789.6 && e.from < 2793 && e.time >= 2879.75);
      return jump && {jump, duration: m.duration};
    });
    const action = await observe(s => s.action.includes('跳过片尾'));
    return {playback, action: action.action};
  });
}
