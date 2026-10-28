import {runCapture} from './capture.js';

export default async function main() {
  if (!params || typeof params.configJson !== 'string' || params.configJson.length>4096) throw new Error('E_CAPTURE_CONFIG');
  if (params.optionsJson !== undefined && (typeof params.optionsJson !== 'string' || params.optionsJson.length>4096)) throw new Error('E_CAPTURE_CONFIG');
  const options=JSON.parse(params.optionsJson||'{}');
  return runCapture({...options,url:params.url,itemConfig:JSON.parse(params.configJson),
    waitForSelector:params.waitForSelector||undefined,timeoutMs:params.timeoutMs??30000},page);
}
