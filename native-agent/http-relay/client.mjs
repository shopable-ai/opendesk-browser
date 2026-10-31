// Shared wire helpers for local CLI/tests. Browser adapter owns its own WebCrypto implementation.
import http from 'node:http';
import { LIMIT, HOST, PORT, sign, unsigned, hash, equal, mac } from './protocol.mjs';
export function post(path, value, { origin } = {}) {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > LIMIT) return Promise.reject(new Error('REQUEST_TOO_LARGE'));
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path, method: 'POST', agent: false, headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 17000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > LIMIT) res.destroy(new Error('RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('RPC_TIMEOUT'))); req.end(data);
  });
}
export function verifyResponse(key, request, response) {
  if (response.v !== request.v || response.clientId !== request.clientId || response.generation !== request.generation || response.sessionId !== request.sessionId || response.id !== request.id || response.seq !== request.seq || response.requestHash !== hash(unsigned(request)) || !equal(response.mac, mac(key, unsigned(response)))) throw new Error('RESPONSE_AUTH');
  return response;
}
export const envelope = (key, identity, seq, id, method, body) => sign(key, { v: 1, ...identity, seq, id, method, body });
