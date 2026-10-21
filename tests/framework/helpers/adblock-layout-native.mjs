/**
 * AdBlock P0-4: explicit entry only; importing never opens Chrome or writes files.
 *
 * await runAdblockLayoutNative({client, hostSession: sid, reactSession: react,
 *   evaluate, click, clickSandbox, screenshot, until, report, nativeEnvironment});
 * Existing runner signatures are used unchanged. screenshot writes to the owning
 * runner's evidence directory; the runner must persist report in its finally.
 * Include this file's SHA in that report's verification inputs.
 *
 * Exported adapter prototype (NOT_TESTED; not automatically selected) uses the existing browserSessions PID, real Side Panel
 * splitter via r251's owned Swift input, and a same-origin existing Chrome tab's
 * tabs.setZoom/getZoom. It creates no tab/browser. Optional zoomSession/zoomTabId
 * select the runner's launcher tab (uid). chromePid overrides the report PID.
 * Extension-tab hosts use Browser.setWindowBounds and are labelled accordingly.
 * Native owner must explicitly pass nativeEnvironment; adapter integration is unfinished:
 *   read() -> {backingScaleFactor, ...native measurements/receipts}
 *   apply({width, zoom}) -> {widthMethod:'native-splitter', zoomMethod:string,
 *     evidence: native input receipts}. Width is actual iframe CSS innerWidth at
 *     EACH requested zoom, not window width or screenshot device pixels.
 *   restore(original) -> restoration receipt (throw if restoration is unknown).
 * Zoom method must describe real Chrome zoom, not deviceScaleFactor/page scale.
 * read's native backingScaleFactor independently checks iframe DPR/zoom.
 * Unreachable geometry may throw code E_ADBLOCK_LAYOUT_UNREACHABLE; other adapter
 * errors stop further native input. All paths attempt restoration.
 *
 * No adapter, missing native access or unreachable geometry: current installed UI only;
 * unproved matrix cells stay NOT_TESTED. Never convert browser/screen limits to PASS.
 * Theme is explicitly CDP prefers-color-scheme, not an OS appearance claim.
 * restoreMedia may contain {host:{features:[]}, react:{features:[]}} for existing
 * overrides; by default the owning runner declares there was no prior override.
 * No filter toggle, restore/delete/picker, installation, or permission action is
 * activated. Tab/Shift+Tab and Enter activate only product navigation buttons.
 * This is bounded DOM/AX/contrast evidence, not a six-dimension score or a full
 * screen reader, pixel comparison, permission, DNR, lifecycle or release verdict.
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const nativeInput = fileURLToPath(new URL('../r251-visual-native-input.swift',import.meta.url));

export const ADBLOCK_LAYOUT_MATRIX = Object.freeze(
  [320, 360, 400, 440].flatMap(width => ['light', 'dark'].flatMap(theme =>
    [1, 2].map(zoom => Object.freeze({width, theme, zoom})))));

// WCAG sRGB luminance. Callers supply already composited, opaque RGB channels.
export function contrastRatio(foreground, background) {
  const luminance = rgb => rgb.slice(0,3).reduce((sum, channel, i) => {
    const value = channel / 255;
    return sum + [.2126, .7152, .0722][i] *
      (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  }, 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

const backSelector = 'button[aria-label="返回广告拦截概览"]';
const settingsSelector = '#sidebar-tool-settings-open';
const summarize = values => values.includes('FAIL') ? 'FAIL' :
  values.length && values.every(x => x === 'PASS') ? 'PASS' : 'NOT_TESTED';
const near = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const issue = message => Object.assign(new Error(message), {code: 'E_ADBLOCK_LAYOUT_UNREACHABLE'});

/** Real window/zoom adapter. No emulated metrics, new targets or Chrome launch. */
export function createAdblockLayoutEnvironment(ctx) {
  const {client,hostSession,reactSession,evaluate,until} = ctx;
  let state,detached=false;
  const readDOM = () => evaluate(client,hostSession,`(async()=>{
    const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[location.href]});
    const tab=await chrome.tabs.getCurrent();
    return {url:location.href,timeOrigin:performance.timeOrigin,dpr:devicePixelRatio,width:innerWidth,
      surface:contexts.length===1?'SIDE_PANEL':'EXTENSION_TAB',tabId:tab?.id};})()`);
  const frame = () => evaluate(client,reactSession,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  async function native(command,...args) {
    if(!state?.pid) throw issue('Owned CFT PID absent; native Side Panel splitter cannot be controlled');
    const current=await readDOM();
    if(current.url!==state.host.url||current.timeOrigin!==state.host.timeOrigin)
      throw Error('Native input stopped: original host document changed');
    try {
      const reply=await execute('/usr/bin/swift',[nativeInput,String(state.pid),command,state.host.url,...args.map(String)],
        {timeout:45000,maxBuffer:1024*1024});
      const receipt=JSON.parse(reply.stdout.trim());
      if(receipt.status!=='CONTROLLED'||receipt.pid!==state.pid||receipt.url!==state.host.url)
        throw Error('Owned native input receipt mismatch');
      return receipt;
    } catch(error) {throw issue('Native '+command+' unavailable: '+(error.stdout?.trim()||error.message));}
  }
  async function initialize() {
    if(state) return;
    const host=await readDOM();
    const info=(await client.send('Target.getTargetInfo',{},hostSession)).targetInfo;
    const window=await client.send('Browser.getWindowForTarget',{targetId:info.targetId});
    state={host,window,targetId:info.targetId,pid:ctx.chromePid||ctx.report?.browserSessions?.at(-1)?.pid};
    state.zoomSession=ctx.zoomSession;
    if(!state.zoomSession) {
      if(host.surface==='EXTENSION_TAB') state.zoomSession=hostSession;
      else {
        const targets=(await client.send('Target.getTargets')).targetInfos;
        const target=targets.find(x=>x.type==='page'&&x.targetId!==info.targetId&&
          x.url.startsWith(new URL(host.url).origin+'/'));
        if(!target) throw issue('No existing same-extension tab for real Chrome tabs.setZoom');
        state.zoomSession=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
        state.ownsZoomSession=true;
        await client.send('Runtime.enable',{},state.zoomSession);
      }
    }
    const tab=await evaluate(client,state.zoomSession,'chrome.tabs.getCurrent()');
    if(!Number.isInteger(tab?.id)||(ctx.zoomTabId!=null&&ctx.zoomTabId!==tab.id)||
        !tab.url?.startsWith(new URL(host.url).origin+'/'))
      throw issue('Zoom launcher is not an existing tab of this extension');
    state.tabId=tab.id;
    state.originalTabZoom=await evaluate(client,state.zoomSession,'chrome.tabs.getZoom('+tab.id+')');
    state.initialFrame=await frame();
  }
  async function setZoom(factor) {
    const expression='(async()=>{const before=await chrome.tabs.getZoom('+state.tabId+');'+
      'await chrome.tabs.setZoom('+state.tabId+','+factor+');'+
      'return {before,after:await chrome.tabs.getZoom('+state.tabId+'),tabId:'+state.tabId+'};})()';
    const receipt=await evaluate(client,state.zoomSession,expression);
    if(!near(receipt.after,factor,.005)) throw issue('Chrome getZoom did not confirm '+factor);
    await client.send('Page.bringToFront',{},hostSession);
    return {method:'chrome.tabs.setZoom/getZoom (same extension origin)',...receipt};
  }
  async function read() {
    await initialize();
    const host=await readDOM(), ui=await frame();
    if(host.surface==='SIDE_PANEL') {
      const observation=await native('inspect');
      return {backingScaleFactor:observation.screen.backingScaleFactor,native:observation,host,iframe:ui,
        browserZoomFactor:ui.dpr/observation.screen.backingScaleFactor,window:state.window};
    }
    const tabZoom=await evaluate(client,hostSession,'chrome.tabs.getZoom('+host.tabId+')');
    return {backingScaleFactor:host.dpr/tabZoom,browserZoomFactor:tabZoom,host,iframe:ui,
      window:state.window,measurement:'actual extension-tab getZoom and document DPR; no Side Panel width claim'};
  }
  async function resize(width,zoom) {
    const receipts=[];
    for(let attempt=0;attempt<4;attempt++) {
      const current=await frame();
      if(near(current.width,width,1)) return receipts;
      const delta=(width-current.width)*zoom;
      if(state.host.surface==='SIDE_PANEL') {
        receipts.push(await native('activate'));
        const host=await readDOM();
        receipts.push(await native('drag',delta,host.width,zoom));
      } else {
        const before=await client.send('Browser.getWindowBounds',{windowId:state.window.windowId});
        const bounds={width:Math.max(100,Math.round(before.bounds.width+delta)),windowState:'normal'};
        // Chromium requires normalizing state separately from geometry.
        if(before.bounds.windowState!=='normal')
          await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:'normal'}});
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{width:bounds.width}});
        receipts.push({method:'Browser.setWindowBounds',before:before.bounds,requested:bounds});
      }
      await until(async()=>{const next=await frame();return next.width!==current.width&&next;},
        'Actual installed iframe changes after native width input',2500).catch(error=>
          receipts.push({unconfirmed:String(error.message||error)}));
    }
    if(!near((await frame()).width,width,1)) {
      const error=issue('Actual '+state.host.surface+' iframe CSS width '+width+' is unreachable (native minimum/screen/splitter)');
      error.evidence=receipts;throw error;
    }
    return receipts;
  }
  return {
    read,
    async apply({width,zoom}) {
      const original=await read();
      const zoomReceipt=await setZoom(zoom);
      try {
        await until(async()=>near((await frame()).dpr/original.backingScaleFactor,zoom,.025),
          'Chrome zoom reaches the actual installed iframe',3000);
      } catch(error) {
        const unavailable=issue('Real tabs.setZoom='+zoom+' did not reach '+state.host.surface+' iframe DPR');
        unavailable.evidence={zoomReceipt,actual:await frame(),backingScaleFactor:original.backingScaleFactor};
        throw unavailable;
      }
      const widthReceipts=await resize(width,zoom);
      return {widthMethod:state.host.surface==='SIDE_PANEL'?'native-splitter':'browser-window-bounds',
        zoomMethod:zoomReceipt.method,evidence:{zoomReceipt,widthReceipts},surface:state.host.surface};
    },
    async restore(original) {
      try {
        if(!state?.tabId) return null;
        const zoomReceipt=await setZoom(state.originalTabZoom);
        const bounds=state.window.bounds;
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:'normal'}});
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,
          bounds:{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}});
        const observed=await read();
        const widthReceipts=await resize(original.iframe.width,observed.browserZoomFactor);
        if(bounds.windowState!=='normal')
          await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:bounds.windowState}});
        return {zoomReceipt,widthReceipts,window:await client.send('Browser.getWindowBounds',{windowId:state.window.windowId})};
      } finally {
        if(state?.ownsZoomSession&&!detached) {
          await client.send('Target.detachFromTarget',{sessionId:state.zoomSession});detached=true;
        }
      }
    },
  };
}

