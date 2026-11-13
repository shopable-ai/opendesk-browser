// Run with: ego-browser nodejs < projects/mouse-gestures/experiments/cdp-document-routing.mjs
// A diagnostic on this task's disposable fixture, not a native input adapter.
const { createServer } = await import('node:http');
const { mkdir, writeFile } = await import('node:fs/promises');
const outputDirectory = '/Users/shopme/Documents/workspace/opendesk-browser/artifacts/sidebar-tools/mouse-gestures';
const server = createServer((request, response) => {
  const documentName = request.url === '/b' ? 'B' : 'A';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`<!doctype html><title>Routing fixture ${documentName}</title>
    <style>body{margin:32px}#pad{width:360px;height:180px;background:#ddd}</style>
    <h1>Document ${documentName}</h1><div id="pad">Disposable input target</div>
    <script>
      window.routingFixture = { documentName: '${documentName}', events: [] };
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'contextmenu']) {
        document.addEventListener(type, event => window.routingFixture.events.push({
          type, button: event.button, trusted: event.isTrusted,
          target: event.target.id, documentName: window.routingFixture.documentName
        }), true);
      }
    </script>`);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const task = await taskSpace('mouse-gestures-document-routing-01a1d4fd');
  console.log({ taskSpaceId: task.spaceId });
  const page = task.page('p1');
  await page.goto(`${origin}/a`);
  const browserVersion = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    brands: navigator.userAgentData?.brands ?? [],
    source: 'Page navigator; not an installed product identity or OS input proof'
  }));
  await page.cdp('Runtime.enable');
  const targetA = page.targetId;
  const frameA = (await page.cdp('Page.getFrameTree')).frameTree.frame;
  const { executionContextId: contextA } = await page.cdp('Page.createIsolatedWorld', {
    frameId: frameA.id, worldName: 'mouse-gestures-routing-probe'
  });
  const acknowledgementA = (await page.cdp('Runtime.evaluate', {
    expression: '({url:location.href, ready:document.readyState})',
    contextId: contextA, returnByValue: true
  })).result.value;

  // Positive control: the exact tab-scoped command reaches the current fixture.
  const sendRightClick = async () => {
    const point = await page.evaluate(() => {
      const rect = document.querySelector('#pad').getBoundingClientRect();
      return { x: rect.x + 80, y: rect.y + 50 };
    });
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
    await page.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', buttons: 2, clickCount: 1 });
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'right', buttons: 0, clickCount: 1 });
  };
  await sendRightClick();
  const sameDocumentEvents = await page.evaluate(() => window.routingFixture.events);

  // Replace A after its acknowledgement. No timing race or arbitrary sleep is needed.
  await page.goto(`${origin}/b`);
  const frameB = (await page.cdp('Page.getFrameTree')).frameTree.frame;
  let oldContextRejected = false;
  try {
    const reply = await page.cdp('Runtime.evaluate', {
      expression: 'location.href', contextId: contextA, returnByValue: true
    });
    oldContextRejected = Boolean(reply.exceptionDetails || reply.error);
  } catch {
    oldContextRejected = true;
  }
  await sendRightClick();
  const replacementEvents = await page.evaluate(() => window.routingFixture.events);
  const receivedByB = replacementEvents.some(event =>
    event.type === 'mousedown' && event.button === 2 && event.trusted && event.documentName === 'B');
  const report = {
    scope: 'Disposable ego HTTP fixture; no native capture, installed extension or OS menu verification',
    browserVersion,
    acknowledgementA,
    identities: { targetStable: targetA === page.targetId, frameA: frameA.id, frameB: frameB.id,
      loaderChanged: frameA.loaderId !== frameB.loaderId, contextA },
    sameDocumentEvents,
    oldContextRejected,
    replacementEvents,
    verdict: receivedByB ? 'FAIL_DOCUMENT_CONDITIONAL_DELIVERY' : 'INCONCLUSIVE',
    limitation: 'Disproves a prior document acknowledgement followed by tab-scoped CDP Input; does not disprove every native or browser-level route.'
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/cdp-document-routing.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(report);
  await task.finish({ keep: [] });
} finally {
  await new Promise(resolve => server.close(resolve));
}
