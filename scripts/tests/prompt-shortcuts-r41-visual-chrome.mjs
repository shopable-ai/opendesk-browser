#!/usr/bin/env node
// Node >=22 (built-in fetch/WebSocket), no npm dependencies.
// node scripts/tests/prompt-shortcuts-r41-visual-chrome.mjs [output-directory]
// CHROME_BIN=/path/to/chrome spawns an isolated headless browser.
// CDP_PORT=9222 uses disposable contexts/tabs in an existing browser; never closes it.
// Original offline preview only. CDP file injection/touch emulation are NOT native acceptance.
import {spawn, execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = 'examples/sidebar-tools/prompt-shortcuts/preview/index.html';
const html = join(root, htmlPath);
const out = resolve(process.argv[2] || join(root, 'artifacts/prompt-shortcuts-r41-visual'));
const viewport = {width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false};
const widths = [320, 360, 400, 440];
const themes = ['light', 'dark'];
const states = ['empty-local', 'selected-long-filename', 'url', 'error'];
const delay = ms => new Promise(done => setTimeout(done, ms));
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const git = promisify(execFile);
const report = {
  schema: 1, kind: 'R41_REAL_CHROME_ORIGINAL_OFFLINE_PREVIEW',
  startedAt: new Date().toISOString(), html: htmlPath, viewport,
  matrix: {widths, themes, states, expectedScenes: 32},
  thresholds: {visibleText: 4.5, placeholder: 4.5, inputBorder: 3, selectedInset: 3, focus: 3},
  installedExtension: false, nativeFilePicker: 'NOT_TESTED',
  fileSelection: 'AUTOMATED: canvas PNG on disk -> DOM.setFileInputFiles -> original change handler',
  limitations: [
    'Offline preview, not installed-extension, real-site, OS picker, IME or native acceptance.',
    'Touch and reduced motion use CDP emulation; no physical touch device is tested.',
    'Contrast uses computed sRGB colors with alpha/background/opacity compositing, not raster antialiasing.',
    'Unsupported image backgrounds/blending in measured ancestry fail as unmeasurable; thresholds stay fixed.',
    'URL scene leaves the URL empty to measure its real placeholder; no remote image service is mocked.',
    'HTML disk hashes bracket navigation/capture; parallel HTML changes invalidate that scene.',
  ], scenes: [], errors: [],
};
let browser, child, childExit, childError, profile, interrupted;
const contexts = new Set();
const targets = new Set();
const stop = signal => {
  interrupted = signal;
  browser?.rejectPending(new Error(`Interrupted: ${signal}`));
};
const onInt = () => stop('SIGINT');
const onTerm = () => stop('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners) listener(message);
      }
    });
    socket.addEventListener('close', () => this.rejectPending(new Error('CDP socket closed')));
    socket.addEventListener('error', () => this.rejectPending(new Error('CDP socket error')));
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('CDP open timeout')); }, 15000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, {once: true});
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Cannot open CDP')); }, {once: true});
    });
    return new CDP(socket);
  }
  call(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolveCall, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 18000);
      this.pending.set(id, {resolve: resolveCall, reject, timer, method});
      try { this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  rejectPending(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  close() { this.rejectPending(new Error('CDP cleanup')); this.socket.close(); }
}

async function sourceIdentity() {
  const bytes = await readFile(html);
  const readGit = async args => {
    try { return (await git('git', args, {cwd: root})).stdout.trim(); }
    catch { return null; }
  };
  const gitHEAD = await readGit(['rev-parse', 'HEAD']);
  return {
    gitHEAD,
    headHTMLBlob: gitHEAD ? await readGit(['rev-parse', `${gitHEAD}:${htmlPath}`]) : null,
    htmlBlob: hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1'),
    htmlSHA256: hash(bytes), bytes: bytes.length,
  };
}

async function connectBrowser() {
  if (typeof WebSocket !== 'function') throw new Error('Use Node >=22 with built-in WebSocket.');
  let port;
  if (process.env.CDP_PORT) {
    port = Number(process.env.CDP_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CDP_PORT');
    if (port === 55358) throw new Error('CDP55358 is reserved for the parallel owner. Unset CDP_PORT to spawn headless Chrome.');
    report.connection = {mode: 'EXISTING_BROWSER_OWNED_CONTEXTS_ONLY', port, browserClosed: false};
  } else {
    profile = await mkdtemp(join(tmpdir(), 'prompt-shortcuts-r41-'));
    const binary = process.env.CHROME_BIN || 'chromium';
    report.connection = {mode: 'SPAWN_ISOLATED_HEADLESS', binary, profile};
    child = spawn(binary, [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      '--remote-debugging-port=0', 'about:blank',
    ], {stdio: 'ignore'});
    childExit = new Promise(done => {
      child.once('error', error => { childError = error; done(); });
      child.once('exit', (code, signal) => { report.chromeExit = {code, signal}; done(); });
    });
    for (let i = 0; i < 150; i++) {
      if (interrupted) throw new Error(interrupted);
      if (childError) throw childError;
      if (child.exitCode !== null || child.signalCode) throw new Error('Spawned Chrome exited before CDP');
      try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (port) break;
      await delay(100);
    }
    if (!port) throw new Error('No DevToolsActivePort from spawned Chrome');
    report.connection.port = port;
  }
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`CDP discovery HTTP ${response.status}`);
  const discovery = await response.json();
  if (!discovery.webSocketDebuggerUrl) throw new Error('Browser CDP WebSocket URL missing');
  browser = await CDP.connect(discovery.webSocketDebuggerUrl);
  report.chrome = await browser.call('Browser.getVersion');
}

function check(scene, name, pass, evidence) {
  scene.checks.push({name, pass: Boolean(pass), ...(evidence === undefined ? {} : {evidence})});
}

function pageDriver(sessionId, scene) {
  const call = (method, params) => browser.call(method, params, sessionId);
  const evaluate = async (fn, ...args) => {
    if (interrupted) throw new Error(interrupted);
    const expression = `(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`;
    const result = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const poll = async (fn, label) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(fn)) return;
      await delay(70);
    }
    throw new Error(`Not ready: ${label}`);
  };
  const settle = () => evaluate(async () => {
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const keyboard = async key => {
    const definitions = {
      Tab: {key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9},
      Enter: {key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'},
      Space: {key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' '},
      Escape: {key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27},
    };
    const definition = definitions[key];
    if (!definition) throw new Error(`Unsupported keyboard key: ${key}`);
    await call('Input.dispatchKeyEvent', {type: definition.text ? 'keyDown' : 'rawKeyDown', ...definition});
    const {text: unused, ...release} = definition;
    await call('Input.dispatchKeyEvent', {type: 'keyUp', ...release});
    scene.keyboard.push({key, focused: await evaluate(() => document.activeElement?.id || document.activeElement?.tagName)});
  };
  const tabTo = async selector => {
    // No DOM .focus(), synthetic KeyboardEvent or private app state shortcuts.
    for (let i = 0; i < 90; i++) {
      if (await evaluate(s => document.activeElement?.matches(s), selector)) return;
      await keyboard('Tab');
    }
    throw new Error(`Cannot reach by regular Tab: ${selector}`);
  };
  const point = selector => evaluate(s => {
    const element = document.querySelector(s);
    if (!element || element.disabled) throw new Error(`Missing enabled control: ${s}`);
    element.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) throw new Error(`Not rendered: ${s}`);
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
  }, selector);
  const click = async selector => {
    const position = await point(selector);
    await call('Input.dispatchMouseEvent', {type: 'mouseMoved', ...position});
    await call('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', clickCount: 1, ...position});
    await call('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', clickCount: 1, ...position});
  };
  return {call, evaluate, poll, settle, keyboard, tabTo, click, point};
}

