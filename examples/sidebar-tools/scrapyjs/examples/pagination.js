import {runCapture} from '../controller/capture.js';
import {pagination} from './configs.js';
export default async function main() {
  return runCapture({...pagination,url:params.url??pagination.url},page);
}
