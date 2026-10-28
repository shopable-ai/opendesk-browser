import {runCapture} from '../controller/capture.js';
import {listDetail} from './configs.js';
export default async function main() {
  return runCapture({...listDetail,url:params.url??listDetail.url},page);
}