async function fixtures(page) {
  if (report.fixtures) return report.fixtures;
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    const gradient = context.createLinearGradient(0, 0, 160, 96);
    gradient.addColorStop(0, '#365eda'); gradient.addColorStop(1, '#11b98a');
    context.fillStyle = gradient; context.fillRect(0, 0, 160, 96);
    context.fillStyle = '#ffe391'; context.fillRect(12, 12, 40, 40);
    context.fillStyle = '#ffffff'; context.font = 'bold 18px sans-serif'; context.fillText('R41 PNG', 57, 65);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const directory = join(out, 'fixtures');
  await mkdir(directory, {recursive: true});
  const name = '用于验证窄侧栏文件名省略且保留完整中文提示的超长图片名称'.repeat(2) + '.png';
  const png = Buffer.from(data, 'base64');
  const bad = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('R41 deliberately broken PNG')]);
  const goodPath = join(directory, name), badPath = join(directory, 'broken-image.png');
  await writeFile(goodPath, png);
  await writeFile(badPath, bad);
  report.fixtures = {
    name, goodPath, badPath, generator: 'Actual browser canvas.toDataURL(image/png)',
    good: {width: 160, height: 96, bytes: png.length, sha256: hash(png)},
    bad: {kind: 'PNG signature with undecodable body', bytes: bad.length, sha256: hash(bad)},
  };
  return report.fixtures;
}

async function chooseFile(page, scene, path, launcher) {
  const previous = scene.choosers.length;
  await page.tabTo(launcher);
  await page.keyboard('Enter');
  for (let i = 0; i < 60 && scene.choosers.length === previous; i++) await delay(50);
  if (scene.choosers.length === previous) throw new Error('Keyboard activation did not open the original file input');
  const {root: documentRoot} = await page.call('DOM.getDocument');
  const {nodeId} = await page.call('DOM.querySelector', {nodeId: documentRoot.nodeId, selector: '#imageFile'});
  if (!nodeId) throw new Error('Original #imageFile missing');
  await page.call('DOM.setFileInputFiles', {nodeId, files: [path]});
  await page.poll(() => document.querySelector('#imageFields').getAttribute('aria-busy') === 'false', 'original image handler finished');
}

