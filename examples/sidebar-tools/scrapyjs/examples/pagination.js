import {runCapture} from '../controller/capture.js';
import {pagination} from './configs.js';
export default async function main() {
  // .ready must mean this entire document has finished loading its records.
  return runCapture({...pagination,url:params.url??pagination.url},page);
}
