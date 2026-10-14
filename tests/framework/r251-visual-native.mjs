/**
 * Explicit parent-driver entry only; importing this module performs no input/I/O.
 *
 * await runR251VisualNative({browser, tool, chrome, out, record, until,
 *   clickNode, key, report, setBrowserZoom, visual: {restoreMedia: {features: []}}});
 * browser.call, tool.read/call/screenshot use local-dev-native-acceptance.mjs's
 * existing CDP wrappers. tool MUST be the live SIDE_PANEL, chrome.pid its owned
 * CFT PID, and tool.screenshot(relativeName) MUST write below this same out.
 * The parent owns this CFT/window/input and media override for the entire call.
 * Call after opening the panel, before closing it; no parent-driver edits here.
 * Include BOTH helper files in the parent's verificationInputs. Preserve the
 * returned evidence even when installation acceptance fails in another slice.
 *
 * Width means actual CSS innerWidth at each requested zoom, NOT a fake viewport.
 * At 200%, a 600 CSS-px panel needs about 1200 native points; Chrome/screen caps
 * are NOT_TESTED. Cmd input is Swift/CGEvent, never ctx.key/CDP zoom emulation.
 * ctx.key remains compatible with the existing context but is not used here.
 * Theme uses declared CDP prefers-color-scheme media override, not an OS change.
 * restoreMedia defaults to clearing that override; supply the previous CDP
 * media parameters when the parent already owns an override.
 *
 * Optional ctx.setBrowserZoom({factor, phase, pid, panelUrl, extensionHost}):
 * phase is 'matrix' or 'restore'. Parent owns a temporary foreground tab in
 * the SAME CFT/profile and chrome-extension host. Use real native Cmd+0/Plus
 * or the Chrome zoom menu, never chrome.tabs.setZoom, CSS or CDP emulation.
 * Close ONLY that temporary tab in finally and restore the original active
 * tab/panel before returning. Do not reuse the live panel's hostInstanceId.
 * Return {method: 'native-cmd'|'native-menu', pid, sourceUrl,
 * temporaryTargetId, temporaryTargetClosed: true, inputs: [native receipts],
 * tabObservation: {dpr, backingScaleFactor, visualViewportScale}}.
 * Return the receipt even if zoom has no effect; throw if cleanup is unknown.
 * Helper independently checks target closure, unchanged Side Panel identity,
 * actual panel DPR/native backingScale and PNG pixels. A tab's zoom or the
 * callback's success never proves Side Panel zoom. Failed proof is NOT_TESTED.
 * Hook is also called for restoration: restore host zoom to requested factor,
 * close the new temporary tab, then return. Preserve parent native receipts.
 * Minimal probe: native Cmd+0, then Cmd+Plus to actual tab DPR/backingScale=2;
 * close tab, observe live panel DPR/backingScale=2 (Retina 4/2), finally restore
 * original host zoom. SetIgnoreZoomGestures(true) is present for extension
 * views in Chromium revision 3ff7ac5a9224be9156d7f8703a06e22890aafd34, whereas
 * its temporary default zoom override is popup-only; inheritance is a probe,
 * not a promise. Official source: chromium/chromium at that revision,
 * chrome/browser/extensions/extension_view_host.cc, ReadyToCommitNavigation.
 *
 * CAPTURED proves collection only. No screenshot comparison, visual score,
 * native ACK, lifecycle, F3, or ZIP installation PASS is inferred here.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';

const execute = promisify(execFile);
const inputSource = fileURLToPath(new URL('./r251-visual-native-input.swift', import.meta.url));
const helperSource = fileURLToPath(import.meta.url);
const widths = [360, 400, 600];
const themes = ['light', 'dark'];
const zooms = [1, 2];
const views = [
  {name: 'develop', tab: '#tab-develop', panel: '#workbench-develop'},
  {name: 'tools', tab: '#tab-tools', panel: '#workbench-tools'},
  {name: 'my', tab: '#tab-my-tasks', panel: '#workbench-tasks'},
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const node = selector => `document.querySelector(${JSON.stringify(selector)})`;
const blocked = message => Object.assign(new Error(message), {code: 'E_R251_VISUAL_NOT_TESTED'});
const same = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

// Read-only DOM observation: no assignments, synthetic events, scrolling, or
// observer installation. Only the parent clickNode and native keys change UI.
function observe() {
  const rect = el => {
    const r = el.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom};
  };
  const rendered = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return !el.closest('[hidden]') && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const describe = el => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {tag: el.tagName, id: el.id, role: el.getAttribute('role'),
      name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 160) || '',
      rect: rect(el), disabled: !!el.disabled,
      outline: {style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset},
      boxShadow: s.boxShadow, opacity: s.opacity};
  };
  const buttons = [...document.querySelectorAll('button,[role=button]')]
    .filter(rendered).map(el => {
      const r = el.getBoundingClientRect();
      let horizontalScroller = null;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) {
          horizontalScroller = {id: parent.id, className: parent.className, rect: rect(parent)}; break;
        }
      }
      return {...describe(el), horizontalScroller, viewportIntersection:
        r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth};
    });
  const overflow = [...document.querySelectorAll('html,body,#workspace-content,[data-workbench-page],pre,textarea')]
    .filter(rendered).map(el => ({id: el.id, tag: el.tagName, clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth, overflowX: getComputedStyle(el).overflowX,
      horizontal: el.scrollWidth > el.clientWidth + 1}));
  const active = document.activeElement;
  return {url: location.href, timeOrigin: performance.timeOrigin, innerWidth, innerHeight,
    dpr: devicePixelRatio, outerWidth, outerHeight, visualViewportScale: visualViewport?.scale ?? null,
    light: matchMedia('(prefers-color-scheme: light)').matches,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    selectedTab: document.querySelector('.workbench-nav [aria-selected=true]')?.id ?? null,
    documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflow, buttons, outOfBoundsButtons: buttons.filter(b => b.viewportIntersection && !b.horizontalScroller &&
      (b.rect.x < -1 || b.rect.right > innerWidth + 1)),
    focus: {element: describe(active), focusVisible: !!active?.matches(':focus-visible'),
      label: describe(active?.closest('label')), nextSibling: describe(active?.nextElementSibling)}};
}

export async function runR251VisualNative(ctx) {
  if (ctx.setBrowserZoom != null && typeof ctx.setBrowserZoom !== 'function')
    throw new TypeError('R25.1 setBrowserZoom must be a parent-owned native input hook');
  for (const name of ['record', 'until', 'clickNode'])
    if (typeof ctx[name] !== 'function') throw new TypeError(`R25.1 visual requires ctx.${name}`);
  if (!ctx.browser?.call || !ctx.tool?.read || !ctx.tool?.call || !ctx.tool?.screenshot ||
      !Number.isInteger(ctx.chrome?.pid) || typeof ctx.out !== 'string')
    throw new TypeError('R25.1 visual requires browser/tool/chrome.pid/out from the owning parent');
  const {browser, tool, chrome, record, until, clickNode} = ctx;
  const directory = `r251-visual-${randomUUID()}`;
  const output = path.resolve(ctx.out, directory);
  fs.mkdirSync(output, {recursive: true});
  const evidence = {level: 'REAL_MAC_CFT_SIDE_PANEL_VISUAL_OBSERVATION', status: 'NOT_TESTED',
    startedAt: new Date().toISOString(), pid: chrome.pid, output,
    widthBasis: 'actual CSS innerWidth at the requested browser zoom; native window is not resized',
    themeMethod: 'CDP Emulation.setEmulatedMedia prefers-color-scheme; OS appearance unchanged',
    zoomMethod: ctx.setBrowserZoom ? 'parent-owned native extension-tab zoom; live panel DPR/native display scale independently verified' :
      'owned foreground CFT Swift CGEvent Cmd+0 / Cmd+Plus; DPR/native display scale verified',
    inputs: [helperSource, inputSource].map(file => ({path: file, sha256: hash(fs.readFileSync(file))})),
    candidate: {packageHash: ctx.report?.installedPackage?.packageHash ?? null,
      buildAttemptId: ctx.report?.buildReceipt?.attemptId ?? null},
    controlObservations: [],
    cases: widths.flatMap(width => themes.flatMap(theme => zooms.map(zoom => ({
      id: `${width}-${theme}-${zoom * 100}`, width, theme, zoom, status: 'NOT_TESTED',
      views: views.map(view => ({name: view.name, status: 'NOT_TESTED', reason: 'not reached'})),
    })))),
    gaps: ['CAPTURED is not a visual quality PASS or an accessibility certification.',
      'No OS theme change, synthetic viewport/zoom, installation ACK, F3 or ZIP evidence.']};
  if (ctx.report) ctx.report.r251Visual = evidence;
  let original, originalNative, identity, mediaChanged = false, nativeChanged = false, viewChanged = false, zoomHookUnsafe;
  const read = () => tool.read(`(${observe.toString()})()`);
  async function native(command, ...args) {
    try {
      checkIdentity(await read());
      const result = await execute('/usr/bin/swift', [inputSource, String(chrome.pid), command,
        identity.url, ...args.map(String)], {timeout: 45000, maxBuffer: 1024 * 1024});
      const receipt = JSON.parse(result.stdout.trim());
      if (receipt.status !== 'CONTROLLED' || receipt.pid !== chrome.pid || receipt.url !== identity.url)
        throw blocked('native input receipt does not match the owned panel');
      record('r251.visual.native', receipt);
      return receipt;
    } catch (error) {
      record('r251.visual.native-unavailable', {command, message: error.message,
        stdout: error.stdout?.trim(), stderr: error.stderr?.trim()});
      throw blocked(`Native ${command} unavailable: ${error.stdout?.trim() || error.message}`);
    }
  }
  function checkIdentity(observation) {
    if (observation.url !== identity.url || observation.timeOrigin !== identity.timeOrigin)
      throw blocked('Side Panel document changed; this helper will not reacquire or replay input');
  }
  function actualZoom(observation, nativeState) {
    checkIdentity(observation);
    if (observation.visualViewportScale !== 1 || !(nativeState.screen?.backingScaleFactor > 0))
      throw blocked('native display scale or unpinched viewport cannot be verified');
    return observation.dpr / nativeState.screen.backingScaleFactor;
  }
  function zoomObservation(wanted, action, observation, state) {
    const sample = {at: new Date().toISOString(), wanted, action, innerWidth: observation.innerWidth,
      innerHeight: observation.innerHeight, dpr: observation.dpr, displayScale: state.screen?.backingScaleFactor,
      visualViewportScale: observation.visualViewportScale, actualFactor: actualZoom(observation, state)};
    evidence.controlObservations.push(sample); record('r251.visual.zoom-observation', sample);
    return sample.actualFactor;
  }
  async function setZoom(wanted, phase = 'matrix') {
    if (ctx.setBrowserZoom) {
      if (zoomHookUnsafe) throw blocked(`parent zoom hook cannot be replayed: ${zoomHookUnsafe}`);
      await native('activate');
      nativeChanged = true;
      let receipt;
      try {
        receipt = await ctx.setBrowserZoom({factor: wanted, phase, pid: chrome.pid,
          panelUrl: identity.url, extensionHost: new URL(identity.url).hostname});
        record('r251.visual.browser-zoom-hook', {wanted, phase, receipt});
        evidence.controlObservations.push({kind: 'browser-zoom-hook', at: new Date().toISOString(), wanted, phase, receipt});
        if (!receipt || !['native-cmd', 'native-menu'].includes(receipt.method) || receipt.pid !== chrome.pid ||
            new URL(receipt.sourceUrl).protocol !== 'chrome-extension:' ||
            new URL(receipt.sourceUrl).hostname !== new URL(identity.url).hostname ||
            typeof receipt.temporaryTargetId !== 'string' || !receipt.temporaryTargetId ||
            receipt.temporaryTargetClosed !== true || !Array.isArray(receipt.inputs) || !receipt.inputs.length)
          throw blocked('parent zoom hook receipt lacks owned native input or temporary-tab cleanup');
        const {targetInfos} = await browser.call('Target.getTargets');
        if (!Array.isArray(targetInfos) || targetInfos.some(target => target.targetId === receipt.temporaryTargetId))
          throw blocked('parent zoom hook temporary tab closure cannot be independently verified');
        checkIdentity(await read());
      } catch (error) {
        zoomHookUnsafe = error.message;
        record('r251.visual.browser-zoom-hook-unavailable', {wanted, phase, reason: error.message});
        throw blocked(`parent native zoom/cleanup unavailable: ${error.message}`);
      }
      const confirmed = await until(async () => {
        const observation = await read(), state = await native('inspect');
        return same(zoomObservation(wanted, `parent ${receipt.method} extension-tab; tab closed`, observation, state), wanted, .015)
          ? {observation, state} : null;
      }, 'R25.1 live Side Panel inherits actual native extension-host zoom', 5000);
      return {method: receipt.method, receipt, actualFactor: actualZoom(confirmed.observation, confirmed.state)};
    }
    await native('activate');
    // Focus the actual panel through an existing trusted pointer path; no Run,
    // Save, permission or install action is used to direct browser shortcuts.
    const tab = await tool.read('document.querySelector(".workbench-nav [aria-selected=true]")?.id');
    viewChanged = true;
    if (!views.some(view => view.tab === `#${tab}`))
      await clickNode(tool, node('#tab-develop'));
    else await clickNode(tool, node(`#${tab}`));
    nativeChanged = true;
    await native('key', 'zoom-reset');
    const base = await until(async () => {
      const observation = await read(), state = await native('inspect');
      return same(zoomObservation(wanted, 'native Cmd+0', observation, state), 1, .015) ? {observation, state} : null;
    }, 'R25.1 native Cmd+0 and 100% display scale', 4000);
    const steps = [];
    let current = base;
    for (let step = 0; !same(actualZoom(current.observation, current.state), wanted, .015); step++) {
      if (step >= 12) throw blocked(`native browser zoom ${wanted} not reachable`);
      const before = actualZoom(current.observation, current.state);
      const receipt = await native('key', wanted > 1 ? 'zoom-in' : 'zoom-out');
      current = await until(async () => {
        const observation = await read(), state = await native('inspect');
        const factor = zoomObservation(wanted, wanted > 1 ? 'native Cmd+Plus' : 'native Cmd+Minus', observation, state);
        return !same(factor, before, .015) ? {observation, state} : null;
      }, 'R25.1 actual panel responds to native Cmd zoom', 4000);
      const factor = actualZoom(current.observation, current.state);
      steps.push({receipt, dpr: current.observation.dpr, factor});
      if ((wanted > 1 && factor > wanted + .015) || (wanted < 1 && factor < wanted - .015))
        throw blocked(`native browser zoom overshot ${wanted}: ${factor}`);
    }
    return {base, steps, actualFactor: actualZoom(current.observation, current.state)};
  }
  async function setWidth(wanted, zoom) {
    const attempts = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const observation = await read(), state = await native('inspect');
      if (!same(actualZoom(observation, state), zoom, .015)) throw blocked('zoom changed during splitter control');
      if (same(observation.innerWidth, wanted)) return {actualInnerWidth: observation.innerWidth, state, attempts};
      const delta = (wanted - observation.innerWidth) * zoom;
      nativeChanged = true;
      const receipt = await native('drag', delta, observation.innerWidth, zoom);
      let settledWidth, waitError;
      try {
        await until(async () => {
          const next = await read(); checkIdentity(next);
          const stable = next.innerWidth !== observation.innerWidth && next.innerWidth === settledWidth;
          settledWidth = next.innerWidth;
          return stable ? next : null;
        }, 'R25.1 actual innerWidth settles after native splitter drag', 4000);
      } catch (error) { waitError = error.message; }
      // Retry a missed pickup only after fresh identity, zoom and native
      // window checks. Native11's identical second drag reached 600 CSS px.
      const changed = await read(); checkIdentity(changed);
      const after = await native('inspect');
      if (Object.keys(state.window).some(key => !same(state.window[key], after.window[key], .5)))
        throw blocked('browser window moved/resized during width control');
      if (!same(actualZoom(changed, after), zoom, .015)) throw blocked('zoom changed after native splitter drag');
      const control = {kind: 'width', at: new Date().toISOString(), wanted, attempt: attempt + 1,
        before: observation.innerWidth, after: changed.innerWidth, receipt,
        nativeBefore: state.panel, nativeAfter: after.panel, waitError: waitError ?? null,
        outcome: waitError ? 'UNCONFIRMED' : same(changed.innerWidth, wanted) ? 'REACHED' : 'ADJUSTED'};
      attempts.push(control); evidence.controlObservations.push(control);
      record('r251.visual.width-observation', control);
      if (!waitError && same(changed.innerWidth, wanted)) return {actualInnerWidth: changed.innerWidth, state: after, attempts};
    }
    throw blocked(`actual panel innerWidth ${wanted} not reachable through its native splitter`);
  }
  async function verifyCell(observation, cell) {
    const state = await native('inspect');
    if (!same(observation.innerWidth, cell.width) || !same(actualZoom(observation, state), cell.zoom, .015) ||
        !observation[cell.theme]) throw blocked('width/theme/zoom changed during capture');
    return state;
  }
  try {
    if (process.platform !== 'darwin') throw blocked('real Mac Chrome required');
    original = await read(); identity = {url: original.url, timeOrigin: original.timeOrigin};
    if (!/^chrome-extension:\/\/[a-p]{32}\/ui\/tool\.html(?:\?|$)/.test(identity.url))
      throw blocked('ctx.tool is not the trusted tool host');
    const contexts = await tool.read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    const panelContexts = contexts.filter(context => context.documentUrl === identity.url);
    if (panelContexts.length !== 1) throw blocked('exact live SIDE_PANEL context unavailable');
    evidence.context = panelContexts[0]; evidence.browser = await browser.call('Browser.getVersion');
    originalNative = await native('inspect');
    evidence.original = {observation: original, native: originalNative, zoom: actualZoom(original, originalNative)};
    for (const cell of evidence.cases) {
      try {
        const now = await read(); checkIdentity(now);
        cell.zoomProof = await setZoom(cell.zoom);
        cell.widthProof = await setWidth(cell.width, cell.zoom);
        mediaChanged = true;
        await tool.call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: cell.theme}]});
        await until(() => tool.read(`matchMedia('(prefers-color-scheme: ${cell.theme})').matches`),
          'R25.1 declared theme media override', 3000);
        for (let index = 0; index < views.length; index++) {
          const view = views[index], result = cell.views[index];
          try {
            await native('activate'); checkIdentity(await read());
            viewChanged = true; await clickNode(tool, node(view.tab));
            await until(() => tool.read(`${node(view.tab)}?.getAttribute('aria-selected')==='true'&&
              ${node(view.panel)}&&!${node(view.panel)}.hidden`), `R25.1 ${view.name} visible`, 4000);
            const beforeFocus = await read();
            const focusReceipt = await native('key', 'tab');
            const observation = await read();
            const state = await verifyCell(observation, cell);
            const relative = `${directory}/${cell.id}-${view.name}.png`;
            await tool.screenshot(relative);
            const afterCapture = await read(); await verifyCell(afterCapture, cell);
            const bytes = fs.readFileSync(path.resolve(ctx.out, relative));
            if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
              throw blocked('parent screenshot did not produce a PNG');
            const pixels = {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
            if (!same(pixels.width, observation.innerWidth * observation.dpr, 3) ||
                !same(pixels.height, observation.innerHeight * observation.dpr, 3))
              throw blocked('screenshot pixel size does not match the real panel viewport/DPR');
            result.status = 'CAPTURED'; delete result.reason;
            Object.assign(result, {observation, native: state, focus: {status: 'OBSERVED',
              method: 'owned native Tab', before: beforeFocus.focus, after: observation.focus, receipt: focusReceipt},
              afterCapture, screenshot: {path: path.resolve(ctx.out, relative), sha256: hash(bytes), bytes: bytes.length, pixels},
              layout: {status: observation.documentHorizontalOverflow || observation.outOfBoundsButtons.length ? 'FAIL' : 'PASS',
                scope: 'read-only document overflow and viewport-intersecting button horizontal bounds; explicit horizontal scrollers recorded separately'}});
            record('r251.visual.capture', {caseId: cell.id, view: view.name, ...result});
          } catch (error) {
            result.status = 'NOT_TESTED'; result.reason = error.message;
            record('r251.visual.view-not-tested', {caseId: cell.id, view: view.name, reason: result.reason});
          }
        }
        cell.status = cell.views.some(view => view.status === 'NOT_TESTED') ? 'NOT_TESTED' :
          cell.views.some(view => view.layout.status === 'FAIL') ? 'FAIL' : 'CAPTURED';
      } catch (error) {
        cell.status = 'NOT_TESTED'; cell.reason = error.message;
        try { cell.lastObservation = await read(); }
        catch (inspection) { cell.inspectionFailure = inspection.message; }
        for (const view of cell.views) if (view.status === 'NOT_TESTED') view.reason = error.message;
        record('r251.visual.case-not-tested', {caseId: cell.id, reason: cell.reason});
      }
    }
  } catch (error) {
    evidence.reason = error.message;
    for (const cell of evidence.cases) if (!cell.reason) {
      cell.reason = error.message;
      for (const view of cell.views) view.reason = error.message;
    }
    record('r251.visual.not-tested', {reason: error.message});
  } finally {
    evidence.restoration = [];
    const restore = async (name, action) => {
      try { await action(); evidence.restoration.push({name, status: 'RESTORED'}); }
      catch (error) { evidence.restoration.push({name, status: 'NOT_TESTED', reason: error.message}); }
    };
    if (mediaChanged) await restore('media override', async () => {
      await tool.call('Emulation.setEmulatedMedia', ctx.visual?.restoreMedia ?? {features: []});
      const observed = await read(); checkIdentity(observed);
      if (observed.light !== original.light || observed.dark !== original.dark)
        throw blocked('original theme was not restored; supply ctx.visual.restoreMedia');
    });
    if (nativeChanged && evidence.original) await restore('native zoom and panel width', async () => {
        await setZoom(evidence.original.zoom, 'restore');
      await setWidth(original.innerWidth, evidence.original.zoom);
    });
    if (viewChanged && original?.selectedTab)
      await restore('selected view', async () => { checkIdentity(await read());
        if (!/^[\w-]+$/.test(original.selectedTab)) throw blocked('original tab selector unavailable');
        await native('activate'); await clickNode(tool, node(`#${original.selectedTab}`));
        await until(() => tool.read(`${node(`#${original.selectedTab}`)}?.getAttribute('aria-selected')==='true'`),
          'original selected view restored', 3000); });
    evidence.status = evidence.cases.some(cell => cell.status === 'FAIL') ? 'FAIL' :
      evidence.cases.every(cell => cell.status === 'CAPTURED') &&
      evidence.restoration.every(item => item.status === 'RESTORED') ? 'CAPTURED' : 'NOT_TESTED';
    evidence.finishedAt = new Date().toISOString();
    evidence.manifest = path.join(output, 'evidence.json');
    fs.writeFileSync(evidence.manifest, JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
    record('r251.visual.summary', {status: evidence.status, manifest: evidence.manifest,
      capturedViews: evidence.cases.flatMap(cell => cell.views).filter(view => view.status === 'CAPTURED').length,
      restoration: evidence.restoration});
  }
  return evidence;
}
