// Preserve the old content-script bridge consumers, without executing resource
// text. Installation continues to use the broker's fixed ISOLATED/MAIN files.
export function createResourceConsumers(service) {
  const bridge = service.bridge;
  async function requestResourceByBridge(url) {
    let {data} = await bridge.send('requestResource', {url});
    return data;
  }
  async function getBexUrlByBridge() {
    let {data} = await bridge.send('bexUrl');
    return data.url;
  }
  return Object.freeze({requestResourceByBridge, getBexUrlByBridge});
}
