import {fail, SDK_LIMITS} from './registry.js';
const address = server => {
  if (typeof server !== 'string') throw fail('E_SCHEMA');
  return server.startsWith('http') ? server : `http://${server}`;
};
export function createServers(call) {
  const checkServer = (server, timeout = 5000) => call('SERVER_CHECK', {server: address(server), timeout});
  async function checkServers(servers, timeout = 5000) {
    if (!Array.isArray(servers) || servers.length > SDK_LIMITS.pending) throw fail('E_SCHEMA');
    const results = await Promise.all(servers.map(server => checkServer(server, timeout)));
    const fastestResult = results.reduce((best, result) => result.available && Number.isFinite(result.latency) &&
      (best === null || result.latency < best.latency) ? result : best, null);
    return {results, fastestResult};
  }
  return Object.freeze({checkServer, checkServers, getFastestServer: async (servers, timeout) => (await checkServers(servers, timeout)).fastestResult});
}