// Serialized into the REAL installed iframe. Reads only: no styles, DOM, SDK
// methods, focus(), click(), scrollIntoView(), synthetic events or state seeding.
function inspectUI(ratio) {
  const app = document.querySelector('.adblock-app');
  if (!app) return {mounted: false};
  const rect = el => {
    const r = el.getBoundingClientRect();
    return {x:r.x, y:r.y, left:r.left, top:r.top, right:r.right, bottom:r.bottom,
      width:r.width, height:r.height};
  };
  const key = el => {
    const parts = [];
    for (let n = el; n && n !== app; n = n.parentElement) {
      const index = [...n.parentElement.children].filter(x => x.tagName === n.tagName).indexOf(n) + 1;
      parts.unshift(n.localName + ':nth-of-type(' + index + ')');
    }
    return '.adblock-app > ' + parts.join(' > ');
  };
  const owner = el => el.closest('[data-slot="switch"]') || el;
  const rendered = el => {
    if (!el || el.closest('[hidden],[inert]')) return false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const color = value => {
    // Unsupported wide gamut/gradients are NOT_TESTED, never a white fallback.
    const m = value.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const channels = m[1].replaceAll(',', ' ').replace('/', ' ').trim().split(/\s+/).map(Number);
    if (channels.some(x => !Number.isFinite(x)) || channels.length < 3) return null;
    return [...channels.slice(0,3), channels[3] ?? 1];
  };
  const over = (fg, bg) => {
    const alpha = fg[3] + bg[3] * (1 - fg[3]);
    return [...fg.slice(0,3).map((c,i) => alpha ?
      (c * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / alpha : 0), alpha];
  };
  const background = el => {
    const layers = [];
    let opaque = false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none' || Number(s.opacity) !== 1 || s.filter !== 'none' ||
          s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal') return null;
      const c = color(s.backgroundColor);
      if (!c) return null;
      if (!opaque) layers.push(c);
      if (c[3] === 1) opaque = true;
    }
    if (!layers.length || layers.at(-1)[3] !== 1) return null;
    return layers.reverse().reduce((bg, fg) => over(fg, bg), [0,0,0,0]);
  };
  const name = el => el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
    [...(el.labels || [])].map(x => x.textContent).join(' ').trim() || el.textContent.trim();
  const describe = el => {
    const visual = owner(el), style = getComputedStyle(visual), bounds = rect(visual);
    return {key:key(el), tag:el.tagName, role:el.getAttribute('role') ||
      (el.tagName === 'BUTTON' ? 'button' : el.type || el.localName),
      name:name(el), disabled:!!el.disabled || visual.hasAttribute('data-disabled') ||
        el.getAttribute('aria-disabled') === 'true', tabIndex:el.tabIndex, rect:bounds,
      hiddenFromAX:!!el.closest('[aria-hidden="true"]'),
      inViewport:bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
      outline:{width:parseFloat(style.outlineWidth), style:style.outlineStyle,
        color:style.outlineColor, offset:style.outlineOffset}, boxShadow:style.boxShadow,
      focusVisible:el.matches(':focus-visible') || visual.hasAttribute('data-focus-visible')};
  };
  const controls = [...app.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="switch"]')]
    .filter(el => rendered(owner(el))).map(describe);
  const active = document.activeElement;
  let focus = null;
  if (document.hasFocus() && active && app.contains(active)) {
    focus = describe(active);
    const visual = owner(active), bg = background(visual.parentElement), fg = color(focus.outline.color);
    focus.outlineContrast = bg && fg ? ratio(over(fg,bg),bg) : null;
    const r = focus.rect;
    const x = Math.max(0,Math.min(innerWidth - 1,r.left + r.width / 2));
    const y = Math.max(0,Math.min(innerHeight - 1,r.top + r.height / 2));
    const hit = document.elementFromPoint(x,y);
    focus.hit = !!hit && (visual === hit || visual.contains(hit));
    focus.body = false;
  }
  const text = [], walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, el = node.parentElement, value = node.textContent.trim();
    if (!value || !rendered(el)) continue;
    const style = getComputedStyle(el), bg = background(el), fg = color(style.color);
    const disabled = !!el.closest(':disabled,[aria-disabled="true"],[data-disabled]');
    const size = parseFloat(style.fontSize), weight = parseInt(style.fontWeight,10) || 400;
    const threshold = size >= 24 || (size >= 18.6667 && weight >= 700) ? 3 : 4.5;
    const unsupported = !bg || !fg || style.textShadow !== 'none' ||
      style.webkitTextFillColor !== style.color;
    const result = unsupported ? null : ratio(over(fg,bg),bg);
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].map(r =>
      ({left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height}));
    text.push({key:key(el), text:value, color:style.color, background:bg, fontSize:size,
      fontWeight:weight, threshold, ratio:result, rects,
      status:disabled ? 'EXEMPT_DISABLED' : result === null ? 'NOT_TESTED' :
        result + 1e-7 >= threshold ? 'PASS' : 'FAIL'});
  }
  return {mounted:true, url:location.href, timeOrigin:performance.timeOrigin,
    viewport:{width:innerWidth, height:innerHeight, dpr:devicePixelRatio,
      visualScale:visualViewport?.scale ?? null},
    theme:{light:matchMedia('(prefers-color-scheme:light)').matches,
      dark:matchMedia('(prefers-color-scheme:dark)').matches},
    tokens:Object.fromEntries(['--od-ink','--od-sub','--od-paper','--od-bg','--od-focus','--od-negative']
      .map(token => [token,getComputedStyle(document.documentElement).getPropertyValue(token).trim()])),
    runtime:{sdk:typeof globalThis.OpenDeskTool?.request === 'function',
      react:globalThis.OpenDeskPageReact?.version || null,sharedUI:!!globalThis.OpenDeskSidebarUI},
    view:app.querySelector('.adblock-page-head strong')?.textContent.trim() || 'overview',
    statusText:app.querySelector('.adblock-state')?.textContent.trim() || '',
    overflow:{document:document.documentElement.scrollWidth > innerWidth + 1,
      app:app.scrollWidth > app.clientWidth + 1,
      scrollWidth:document.documentElement.scrollWidth, clientWidth:innerWidth},
    outside:controls.filter(x => x.rect.left < -1 || x.rect.right > innerWidth + 1),
    controls, focus, text};
}

