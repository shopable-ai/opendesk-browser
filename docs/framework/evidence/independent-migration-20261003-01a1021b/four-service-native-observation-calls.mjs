// Independent observation fixtures. No browser launch, build, grants, sender,
// journal substitution, or SDK implementation. Use only on a real installed page.
export async function observeOldLog() {
  const bridge = service.bridge;
  const result = await bridge.send('log', {message: '迁移验收', data: [0, false]});
  return {ownData: Object.hasOwn(result, 'data'), undefinedData: result.data === undefined};
}
export async function observeOldGetTime() {
  const bridge = service.bridge;
  const result = await bridge.send('getTime');
  return {ownData: Object.hasOwn(result, 'data'), value: result.data, type: typeof result.data};
}
export async function observeOldBexUrl() {
  const bridge = service.bridge;
  const result = await bridge.send('bexUrl');
  return {ownData: Object.hasOwn(result, 'data'), value: result.data, url: result.data?.url};
}
export async function observeOldRequestResource(url) {
  const bridge = service.bridge;
  const result = await bridge.send('requestResource', {url});
  const inner = result.data;
  const bytes = typeof inner?.data === 'string' ? new TextEncoder().encode(inner.data) : null;
  const sha256 = bytes ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('') : null;
  return {ownData: Object.hasOwn(result, 'data'), value: inner, bytes: bytes?.byteLength, sha256};
}
export async function observeOldBridgeError(name, args) {
  const bridge = service.bridge;
  try { return {resolved: true, value: await bridge.send(name, args)}; }
  catch (error) { return {resolved: false, error: {code: error?.code, message: error?.message}}; }
}
// Render observations only. The runner must assert expected values and persist
// raw output before calling this; a rendered page is not an acceptance verdict.
export function renderNativeObservation(name, observation) {
  let element = document.getElementById('independent-four-service-result');
  if (!element) {
    element = document.createElement('pre');
    element.id = 'independent-four-service-result';
    element.style.cssText = 'white-space:pre-wrap;padding:20px;font-size:18px;background:white;color:black';
    document.body.appendChild(element);
  }
  const visible = observation?.value?.data && typeof observation.value.data === 'string'
    ? {...observation, value: {...observation.value, data: observation.value.data.slice(0,160) + '…'}}
    : observation;
  element.textContent = name + '\n' + JSON.stringify(visible, null, 2);
}