// Evaluated in the original page. No stylesheet, token or application-state substitutions.
function measure(mode) {
  const panel = document.querySelector('#sidepanel');
  const rectOf = element => {
    const r = element.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom};
  };
  const idOf = element => element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${element.classList.length ? '.' + [...element.classList].join('.') : ''}`;
  const visible = element => {
    if (!element || element.closest('[hidden],.sr-only')) return false;
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) return false;
      if (node !== element) {
        const bounds = node.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
    }
    return right > left && bottom > top;
  };
  const geometry = {};
  for (const selector of ['#sidepanel', '#panelBody', '#formView', '#promptBody', '#imageFields',
    '.appearance-switch', '.ps-image-source', '#imageDropzone', '#imagePick', '#imageUrlRow', '#imageUrl',
    '#imageSelected', '#pictureExample', '#imageFileName', '#imageFileMeta', '#imageSelectedActions',
    '#imageReplace', '#imageClear', '#imageFieldError', '#imageHelp', '#shortLabel', '#fullName']) {
    const element = document.querySelector(selector);
    if (!element) { geometry[selector] = {missing: true}; continue; }
    const style = getComputedStyle(element);
    geometry[selector] = {
      visible: visible(element), rect: rectOf(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      overflowX: style.overflowX, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace,
      text: element.matches('input,textarea') ? element.value : element.textContent.trim(), title: element.title,
      border: {color: style.borderTopColor, width: style.borderTopWidth, style: style.borderTopStyle},
      outline: {color: style.outlineColor, width: style.outlineWidth, style: style.outlineStyle},
      boxShadow: style.boxShadow, transitionDuration: style.transitionDuration,
    };
  }
  const image = document.querySelector('#pictureExample img');
  const basic = {
    geometry, viewport: {width: innerWidth, height: innerHeight, devicePixelRatio, scrollX, scrollY},
    panelWidth: panel.getBoundingClientRect().width, theme: document.documentElement.dataset.theme || 'light',
    media: {reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarse: matchMedia('(pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints},
    focused: document.activeElement?.id, focusVisible: document.activeElement?.matches(':focus-visible'),
    picture: image ? {complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      rect: rectOf(image), objectFit: getComputedStyle(image).objectFit} : null,
  };
  if (mode === 'geometry') return basic;

  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Cannot resolve computed colors');
  const rgba = css => {
    context.clearRect(0, 0, 1, 1); context.fillStyle = css; context.fillRect(0, 0, 1, 1);
    const pixel = [...context.getImageData(0, 0, 1, 1).data]; pixel[3] /= 255; return pixel;
  };
  const over = (fg, bg) => {
    const a = fg[3] + bg[3] * (1 - fg[3]);
    return a ? [0, 1, 2].map(i => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a).concat(a) : [0, 0, 0, 0];
  };
  const unsupported = element => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' || style.mixBlendMode !== 'normal' || style.filter !== 'none' ||
        (style.backdropFilter && style.backdropFilter !== 'none')) return `Unsupported background/filter/blend on ${idOf(node)}`;
    }
    return null;
  };
  const pixel = (element, ink = [0, 0, 0, 0]) => {
    let value = ink.slice();
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      value = over(value, rgba(style.backgroundColor));
      value[3] *= Number(style.opacity);
    }
    return over(value, [255, 255, 255, 1]);
  };
  const luminance = color => color.slice(0, 3).map(c => {
    const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const samples = [];
  const sample = (element, kind, css, minimum, options = {}) => {
    const problem = unsupported(element) || options.problem;
    if (problem) { samples.push({element: idOf(element), kind, minimum, pass: false, unmeasurable: problem}); return; }
    const foreground = rgba(css); foreground[3] *= options.opacity ?? 1;
    const effective = pixel(element, foreground);
    const inside = pixel(element);
    const adjacent = options.adjacent ? pixel(options.adjacent) : inside;
    const contrasts = {inside: ratio(effective, inside), adjacent: ratio(effective, adjacent)};
    const actual = options.both ? Math.min(contrasts.inside, contrasts.adjacent) : ratio(effective, adjacent);
    samples.push({element: idOf(element), kind, text: options.text, cssColor: css, foreground: effective,
      background: inside, adjacent, ratios: contrasts, ratio: actual, minimum, pass: actual >= minimum});
  };
  if (mode === 'focus') {
    const active = document.activeElement;
    const owner = active.matches('input[type="radio"],input[type="checkbox"]') ? active.closest('label') : active;
    if (!owner || !panel.contains(owner)) return {...basic, samples: [{kind: 'focus', pass: false, unmeasurable: 'Focus outside panel'}]};
    const style = getComputedStyle(owner);
    const shown = active.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    // Outlines paint outside the owner on the parent's background. Do not include the owner's fill.
    sample(owner.parentElement, 'focus', style.outlineColor, 3, {
      problem: shown ? null : `No visible keyboard outline on ${idOf(owner)}`,
    });
    samples.at(-1).element = idOf(owner);
    samples.at(-1).activeElement = idOf(active);
    samples.at(-1).outlineWidth = style.outlineWidth;
    samples.at(-1).outlineOffset = style.outlineOffset;
    samples.at(-1).rect = rectOf(owner);
    return {...basic, samples};
  }

  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement, text = node.textContent.trim();
    if (!text || !visible(element) || element.closest('script,style,svg')) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    if (![...range.getClientRects()].some(r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)) continue;
    sample(element, 'visibleText', getComputedStyle(element).color, 4.5, {text});
  }
  for (const element of panel.querySelectorAll('input[placeholder],textarea[placeholder]')) {
    if (!visible(element) || element.value) continue;
    const style = getComputedStyle(element, '::placeholder');
    sample(element, 'placeholder', style.color, 4.5, {text: element.placeholder, opacity: Number(style.opacity)});
  }
  for (const element of panel.querySelectorAll('.od-field,.ps-image-dropzone')) {
    if (!visible(element)) continue;
    const style = getComputedStyle(element);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      sample(element, `inputBorder${side}`, style[`border${side}Color`], 3, {
        adjacent: element.parentElement, both: true,
        problem: style[`border${side}Style`] === 'none' || parseFloat(style[`border${side}Width`]) === 0 ? 'Missing input border' : null,
      });
    }
  }
  for (const input of panel.querySelectorAll('.appearance-switch input:checked,.ps-image-source input:checked')) {
    const label = input.closest('label');
    if (!visible(label)) continue;
    const shadow = getComputedStyle(label).boxShadow.split(/,(?![^()]*\))/).find(part => /\binset\b/.test(part));
    const color = shadow?.match(/rgba?\([^)]*\)|color\([^)]*\)|#[\da-f]+/i)?.[0];
    sample(label, 'selectedInset', color || 'transparent', 3, {
      adjacent: label.parentElement, both: true, problem: color ? null : 'Missing computed selected inset shadow',
    });
    samples.at(-1).boxShadow = getComputedStyle(label).boxShadow;
  }
  return {...basic, samples};
}

async function screenshot(page, name, region) {
  const metrics = await page.call('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const clip = region ? await page.evaluate(() => {
    const r = document.querySelector('#imageFields').getBoundingClientRect();
    return {x: Math.max(0, Math.floor(r.left + scrollX - 6)), y: Math.max(0, Math.floor(r.top + scrollY - 6)),
      width: Math.ceil(r.width + 12), height: Math.ceil(r.height + 12), scale: 1};
  }) : {x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1};
  clip.width = Math.min(clip.width, Math.ceil(size.width) - clip.x);
  clip.height = Math.min(clip.height, Math.ceil(size.height) - clip.y);
  if (clip.width <= 0 || clip.height <= 0) throw new Error(`Empty screenshot clip: ${name}`);
  const result = await page.call('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true, clip,
  });
  const bytes = Buffer.from(result.data, 'base64');
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Chrome did not return a PNG');
  await writeFile(join(out, name), bytes);
  return {file: name, clip, bytes: bytes.length, sha256: hash(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}


async function captureRealRailGeometry(page, scene) {
  // Read real Chrome geometry and hit-testing from the original offline HTML.
  // Product policy: one fixed OD brand precedes saved prompts, no transcript arrows.
  const read = () => page.evaluate(() => {
    const rail = document.querySelector('#pageRail');
    const buttons = [...rail.querySelectorAll(':scope > button')];
    const rect = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
    };
    const text = rail.querySelector(':scope > .page-shortcut:not(.has-image)');
    const image = rail.querySelector(':scope > .page-shortcut.has-image');
    const tip = document.querySelector('#webTooltip');
    const style = getComputedStyle(rail);
    const buttonStyle = text ? getComputedStyle(text) : null;
    return {
      rail: rect(rail), text: rect(text), image: rect(image),
      tip: tip.hidden ? null : rect(tip), area: rect(document.querySelector('#messageArea')),
      buttons: buttons.length,
      brandButtons: buttons.filter(button => button.classList.contains('page-brand')).length,
      brandFirst: buttons[0]?.classList.contains('page-brand') &&
        buttons[0].getAttribute('aria-label')==='打开提示词快捷按钮管理侧栏',
      promptButtons: buttons.filter(button => button.getAttribute('aria-label')?.startsWith('插入提示词：')).length,
      managementButtons: buttons.filter(button => button.textContent.trim()==='管理'||
        button.getAttribute('aria-label')?.includes('管理提示词')).length,
      navigationButtons: buttons.filter(button => button.classList.contains('nav-preview')||
        button.hasAttribute('data-scroll-conversation')).length,
      strayControls: buttons.filter(button =>
        !(button.classList.contains('page-shortcut')&&button.getAttribute('aria-label')?.startsWith('插入提示词：'))&&
        !(button.classList.contains('page-brand')&&button.getAttribute('aria-label')==='打开提示词快捷按钮管理侧栏')).length,
      imageSize: rail.dataset.imageSize,
      background: style.backgroundColor, border: style.borderTopWidth, borderColor: style.borderTopColor,
      radius: style.borderTopLeftRadius, gap: style.rowGap, padding: style.paddingLeft, shadow: style.boxShadow,
      buttonBackground: buttonStyle?.backgroundColor, visible: !rail.hidden,
      scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight,
    };
  });
  const close = (actual,expected) => actual!=null&&Math.abs(actual-expected)<=1;
  const initial=await read();
  scene.railGeometry={initial};
  check(scene,'real DOM: OD first, three real prompts, no folding or transcript navigation',
    initial.visible&&initial.buttons===4&&initial.brandButtons===1&&initial.brandFirst&&
    initial.promptButtons===3&&initial.managementButtons===0&&
    initial.navigationButtons===0&&initial.strayControls===0,initial);
  check(scene,'real DOM: 38px prompt controls, 52px rail and bounded spacing',
    close(initial.text?.width,38)&&close(initial.text?.height,38)&&
    close(initial.rail?.width,52)&&initial.padding==='6px'&&initial.gap==='5px'&&
    initial.border==='1px'&&initial.radius==='17px'&&
    initial.scrollHeight<=initial.clientHeight+1,initial);
  const expectedTheme=scene.theme==='light'
    ? {rail:'rgb(255, 255, 255)',border:'rgb(233, 233, 235)',button:'rgb(244, 245, 247)'}
    : {rail:'rgb(48, 50, 57)',border:'rgb(56, 56, 56)',button:'rgb(68, 72, 81)'};
  check(scene,'real DOM: approved light/dark prompt-only rail palette',
    initial.background===expectedTheme.rail&&initial.borderColor===expectedTheme.border&&
    initial.buttonBackground===expectedTheme.button&&initial.shadow!=='none',initial);

  const textSizeWidths={};
  for(const size of ['compact','standard','large']){
    await page.evaluate(value=>{document.querySelector('#pageRail').dataset.imageSize=value;},size);
    const snapshot=await read();textSizeWidths[size]=snapshot.rail?.width;
    check(scene,'real DOM: text-only rail ignores '+size+' picture setting',
      close(snapshot.rail?.width,52)&&close(snapshot.text?.width,38),snapshot);
  }
  scene.railGeometry.textSizeWidths=textSizeWidths;
  await page.evaluate(()=>{document.querySelector('#pageRail').dataset.imageSize='large';});

  // Physical pointer events test the real original tooltip position.
  const hover=await page.point('#pageRail .page-shortcut:nth-child(2)');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...hover});
  await page.settle();
  const tooltip=await read();scene.railGeometry.tooltip=tooltip.tip;
  const tipGap=tooltip.tip&&tooltip.rail?tooltip.tip.x-tooltip.rail.right:null;
  check(scene,'real DOM: tooltip follows rail and stays inside conversation stage',
    tooltip.tip&&tipGap>=8&&tipGap<=12&&
    tooltip.tip.x>=tooltip.area.x&&tooltip.tip.right<=tooltip.area.right+1,{tipGap,...tooltip});

  // Real CDP mouse click must insert the complete stored prompt, preserving
  // the existing draft. Checking a button count alone cannot prove this.
  const seed=JSON.parse(await readFile(join(root,'examples/sidebar-tools/prompt-shortcuts/tool.config.json'),'utf8'))
    .initialData.library.items[0];
  await page.evaluate(()=>{
    window.__r41SubmitCount=0;
    document.addEventListener('submit',()=>{window.__r41SubmitCount++;},true);
    const draft=document.querySelector('#mockDraft');draft.value='原草稿';
    draft.setSelectionRange(draft.value.length,draft.value.length);
  });
  await page.click('#pageRail .page-shortcut');
  await page.poll(()=>document.querySelector('#mockDraft')?.value.includes('浏览器插件定制开发需求'),
    'actual preview prompt inserted after real pointer click');
  const afterInsert=await page.evaluate(()=>({
    draft:document.querySelector('#mockDraft').value,
    feedback:document.querySelector('#panelStatus').textContent,
    buttons:document.querySelectorAll('#pageRail .page-shortcut').length,
    submissions:window.__r41SubmitCount,
  }));
  check(scene,'real click: entire seed prompt appended, no automatic send or extra rail controls',
    afterInsert.draft==='原草稿\n'+seed.body&&afterInsert.buttons===3&&afterInsert.submissions===0&&
    /已插入/.test(afterInsert.feedback),
    {actualLength:afterInsert.draft.length,expectedLength:seed.body.length+4,buttons:afterInsert.buttons,feedback:afterInsert.feedback});
  await page.click('#previewReopen');
  const reopened=await read();scene.railGeometry.reopened=reopened;
  check(scene,'real DOM: reopening retains one first OD and all three prompt actions',
    reopened.visible&&reopened.buttons===4&&reopened.brandFirst&&
    reopened.brandButtons===1&&reopened.strayControls===0,reopened);

  if(scene.state!=='empty-local')return;
  const switchScenario=value=>page.evaluate(v=>{
    const select=document.querySelector('#previewDataScenario');
    select.value=v;select.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await switchScenario('legacy');
  await page.poll(()=>{
    const picture=document.querySelector('#pageRail .has-image img');
    return picture?.complete&&picture.naturalWidth>0;
  },'decoded legacy image in original preview');
  const imageSizeWidths={};
  for(const [size,imageWidth,imageHeight,railWidth] of [
    ['compact',48,40,62],['standard',56,44,70],['large',68,48,82],
  ]){
    await page.click('#imageSizeGroup [data-image-size="'+size+'"]');
    await page.settle();
    const snapshot=await read();imageSizeWidths[size]=snapshot;
    check(scene,'real DOM: '+size+' image sizes actual button and rail',
      snapshot.image&&close(snapshot.image.width,imageWidth)&&
      close(snapshot.image.height,imageHeight)&&close(snapshot.rail?.width,railWidth)&&
      snapshot.strayControls===0,snapshot);
  }
  scene.railGeometry.imageSizeWidths=imageSizeWidths;
  await switchScenario('empty');
  const empty=await read();
  check(scene,'real DOM: user-cleared library has no phantom OD or scroll buttons',
    empty.buttons===0&&empty.promptButtons===0&&!empty.visible&&empty.strayControls===0,empty);
  await switchScenario('fresh');
  const restored=await read();
  check(scene,'real DOM: fresh scenario restores exactly three real prompts',
    restored.visible&&restored.buttons===3&&restored.promptButtons===3&&
    restored.managementButtons===0&&restored.navigationButtons===0&&
    restored.strayControls===0&&close(restored.rail?.width,52),restored);
  scene.railGeometry.reset=restored;
  scene.screenshots??={};
  scene.screenshots.rail=await screenshot(page,scene.id+'-rail-full.png',false);
}
async function captureScene(page, scene) {
  await page.evaluate(() => document.querySelector('#imageFields').scrollIntoView({block: 'nearest'}));
  await page.settle();
  scene.measurements = await page.evaluate(measure, 'contrast');
  const {geometry: g, panelWidth, theme} = scene.measurements;
  check(scene, 'requested panel width and theme', Math.abs(panelWidth - scene.width) < .5 && theme === scene.theme, {panelWidth, theme});
  check(scene, 'no horizontal panel overflow', g['#sidepanel'].scrollWidth <= g['#sidepanel'].clientWidth + 1);
  for (const selector of ['#imageFields', '#imageDropzone', '#imageSelected', '#imageUrl', '#imageFieldError', '#imageSelectedActions']) {
    const item = g[selector], panel = g['#sidepanel'].rect;
    if (item?.visible) check(scene, `${selector} inside panel horizontally`, item.rect.x >= panel.x && item.rect.right <= panel.right, item.rect);
  }
  const region = g['#imageFields'].rect;
  check(scene, 'whole image region visible for crop', region.y >= 0 && region.bottom <= viewport.height &&
    region.y >= g['#panelBody'].rect.y && region.bottom <= g['#panelBody'].rect.bottom, region);
  if (scene.state === 'selected-long-filename' || scene.state === 'error') {
    const filename = g['#imageFileName'], actions = g['#imageSelectedActions'];
    check(scene, 'long Chinese filename ellipsis without action overlap', filename.visible && filename.text === report.fixtures.name &&
      filename.title === filename.text && filename.textOverflow === 'ellipsis' && filename.whiteSpace === 'nowrap' &&
      filename.scrollWidth > filename.clientWidth && filename.rect.right <= actions.rect.x, {filename, actions});
  }
  const counts = kind => scene.measurements.samples.filter(sample => sample.kind === kind).length;
  check(scene, 'text, placeholders and both selected indicators measured', counts('visibleText') > 0 &&
    counts('placeholder') >= (scene.state === 'url' ? 4 : 3) && counts('selectedInset') === 2);
  for (const sample of scene.measurements.samples) if (!sample.pass) check(scene, `contrast ${sample.kind} ${sample.element}`, false, sample);
  scene.screenshots ??= {};
  scene.screenshots.full = await screenshot(page, `${scene.id}-full.png`, false);
  scene.screenshots.region = await screenshot(page, `${scene.id}-region.png`, true);
}

async function touchAndMotion(page, scene) {
  await page.call('Emulation.setEmulatedMedia', {features: [
    {name: 'prefers-color-scheme', value: scene.theme}, {name: 'prefers-reduced-motion', value: 'reduce'},
  ]});
  await page.call('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  await page.call('Emulation.setEmitTouchEventsForMouse', {enabled: true, configuration: 'mobile'});
  await page.settle();
  await page.evaluate(() => {
    window.__r41Touch = null;
    document.addEventListener('pointerdown', event => {
      window.__r41Touch = {type: event.pointerType, trusted: event.isTrusted, target: event.target.id};
    }, {once: true});
  });
  const selector = scene.state === 'url' ? '#imageSourceUrl' : '#imageSourceLocal';
  const point = await page.point(selector);
  await page.call('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...point, id: 1}]});
  await page.call('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.settle();
  scene.touchAndMotion = await page.evaluate(measure, 'geometry');
  scene.touchAndMotion.event = await page.evaluate(() => window.__r41Touch);
  const evidence = scene.touchAndMotion;
  check(scene, 'emulated touch input reaches original source control', evidence.media.coarse && evidence.media.maxTouchPoints === 1 &&
    evidence.event?.trusted && evidence.event.type === 'touch', evidence.event);
  check(scene, 'reduced-motion removes dropzone transition', evidence.media.reducedMotion &&
    evidence.geometry['#imageDropzone'].transitionDuration.split(',').every(value => parseFloat(value) === 0));
  for (const selector of ['#imageReplace', '#imageClear']) {
    const item = evidence.geometry[selector];
    if (item.visible) check(scene, `${selector} touch geometry`, item.rect.width >= 42 && item.rect.height >= 44, item.rect);
  }
}

async function runScene(width, theme, state) {
  const scene = {id: `${width}-${theme}-${state}`, width, theme, state, checks: [], keyboard: [], choosers: [], runtimeErrors: []};
  report.scenes.push(scene);
  let contextId, targetId, page, listener;
  try {
    if (interrupted) throw new Error(interrupted);
    scene.sourceBefore = await sourceIdentity();
    ({browserContextId: contextId} = await browser.call('Target.createBrowserContext', {disposeOnDetach: true}));
    contexts.add(contextId);
    ({targetId} = await browser.call('Target.createTarget', {url: 'about:blank', browserContextId: contextId}));
    targets.add(targetId);
    const {sessionId} = await browser.call('Target.attachToTarget', {targetId, flatten: true});
    page = pageDriver(sessionId, scene);
    listener = event => {
      if (event.sessionId !== sessionId) return;
      if (event.method === 'Page.fileChooserOpened') scene.choosers.push({...event.params, selection: 'CDP_AUTOMATION_NOT_NATIVE'});
      if (event.method === 'Runtime.exceptionThrown') scene.runtimeErrors.push(event.params.exceptionDetails);
      if (event.method === 'Page.javascriptDialogOpening') {
        scene.runtimeErrors.push({dialog: event.params});
        void page.call('Page.handleJavaScriptDialog', {accept: event.params.type === 'beforeunload'}).catch(error => scene.runtimeErrors.push({error: String(error)}));
      }
    };
    browser.listeners.add(listener);
    await page.call('Page.enable'); await page.call('Runtime.enable'); await page.call('DOM.enable');
    await page.call('Page.setInterceptFileChooserDialog', {enabled: true});
    await page.call('Emulation.setDeviceMetricsOverride', viewport);
    await page.call('Emulation.setEmulatedMedia', {features: [
      {name: 'prefers-color-scheme', value: theme}, {name: 'prefers-reduced-motion', value: 'no-preference'},
    ]});
    await page.call('Emulation.setTouchEmulationEnabled', {enabled: false});
    const navigation = await page.call('Page.navigate', {url: pathToFileURL(html).href});
    if (navigation.errorText) throw new Error(navigation.errorText);
    await page.poll(() => document.readyState === 'complete' && Boolean(document.querySelector('#addButton')), 'original preview ready');
    await page.call('Page.bringToFront');
    await page.click(`#size${width}`);
    if (theme === 'dark') await page.click('#themeButton');
    await captureRealRailGeometry(page, scene);
    if (state === 'empty-local') {
      await page.tabTo('#transferButton'); await page.keyboard('Enter');
      check(scene, 'Enter opens original transfer menu', await page.evaluate(() => !document.querySelector('#transferMenu').hidden));
      await page.keyboard('Escape');
      check(scene, 'Escape closes menu and restores launcher focus', await page.evaluate(() =>
        document.querySelector('#transferMenu').hidden && document.activeElement.id === 'transferButton'));
    }
    await page.tabTo('#addButton'); await page.keyboard('Enter');
    await page.poll(() => !document.querySelector('#formView').hidden, 'new form');
    if (state === 'empty-local') {
      await page.keyboard('Tab');
      check(scene, 'Tab reaches native details summary', await page.evaluate(() => document.activeElement.matches('#advancedOptions > summary')));
      await page.keyboard('Space');
      check(scene, 'Space collapses native details', await page.evaluate(() => !document.querySelector('#advancedOptions').open));
      await page.keyboard('Space');
      check(scene, 'Space reopens native details', await page.evaluate(() => document.querySelector('#advancedOptions').open));
    }
    await page.click('#appearanceImage');
    await page.poll(() => !document.querySelector('#imageFields').hidden, 'original image fields');
    await page.tabTo('#imageSourceLocal'); await page.keyboard('Space');
    check(scene, 'Space activates original local-source radio', await page.evaluate(() => document.querySelector('#imageSourceLocal').checked));
    const fixture = await fixtures(page);
    if (state === 'selected-long-filename' || state === 'error') {
      await chooseFile(page, scene, fixture.goodPath, '#imagePick');
      await page.poll(() => {
        const image = document.querySelector('#pictureExample img');
        return !document.querySelector('#imageSelected').hidden && image?.complete && image.naturalWidth > 0;
      }, 'canvas PNG decoded by original handler');
      check(scene, 'successful automated selection restores replace focus', await page.evaluate(() => document.activeElement.id === 'imageReplace'));
      if (state === 'error') {
        const before = await page.evaluate(() => ({src: document.querySelector('#pictureExample img')?.src,
          name: document.querySelector('#imageFileName').textContent, meta: document.querySelector('#imageFileMeta').textContent}));
        await chooseFile(page, scene, fixture.badPath, '#imageReplace');
        await page.poll(() => !document.querySelector('#imageFieldError').hidden && Boolean(document.querySelector('#imageFieldError').textContent.trim()), 'bad PNG rejected');
        const after = await page.evaluate(() => ({src: document.querySelector('#pictureExample img')?.src,
          name: document.querySelector('#imageFileName').textContent, meta: document.querySelector('#imageFileMeta').textContent,
          decoded: document.querySelector('#pictureExample img')?.naturalWidth > 0,
          error: document.querySelector('#imageFieldError').textContent,
          status: document.querySelector('#imageHelp').textContent, focused: document.activeElement.id}));
        scene.retainedImage = {beforeSHA256: hash(before.src || ''), afterSHA256: hash(after.src || ''),
          name: after.name, error: after.error, status: after.status};
        check(scene, 'bad PNG enters decode handler and retains previous image and filename',
          /解码/.test(after.error) && after.decoded && before.src === after.src && before.name === after.name && before.meta === after.meta, scene.retainedImage);
        check(scene, 'failed replacement restores replace focus', after.focused === 'imageReplace');
      }
    } else if (state === 'url') {
      await page.click('#imageSourceUrl');
      await page.tabTo('#imageUrl');
      check(scene, 'URL input and its real placeholder are visible', await page.evaluate(() =>
        !document.querySelector('#imageUrlRow').hidden && document.querySelector('#imageUploadControls').hidden &&
        document.querySelector('#imageUrl').value === ''));
    } else {
      check(scene, 'empty local dropzone visible', await page.evaluate(() =>
        !document.querySelector('#imageUploadControls').hidden && document.querySelector('#imageSelected').hidden));
    }

    scene.focus = [];
    const focusSelectors = [state === 'url' ? '#imageSourceUrl' : '#imageSourceLocal', ...(state === 'url' ? ['#imageUrl'] :
        state === 'empty-local' ? ['#imagePick'] : ['#imageClear', '#imageReplace'])];
    for (const selector of focusSelectors) {
      await page.tabTo(selector);
      const measurement = await page.evaluate(measure, 'focus');
      scene.focus.push({selector, ...measurement});
      for (const sample of measurement.samples) check(scene, `keyboard focus contrast ${selector}`, sample.pass, sample);
    }
    await captureScene(page, scene);
    await touchAndMotion(page, scene);
    check(scene, 'no uncaught page errors or unexpected dialogs', scene.runtimeErrors.length === 0, scene.runtimeErrors);
  } catch (error) {
    scene.error = String(error.stack || error);
    check(scene, 'scene completed', false, scene.error);
    if (page && !interrupted && !scene.screenshots) {
      try { await captureScene(page, scene); }
      catch (captureError) { scene.captureError = String(captureError.stack || captureError); }
    }
  } finally {
    try {
      scene.sourceAfter = await sourceIdentity();
      check(scene, 'HTML unchanged during scene', scene.sourceBefore?.htmlSHA256 === scene.sourceAfter.htmlSHA256,
        {before: scene.sourceBefore, after: scene.sourceAfter});
    } catch (error) { check(scene, 'source identity available', false, String(error)); }
    if (listener) browser.listeners.delete(listener);
    if (targetId) {
      try { await browser.call('Target.closeTarget', {targetId}); targets.delete(targetId); }
      catch (error) { check(scene, 'owned target cleanup', false, String(error)); }
    }
    if (contextId) {
      try { await browser.call('Target.disposeBrowserContext', {browserContextId: contextId}); contexts.delete(contextId); }
      catch (error) { check(scene, 'owned context cleanup', false, String(error)); }
    }
    scene.result = scene.checks.every(item => item.pass) ? 'PASS' : 'FAIL';
    await writeFile(join(out, `${scene.id}.geometry.json`), JSON.stringify({
      scene: {id: scene.id, width, theme, state}, chrome: report.chrome,
      sourceBefore: scene.sourceBefore, sourceAfter: scene.sourceAfter, viewport,
      baseline: scene.measurements && {...scene.measurements, samples: undefined},
       railGeometry: scene.railGeometry,
      touchAndMotion: scene.touchAndMotion, retainedImage: scene.retainedImage,
      checks: scene.checks, error: scene.error, captureError: scene.captureError,
    }, null, 2));
    await writeFile(join(out, `${scene.id}.contrast.json`), JSON.stringify({
      scene: {id: scene.id, width, theme, state}, chrome: report.chrome, viewport,
      panelWidth: scene.measurements?.panelWidth,
      sourceBefore: scene.sourceBefore, sourceAfter: scene.sourceAfter, thresholds: report.thresholds,
      status: scene.measurements ? scene.result : 'NOT_TESTED',
      samples: scene.measurements?.samples, focus: scene.focus?.map(({selector, samples, focused}) => ({selector, samples, focused})),
      error: scene.error,
    }, null, 2));
    console.log(`${scene.result} ${scene.id}: ${scene.checks.filter(item => !item.pass).length} failed checks`);
  }
}