export async function runAdblockLayoutNative(ctx) {
  const {client,hostSession,reactSession,evaluate,screenshot,until,report,nativeEnvironment} = ctx;
  if (!client?.send || !hostSession || !reactSession || !report ||
      [evaluate,screenshot,until,ctx.click,ctx.clickSandbox].some(fn => typeof fn !== 'function'))
    throw new TypeError('AdBlock layout requires the existing native runner sessions/helpers/report');
  if (nativeEnvironment && ['read','apply','restore'].some(name => typeof nativeEnvironment[name] !== 'function'))
    throw new TypeError('nativeEnvironment requires read(), apply({width,zoom}), restore(original)');
  const result = report.reactLayout = {
    schema:'opendesk.adblock.layout-native.v1', status:'NOT_TESTED',
    widthSemantics:'actual installed iframe CSS innerWidth at each real browser zoom',
    themeMethod:'CDP prefers-color-scheme on actual host and installed iframe',
    candidate:{candidate:report.candidate,root:report.root,packageSHA256:report.packageSHA256,
      artifactPackageHash:report.artifactPackageHash,sourceChain:report.sourceChain},
    matrix:ADBLOCK_LAYOUT_MATRIX.map(x => ({...x,status:'NOT_TESTED'})),
    sourceBinding:report.sourceChain?.buildId && /^[a-f0-9]{64}$/i.test(report.packageSHA256 || '') &&
      report.sourceChain.currentSourcePackageHash === report.sourceChain.rootOfficialPackageHash ? 'PASS' : 'NOT_TESTED',
    cases:[], screenshots:[], cleanup:[], limitations:[
      'Only installed React UI evidence; no six-dimension score, DNR, security, lifecycle or release PASS.',
      'AX names and bounded keyboard paths do not prove screen reader announcements or full WCAG conformance.',
      'Contrast uses actual computed sRGB text/background; complex paint or transparent canvas is NOT_TESTED.',
      'Disabled text is exempt; nontext boundaries, all UI states and screenshot visual review remain NOT_TESTED.',
      'Read-only navigation never activates filter switches, picker, rule restore or uninstall.',
      'Screenshots are the real host viewport, with iframe geometry; no mock/preview is accepted.',
    ],
  };
  const read = () => evaluate(client,reactSession,
    '(' + inspectUI.toString() + ')(' + contrastRatio.toString() + ')');
  const host = () => evaluate(client,hostSession,`(async()=>{
    const frame=document.querySelector('#sidebar-tool-frame iframe');
    const r=frame?.getBoundingClientRect();
    const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[location.href]});
    const a=document.activeElement;
    return {url:location.href,timeOrigin:performance.timeOrigin,extensionId:chrome.runtime.id,
      contexts:contexts.map(x=>({documentId:x.documentId,documentUrl:x.documentUrl,contextType:x.contextType})),
      width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport?.scale,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      frame:frame?{src:frame.src,visible:!frame.closest('[hidden]')&&r.width>0&&r.height>0,
        rect:r.toJSON(),scaleX:r.width/frame.offsetWidth,scaleY:r.height/frame.offsetHeight,
        clientLeft:frame.clientLeft,clientTop:frame.clientTop}:null,
      active:{tag:a?.tagName,id:a?.id,inIframe:a===frame},
      title:document.querySelector('#sidebar-tool-title')?.textContent.trim()};})()`);
  const key = async (value, shift = false) => {
    const code = value === 'Tab' ? 9 : 13;
    for (const type of ['keyDown','keyUp'])
      await client.send('Input.dispatchKeyEvent',{type,key:value,code:value,
        windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers:shift?8:0},hostSession);
  };
  let identity, original, initialEnvironment, environmentTouched = false, mediaTouched = false, serial = 0;
  const snap = async label => {
    const shot = await screenshot(client,hostSession,'adblock-layout-'+(++serial)+'-'+label);
    if (!shot?.file || !shot?.sha256) throw Error('screenshot helper did not return a file and SHA-256');
    result.screenshots.push(shot); return shot;
  };
  const verifyIdentity = async () => {
    const panel = await host(), ui = await read();
    if (!ui.mounted || !ui.runtime.sdk || !ui.runtime.react || !ui.runtime.sharedUI ||
        !panel.frame?.visible || panel.frame.src !== ui.url ||
        panel.contexts.length !== 1 || panel.contexts[0].documentUrl !== panel.url ||
        !panel.url.startsWith('chrome-extension://') || panel.title !== '广告拦截')
      throw issue('Not the visible installed AdBlock iframe in a self-reported SIDE_PANEL');
    const tree = await client.send('Page.getFrameTree',{},reactSession);
    const owner = await client.send('DOM.getFrameOwner',{frameId:tree.frameTree.frame.id},hostSession);
    const described = await client.send('DOM.describeNode',{backendNodeId:owner.backendNodeId},hostSession);
    const attrs = described.node.attributes || [];
    const src = attrs.indexOf('src') >= 0 ? attrs[attrs.indexOf('src')+1] : null;
    if (described.node.nodeName !== 'IFRAME' || src !== panel.frame.src)
      throw issue('React session cannot be bound to the installed host iframe owner');
    const now = {hostUrl:panel.url,hostTimeOrigin:panel.timeOrigin,
      documentId:panel.contexts[0].documentId,frameUrl:ui.url,frameTimeOrigin:ui.timeOrigin};
    if (identity && JSON.stringify(identity) !== JSON.stringify(now))
      throw Error('Installed host/iframe identity changed during layout input; stopped');
    identity ||= now;
    return {panel,ui};
  };
  const activeMatches = async (scope, selector) => evaluate(client,
    scope === 'host' ? hostSession : reactSession,
    '(()=>{const a=document.activeElement;return document.hasFocus()&&!!a&&a.matches('+JSON.stringify(selector)+')})()');
  const focusTarget = async (scope, selector, trace) => {
    for (let step=0;step<90;step++) {
      if (await activeMatches(scope,selector)) return;
      await key('Tab');
      trace.push({key:'Tab',scope,selector,step});
    }
    throw Object.assign(Error('Native Tab cannot reach '+scope+' '+selector),{code:'E_ADBLOCK_LAYOUT_UI_FAILURE'});
  };
  const keyboardNavigate = async (scope, selector, expected, trace) => {
    await focusTarget(scope,selector,trace);
    await key('Enter'); trace.push({key:'Enter',scope,selector});
    await until(async()=>((await read()).view === expected),'AdBlock keyboard view '+expected,5000);
  };
  const inspectFocus = async () => {
    const ui = await read(), outer = await host(), focus = ui.focus;
    if (!focus || !outer.active.inIframe) return null;
    const f = outer.frame, r = focus.rect;
    const left=f.rect.left+(f.clientLeft+r.left)*f.scaleX;
    const top=f.rect.top+(f.clientTop+r.top)*f.scaleY;
    const right=left+r.width*f.scaleX,bottom=top+r.height*f.scaleY;
    const fullyVisible = focus.inViewport && left >= -1 && right <= outer.width+1 &&
      top >= -1 && bottom <= outer.height+1;
    const outerHit=await evaluate(client,hostSession,
      'document.elementFromPoint('+((left+right)/2)+','+((top+bottom)/2)+')===document.querySelector("#sidebar-tool-frame iframe")');
    return {...focus,fullyVisible,hit:focus.hit&&outerHit,
      indicator:focus.focusVisible && focus.outline.width >= 1 && focus.outline.style !== 'none',
      // A box shadow alone needs screenshot review instead of an invented ratio.
      shadowOnly:focus.outline.width < 1 && focus.boxShadow !== 'none'};
  };
  const auditView = async (label, row) => {
    const {ui,panel} = await verifyIdentity();
    const view = {view:ui.view,metrics:ui,host:panel,checks:{},keyboard:{trace:[],focused:[]}};
    row.views.push(view);
    view.screenshot = await snap(label+'-view');
    view.checks.layout = ui.overflow.document || ui.overflow.app || panel.overflow || ui.outside.length ? 'FAIL' : 'PASS';
    const eligible = ui.text.filter(x => x.status !== 'EXEMPT_DISABLED');
    view.contrast = {samples:eligible.length,minimumRatio:eligible.filter(x=>x.ratio!==null)
      .reduce((min,x)=>Math.min(min,x.ratio),Infinity),
      failures:eligible.filter(x=>x.status==='FAIL'),unknown:eligible.filter(x=>x.status==='NOT_TESTED')};
    if (!Number.isFinite(view.contrast.minimumRatio)) view.contrast.minimumRatio = null;
    view.checks.textContrast = summarize(eligible.map(x=>x.status));
    try {
      const tree = await client.send('Accessibility.getFullAXTree',{},reactSession);
      view.ax = tree.nodes.filter(x=>!x.ignored && ['button','switch','checkbox','link'].includes(x.role?.value))
        .map(x=>({id:x.nodeId,backendNodeId:x.backendDOMNodeId,role:x.role.value,name:x.name?.value||'',properties:x.properties}));
      view.checks.accessibleNames = !view.ax.length ? 'NOT_TESTED' :
        view.ax.some(x=>!x.name.trim()) || ui.controls.some(x=>!x.name.trim()||x.hiddenFromAX) ? 'FAIL' : 'PASS';
    } catch (error) { view.axError=String(error.message||error); view.checks.accessibleNames='NOT_TESTED'; }
    const expected = ui.controls.filter(x=>!x.disabled);
    const wanted = new Set(expected.filter(x=>x.tabIndex>=0).map(x=>x.key)), seen = new Set();
    for (let step=0;step<90 && seen.size<wanted.size;step++) {
      await key('Tab');
      const focus = await inspectFocus();
      view.keyboard.trace.push({key:'Tab',focus});
      if (!focus || seen.has(focus.key) || !wanted.has(focus.key)) continue;
      seen.add(focus.key);
      const sample = {...focus,screenshot:await snap(label+'-focus-'+seen.size)};
      view.keyboard.focused.push(sample);
    }
    view.keyboard.unreachable = expected.filter(x=>!seen.has(x.key));
    view.checks.tabReachability = view.keyboard.unreachable.length ? 'FAIL' : expected.length ? 'PASS' : 'NOT_TESTED';
    const focuses = view.keyboard.focused;
    view.checks.visibleFocus = focuses.length ? summarize(focuses.map(x=>
      !x.fullyVisible || !x.hit ? 'FAIL' : x.indicator ?
        x.outlineContrast === null ? 'NOT_TESTED' : x.outlineContrast >= 3 ? 'PASS' : 'FAIL' :
        x.shadowOnly ? 'NOT_TESTED' : 'FAIL')) : 'NOT_TESTED';
    // Check real reverse order from a known React focus, including boundary exit.
    const last = focuses.at(-1);
    if (last) {
      await key('Tab',true);
      const reverse = await inspectFocus(), outer = await host();
      view.keyboard.reverse = {key:'Shift+Tab',before:last,after:reverse,hostActive:outer.active};
      view.checks.reverseTab = reverse ? reverse.key !== last.key && reverse.fullyVisible ? 'PASS' : 'FAIL' :
        !outer.active.inIframe && outer.active.tag !== 'BODY' ? 'PASS' : 'NOT_TESTED';
    } else view.checks.reverseTab='NOT_TESTED';
    view.status=summarize(Object.values(view.checks));
    return view;
  };
  const overview = async trace => {
    if ((await read()).view !== 'overview')
      await keyboardNavigate('react',backSelector,'overview',trace);
  };
  const capture = async row => {
    row.views=[];row.navigation=[];row.returns=[];
    result.cases.push(row);
    await overview(row.navigation);
    await until(async()=>!(await read()).statusText.includes('正在核对'),'AdBlock status loaded',8000);
    const name=row.label;
    await auditView(name+'-overview',row);
    const routes=[
      {scope:'react',selector:'.adblock-link',view:'已停用的网站',name:'exceptions'},
      {scope:'react',selector:'.adblock-manual-actions button:nth-child(2)',view:'手动屏蔽规则',name:'cosmetics'},
      {scope:'host',selector:settingsSelector,view:'设置说明',name:'settings'},
    ];
    for(const route of routes) {
      const disabled=await evaluate(client,route.scope==='host'?hostSession:reactSession,
        '(()=>{const n=document.querySelector('+JSON.stringify(route.selector)+');return !n||n.disabled})()');
      if(disabled){row.navigation.push({...route,status:'NOT_TESTED',reason:'Real navigation control is absent/disabled'});continue;}
      await keyboardNavigate(route.scope,route.selector,route.view,row.navigation);
      await auditView(name+'-'+route.name,row);
      await keyboardNavigate('react',backSelector,'overview',row.navigation);
      const restored=await activeMatches(route.scope,route.selector);
      row.returns.push({from:route.name,status:restored?'PASS':'FAIL',expected:route.selector,
        actual:(await read()).focus,hostActive:(await host()).active,
        screenshot:await snap(name+'-'+route.name+'-return')});
    }
    row.status=summarize([...row.views.map(x=>x.status),...row.returns.map(x=>x.status),
      ...(row.views.length===4?[]:['NOT_TESTED'])]);
  };
  try {
    const first = await verifyIdentity();
    initialEnvironment=first;
    result.identity={...identity,extensionId:first.panel.extensionId};
    await client.send('Page.bringToFront',{},hostSession);
    if (!nativeEnvironment) {
      result.limitations.push('Native width/zoom adapter absent: current installed viewport only; all 16 matrix cells NOT_TESTED.');
      await capture({label:'current-installed',requested:null,environment:first});
    } else {
      original=await nativeEnvironment.read();
      if (!Number.isFinite(original?.backingScaleFactor) || original.backingScaleFactor <= 0)
        throw issue('Native display backingScaleFactor is missing');
      for(const cell of result.matrix) {
        try {
          environmentTouched=true;
          cell.input=await nativeEnvironment.apply({width:cell.width,zoom:cell.zoom});
          if(cell.input?.widthMethod!=='native-splitter' || !cell.input.zoomMethod || !cell.input.evidence ||
              /emulat|device.?scale|page.?scale|css|mock|preview/i.test(cell.input.zoomMethod))
            throw issue('Missing genuine native splitter/browser zoom receipts');
          mediaTouched=true;
          for(const session of [hostSession,reactSession])
            await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:cell.theme}]},session);
          const measured=await until(async()=>{
            const sample=await verifyIdentity(), native=await nativeEnvironment.read();
            const factor=sample.ui.viewport.dpr/native.backingScaleFactor;
            return near(sample.ui.viewport.width,cell.width,1) && near(factor,cell.zoom,.025) &&
              near(sample.panel.dpr/native.backingScaleFactor,cell.zoom,.025) &&
              near(sample.ui.viewport.visualScale,1,.01) && near(sample.panel.visualScale,1,.01) &&
              sample.ui.theme[cell.theme] ? {...sample,native,actualZoom:factor} : null;
          },'Actual installed AdBlock width/theme/browser zoom',5000);
          cell.measured=measured;
          await capture({label:cell.width+'-'+cell.theme+'-'+cell.zoom,requested:{width:cell.width,theme:cell.theme,zoom:cell.zoom},environment:measured});
          cell.caseIndex=result.cases.length-1;cell.status=result.cases.at(-1).status;
        } catch(error) {
          cell.reason=String(error.message||error);cell.status='NOT_TESTED';
          cell.failureScreenshot=await snap('unverified-'+cell.width+'-'+cell.theme+'-'+cell.zoom).catch(()=>null);
          if(error.code!=='E_ADBLOCK_LAYOUT_UNREACHABLE') throw error;
        }
      }
    }
  } catch(error) {
    result.error={message:String(error.message||error),code:error.code||null};
    result.failureScreenshot=await snap('failure').catch(()=>null);
  } finally {
    // Navigation/media/geometry restoration cannot hide a failed evidence case.
    if(identity) {
      try {await overview([]);result.cleanup.push({operation:'return-overview',status:'PASS'});}
      catch(error){result.cleanup.push({operation:'return-overview',status:'FAIL',error:String(error.message||error)});}
    }
    if(mediaTouched) {
      for(const [scope,session] of [['host',hostSession],['react',reactSession]]) {
        try {await client.send('Emulation.setEmulatedMedia',ctx.restoreMedia?.[scope]||{features:[]},session);
          result.cleanup.push({operation:'restore-media-'+scope,status:'PASS'});}
        catch(error){result.cleanup.push({operation:'restore-media-'+scope,status:'FAIL',error:String(error.message||error)});}
      }
    }
    if(environmentTouched) {
      try {const receipt=await nativeEnvironment.restore(original);
        const after=await verifyIdentity(), native=await nativeEnvironment.read();
        const factor=after.ui.viewport.dpr/native.backingScaleFactor;
        const before=result.matrix.find(x=>x.measured)?.measured;
        // The adapter owns restoring original splitter/window state; preserve
        // its independent receipt rather than infer restoration from a width.
        result.cleanup.push({operation:'restore-native-environment',status:receipt?'PASS':'NOT_TESTED',receipt,
          original,after:{native,viewport:after.ui.viewport,actualZoom:factor},hadMeasuredCase:!!before});}
      catch(error){result.cleanup.push({operation:'restore-native-environment',status:'FAIL',error:String(error.message||error)});}
    }
    const statuses=[result.sourceBinding,...result.matrix.map(x=>x.status),...result.cases.flatMap(x=>
      [x.status,...(x.views||[]).flatMap(v=>Object.values(v.checks)),...(x.returns||[]).map(r=>r.status)]),
      ...result.cleanup.map(x=>x.status)];
    if(result.error) statuses.push(result.error.code==='E_ADBLOCK_LAYOUT_UI_FAILURE'?'FAIL':'NOT_TESTED');
    result.status=summarize(statuses);
    result.finishedAt=new Date().toISOString();
  }
  return result;
}
