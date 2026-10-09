// Read-only observer. No input, focus, navigation, listener, permission,
// storage, debugger breakpoint, import, or program execution operations.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [sessionPath, outputPath, phase] = process.argv.slice(2);
if (!sessionPath || !outputPath || !/^[a-zA-Z0-9_-]+$/.test(phase || '')) throw Error('session, new output path and phase required');
const sessionBytes = await readFile(sessionPath);
const session = JSON.parse(sessionBytes);
const checkout = path.resolve(session.extension, '../..');
const helperPath = path.join(checkout, 'tests/framework/sidebar-native-session.mjs');
const {connect, evaluate} = await import(pathToFileURL(helperPath).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const client = await connect(session.endpoint);
try {
  const targets = (await client.send('Target.getTargets')).targetInfos;
  const target = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:43111/demo-form.html'));
  if (!target) throw Error('Standard Demo page not observed');
  const {sessionId} = await client.send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
  const observation = await evaluate(client, `(() => {
    const ids = ['sample.page-ui-basic.panel', 'sample.page-ui-basic.launcher'];
    const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const hosts = [...document.querySelectorAll('[data-od-id]')].filter(n => ids.includes(n.dataset.odId));
    return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},
      cspMeta:[...document.querySelectorAll('meta[http-equiv]')].filter(n => n.httpEquiv.toLowerCase() === 'content-security-policy').map(n => n.content),
      hosts:hosts.map(host => {const root=host.shadowRoot; const panel=root?.querySelector('.page-ui-panel'); return {
        id:host.dataset.odId,owner:host.dataset.opendeskUiOwner,connected:host.isConnected,rect:rect(host),
        hostCSS:{position:getComputedStyle(host).position,top:getComputedStyle(host).top,right:getComputedStyle(host).right},
        panelCSS:panel ? {width:getComputedStyle(panel).width,padding:getComputedStyle(panel).padding,overflow:getComputedStyle(panel).overflow} : null,
        title:root?.querySelector('.page-ui-title')?.textContent,hint:root?.querySelector('.page-ui-hint')?.textContent,
        input:root?.querySelector('input')?.value,status:root?.querySelector('.od-status')?.textContent,
        statusState:root?.querySelector('.od-status')?.dataset.state,result:root?.querySelector('.od-result')?.textContent,
        styles:[...(root?.querySelectorAll('style')||[])].map(n => n.textContent),
        buttons:[...(root?.querySelectorAll('button')||[])].map(n => ({text:n.textContent,hidden:n.hidden,disabled:n.disabled,rect:rect(n)})),
        images:[...(root?.querySelectorAll('img')||[])].map(n => ({src:n.currentSrc||n.src,complete:n.complete,naturalWidth:n.naturalWidth,naturalHeight:n.naturalHeight,rect:rect(n)}))
      };}),
      resourceTiming:performance.getEntriesByType('resource').map(n => ({name:n.name,initiatorType:n.initiatorType,startTime:n.startTime,duration:n.duration}))};
  })()`, sessionId);
  for (const host of observation.hosts) {
    host.styleHashes = host.styles.map(text => hash(Buffer.from(text)));
    for (const image of host.images) {
      if (image.src.startsWith('data:image/')) {
        const bytes = Buffer.from(image.src.split(',')[1], 'base64');
        image.resourceSha256 = hash(bytes); image.resourceBytes = bytes.length;
      }
    }
  }
  const report = {at:new Date().toISOString(),phase,readOnly:true,
    sourceSession:{path:path.resolve(sessionPath),sha256:hash(sessionBytes)},
    helper:{path:helperPath,sha256:hash(await readFile(helperPath))},
    observerSha256:hash(await readFile(new URL(import.meta.url))),
    packageHash:session.package.packageHash,extensionId:session.extensionId,browserVersion:session.version,
    target,hostCount:observation.hosts.length,observation};
  await writeFile(outputPath, JSON.stringify(report,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify({phase,hostCount:report.hostCount,hosts:observation.hosts.map(h=>({id:h.id,status:h.status,images:h.images.map(i=>({decoded:i.complete&&i.naturalWidth>0,sha256:i.resourceSha256}))}))}));
} finally {client.close();}