async function cleanup() {
  if (browser) {
    for (const targetId of targets) {
      try { await browser.call('Target.closeTarget', {targetId}); }
      catch (error) { report.errors.push(`Target cleanup: ${error.message}`); }
    }
    for (const browserContextId of contexts) {
      try { await browser.call('Target.disposeBrowserContext', {browserContextId}); }
      catch (error) { report.errors.push(`Context cleanup: ${error.message}`); }
    }
    // In particular, NEVER send Browser.close to CDP_PORT browsers.
    browser.close();
  }
  let exited = true;
  if (child && !childError && child.exitCode === null && !child.signalCode) {
    exited = false;
    child.kill('SIGTERM');
    await Promise.race([childExit.then(() => { exited = true; }), delay(3000)]);
    if (!exited) {
      child.kill('SIGKILL');
      await Promise.race([childExit.then(() => { exited = true; }), delay(2000)]);
    }
    if (!exited) report.errors.push('Spawned Chrome did not exit; profile retained');
  }
  if (profile && exited) {
    try { await rm(profile, {recursive: true, force: true, maxRetries: 3}); report.profileRemoved = true; }
    catch (error) { report.errors.push(`Profile cleanup: ${error.message}`); }
  }
}

try {
  await mkdir(out, {recursive: true});
  report.source = await sourceIdentity();
  await connectBrowser();
  for (const width of widths) for (const theme of themes) for (const state of states) {
    if (interrupted) throw new Error(interrupted);
    await runScene(width, theme, state);
  }
} catch (error) {
  report.errors.push(String(error.stack || error));
} finally {
  await cleanup().catch(error => report.errors.push(`Cleanup: ${error.stack || error}`));
  process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
  report.finishedAt = new Date().toISOString();
  report.result = !report.errors.length && report.scenes.length === 32 && report.scenes.every(scene => scene.result === 'PASS') ? 'PASS' : 'FAIL';
  report.summary = {scenes: report.scenes.length, passed: report.scenes.filter(scene => scene.result === 'PASS').length,
    failed: report.scenes.filter(scene => scene.result === 'FAIL').length,
    screenshots: report.scenes.reduce((sum, scene) => sum + Object.keys(scene.screenshots || {}).length, 0)};
  // Keep report small; detailed geometry/contrast are in the per-scene JSON files.
  const scenes = report.scenes.map(({measurements, focus, touchAndMotion: touch, ...scene}) => ({...scene,
    geometry: `${scene.id}.geometry.json`, contrast: `${scene.id}.contrast.json`}));
  await writeFile(join(out, 'report.json'), JSON.stringify({...report, scenes}, null, 2));
  console.log(`R41 ${report.result}: ${JSON.stringify(report.summary)}; ${join(out, 'report.json')}`);
  if (report.result !== 'PASS') process.exitCode = 1;
}
